import type { RequestPermissionRequest, RequestPermissionResponse } from '@agentclientprotocol/sdk';
import type { ElicitRequestFormParams, ElicitResult } from '@modelcontextprotocol/sdk/types.js';
import {
    type Config,
    customHarnessEntry,
    type HarnessMode,
    type PermissionAnswers,
    type PermissionPolicy,
} from './config.ts';
import { isBuiltinHarness } from './contract.ts';
import { log } from './log.ts';

// Permission settings (DESIGN §5): the harness mode and the answers to `session/request_permission`.

type Outcome = RequestPermissionResponse['outcome'];
type OptionKind = RequestPermissionRequest['options'][number]['kind'];

/** The MCP client's elicitation, form mode; absent on RunContext when the client lacks the capability. */
export interface Elicitation {
    /** `server.server.elicitInput`; rejects on `signal` abort and after `timeoutMs`. */
    ask(params: ElicitRequestFormParams, opts: { signal: AbortSignal; timeoutMs: number }): Promise<ElicitResult>;
}

export interface DeciderOptions {
    elicitation?: Elicitation;
    /** `limits.elicitation_s * 1000`. */
    elicitationTimeoutMs: number;
    /** The thronglet's description, naming it in the elicitation message; empty → `agent`. */
    description?: string;
}

/** One answered request, for the server log. `choice` is the selected optionId or `cancelled`. */
export interface PermissionDecision {
    title: string;
    kind: string;
    choice: string;
}

/** Decides one request; `signal` aborts when the bridge is cancelled (a pending elicitation stops waiting). */
export type Decide = (request: RequestPermissionRequest, signal: AbortSignal) => Promise<Outcome>;

export interface PermissionBridge {
    /** `knownTitle`: the title an earlier `tool_call` / `tool_call_update` gave the same `toolCallId`. */
    answer(request: RequestPermissionRequest, knownTitle?: string): Promise<RequestPermissionResponse>;
    /** Answers every pending request `cancelled` (DESIGN §4.2 cancel path); later requests too. */
    cancelAll(): void;
}

/** Resolved permission settings of one harness and the config keys they come from (DESIGN §5). */
export interface PermissionSettings {
    mode: HarnessMode;
    answers: PermissionAnswers;
    /** Config key `answers` came from, for error messages: `permission_answers`, `harnesses.codex.permissions`, … */
    answersKey: string;
}

/** The permission keys of one config place, as parsed. */
interface PermissionKeys {
    permissions?: PermissionPolicy | undefined;
    harness_mode?: HarnessMode | undefined;
    permission_answers?: PermissionAnswers | undefined;
}

/** What each `permissions` shorthand value stands for. */
const SHORTHAND: Record<PermissionPolicy, { mode: HarnessMode; answers: PermissionAnswers }> = {
    auto: { mode: 'auto', answers: 'deny' },
    allow_all: { mode: 'ask', answers: 'allow' },
    deny_all: { mode: 'ask', answers: 'deny' },
    elicit: { mode: 'ask', answers: 'elicit' },
};

/** One place's values with the shorthand expanded, each answer with the key it came from. */
function expand(
    place: PermissionKeys | undefined,
    prefix: string
): { mode?: HarnessMode; answers?: Pick<PermissionSettings, 'answers' | 'answersKey'> } {
    if (!place) return {};
    if (place.permissions) {
        const { mode, answers } = SHORTHAND[place.permissions];
        return { mode, answers: { answers, answersKey: `${prefix}permissions` } };
    }
    return {
        ...(place.harness_mode ? { mode: place.harness_mode } : {}),
        ...(place.permission_answers
            ? { answers: { answers: place.permission_answers, answersKey: `${prefix}permission_answers` } }
            : {}),
    };
}

/**
 * The permission settings of `harness`: per key, the harness's entry, else the global value, else the default (`auto`
 * mode, `deny` answers). Config-only, never a tool parameter. The entry is the custom harness's if one exists, else the
 * built-in override of that id: a custom entry wins even when only the built-in override sets a key.
 */
export function resolvePermissions(config: Config, harness: string): PermissionSettings {
    const custom = customHarnessEntry(config, harness);
    const entry = custom ?? (isBuiltinHarness(harness) ? config.harnesses[harness] : undefined);
    const own = expand(entry, `${custom ? 'custom_harnesses' : 'harnesses'}.${harness}.`);
    const global = expand(config, '');
    return {
        mode: own.mode ?? global.mode ?? 'auto',
        ...(own.answers ?? global.answers ?? { answers: 'deny', answersKey: 'permission_answers' }),
    };
}

const CANCELLED: Outcome = { outcome: 'cancelled' };

/** The first option of `kind` as a selected outcome, else `undefined`. */
function pick(request: RequestPermissionRequest, kind: OptionKind): Outcome | undefined {
    const option = request.options.find(o => o.kind === kind);
    return option ? { outcome: 'selected', optionId: option.optionId } : undefined;
}

/**
 * `reject_once` picked by kind (ids differ per agent); without one, `cancelled`. The default answer (decision-9): whatever
 * the harness's own auto mode does not approve is refused, so the default never widens into allowing.
 */
export const decideReject: Decide = request => Promise.resolve(pick(request, 'reject_once') ?? CANCELLED);

/** `allow_once` by kind; without one `reject_once`, else `cancelled`. Never `allow_always`. */
const decideAllow: Decide = request =>
    Promise.resolve(pick(request, 'allow_once') ?? pick(request, 'reject_once') ?? CANCELLED);

const ONCE_KINDS: readonly OptionKind[] = ['allow_once', 'reject_once'];
const RAW_INPUT_LIMIT = 2048;
const DESCRIPTION_LIMIT = 80;

/**
 * The thronglet's description as one bounded line: it comes from the calling model, and a newline in it could forge the
 * kind and input lines the human decides by.
 */
function descriptionLabel(description: string): string {
    const line = description.replace(/\s+/g, ' ').trim();
    if (!line) return 'agent';
    return line.length > DESCRIPTION_LIMIT ? `${line.slice(0, DESCRIPTION_LIMIT)}…` : line;
}

/** The elicitation's text (DESIGN §5): title, then kind, rawInput (truncated) and locations when present. */
function elicitationMessage(toolCall: RequestPermissionRequest['toolCall'], description: string): string {
    const lines = [`[${descriptionLabel(description)}] ${toolCall.title ?? toolCall.toolCallId}`];
    if (toolCall.kind) lines.push(`kind: ${toolCall.kind}`);
    if (toolCall.rawInput !== undefined) {
        const json = JSON.stringify(toolCall.rawInput);
        lines.push(
            json.length > RAW_INPUT_LIMIT
                ? `input: ${json.slice(0, RAW_INPUT_LIMIT)}… (truncated, ${json.length} chars)`
                : `input: ${json}`
        );
    }
    if (toolCall.locations?.length) lines.push(`locations: ${toolCall.locations.map(l => l.path).join(', ')}`);
    return lines.join('\n');
}

/** Asks the human through the MCP client; any failure (timeout, transport gone, bad answer) → `cancelled`. */
function decideByElicitation(elicitation: Elicitation, timeoutMs: number, description: string): Decide {
    return async (request, signal) => {
        const choices = new Map<string, RequestPermissionRequest['options'][number]>();
        for (const option of request.options) {
            if (ONCE_KINDS.includes(option.kind) && !choices.has(option.kind)) choices.set(option.kind, option);
        }
        if (choices.size === 0) return CANCELLED;
        let result: ElicitResult;
        try {
            result = await elicitation.ask(
                {
                    mode: 'form',
                    message: elicitationMessage(request.toolCall, description),
                    requestedSchema: {
                        type: 'object',
                        properties: {
                            decision: {
                                type: 'string',
                                title: 'Decision',
                                oneOf: [...choices].map(([kind, option]) => ({ const: kind, title: option.name })),
                            },
                        },
                        required: ['decision'],
                    },
                },
                { signal, timeoutMs }
            );
        } catch (err) {
            if (!signal.aborted) {
                log.warn('elicitation failed; permission cancelled', {
                    title: request.toolCall.title,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
            return CANCELLED;
        }
        if (result.action === 'decline') return pick(request, 'reject_once') ?? CANCELLED;
        if (result.action !== 'accept') return CANCELLED;
        const decision = result.content?.decision;
        const option = typeof decision === 'string' ? choices.get(decision) : undefined;
        return option ? { outcome: 'selected', optionId: option.optionId } : CANCELLED;
    };
}

/** Whether `answers` route requests to the human: `elicit`, or `auto` when the client has form elicitation. */
export function elicits(answers: PermissionAnswers, elicitation: Elicitation | undefined): boolean {
    return answers === 'elicit' || (answers === 'auto' && elicitation !== undefined);
}

/**
 * The decider for `answers`. `auto` elicits when it can and rejects otherwise. `elicit` without an elicitation answers
 * `cancelled`; run.ts refuses that combination before spawn (`elicitation_unsupported`).
 */
export function deciderFor(answers: PermissionAnswers, opts: DeciderOptions): Decide {
    if (opts.elicitation && elicits(answers, opts.elicitation)) {
        return decideByElicitation(opts.elicitation, opts.elicitationTimeoutMs, opts.description ?? '');
    }
    switch (answers) {
        case 'allow':
            return decideAllow;
        case 'elicit':
            return () => Promise.resolve(CANCELLED);
        case 'auto':
        case 'deny':
            return decideReject;
    }
}

/** The titles throng's submit_result gets, one form per harness (docs/harnesses.md); compared exactly. */
const THRONG_RESULT_TITLES: ReadonlySet<string> = new Set([
    'mcp__throng_result__submit_result', // claude
    'mcp.throng_result.submit_result', // codex, on the earlier tool_call
    'throng_result_submit_result', // opencode
    'throng_result-submit_result: submit_result', // cursor
    'throng_result-submit_result', // copilot, on the earlier tool_call
    'submit_result (throng_result MCP Server)', // gemini <= 0.61; 0.62+ titles it `submit_result(result: …)`
]);

/** Whether `title` is one of `THRONG_RESULT_TITLES`. */
export const isThrongResultTitle = (title: string | null | undefined): boolean =>
    title != null && THRONG_RESULT_TITLES.has(title);

/** submit_result's own input: absent, or an object with no key but `result`. A shell request carries `command`. */
function isSubmitInput(rawInput: unknown): boolean {
    if (rawInput === undefined || rawInput === null) return true;
    if (typeof rawInput !== 'object' || Array.isArray(rawInput)) return false;
    return Object.keys(rawInput).every(key => key === 'result');
}

/**
 * A request for throng's own `submit_result` (DESIGN §5, §6). `knownTitle` is the title an earlier `tool_call` /
 * `tool_call_update` gave the same `toolCallId`. It counts only for a request without a title (codex) or titled only
 * `submit_result` (copilot), and then the kind is not checked: codex marks the request `execute`.
 */
export function isThrongResultCall(toolCall: RequestPermissionRequest['toolCall'], knownTitle?: string): boolean {
    if (!isSubmitInput(toolCall.rawInput)) return false;
    const { title } = toolCall;
    if (isThrongResultTitle(title)) return toolCall.kind !== 'execute';
    return (title == null || title === 'submit_result') && isThrongResultTitle(knownTitle);
}

/** `allow_once` for our own submit_result under every setting; `undefined` → the answers decide. */
function allowOwnTool(request: RequestPermissionRequest, knownTitle: string | undefined): Outcome | undefined {
    const { toolCall } = request;
    if (isThrongResultCall(toolCall, knownTitle)) return pick(request, 'allow_once');
    if (toolCall.title?.includes('submit_result') || knownTitle?.includes('submit_result')) {
        const { rawInput } = toolCall;
        log.warn(
            "permission request names submit_result but its title, kind or input differ from throng_result's known forms; permission_answers decide",
            {
                title: toolCall.title,
                known_title: knownTitle,
                kind: toolCall.kind,
                input_keys:
                    rawInput !== null && typeof rawInput === 'object' && !Array.isArray(rawInput)
                        ? Object.keys(rawInput)
                        : undefined,
            }
        );
    }
    return undefined;
}

export function createPermissionBridge(
    onDecision: (decision: PermissionDecision) => void,
    decide: Decide
): PermissionBridge {
    const controller = new AbortController();
    const pending = new Set<(outcome: Outcome) => void>();

    const report = (request: RequestPermissionRequest, outcome: Outcome) => {
        const { toolCall } = request;
        onDecision({
            title: toolCall.title ?? toolCall.toolCallId,
            kind: toolCall.kind ?? 'other',
            choice: outcome.outcome === 'selected' ? outcome.optionId : 'cancelled',
        });
    };

    return {
        async answer(request, knownTitle) {
            let outcome = controller.signal.aborted ? CANCELLED : allowOwnTool(request, knownTitle);
            if (!outcome) {
                let settle!: (outcome: Outcome) => void;
                const cancelled = new Promise<Outcome>(resolve => (settle = resolve));
                pending.add(settle);
                try {
                    outcome = await Promise.race([decide(request, controller.signal), cancelled]);
                } catch {
                    outcome = CANCELLED;
                } finally {
                    pending.delete(settle);
                }
            }
            report(request, outcome);
            return { outcome };
        },
        cancelAll() {
            controller.abort();
            for (const settle of pending) settle(CANCELLED);
            pending.clear();
        },
    };
}
