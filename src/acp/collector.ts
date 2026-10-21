import type { PromptResponse, SessionNotification } from '@agentclientprotocol/sdk';
import type { Usage } from '../contract.ts';

// Folds the session/update stream and prompt responses into the run result (DESIGN §4.3).

/** `_meta.jetbrains.air.sessionFailure` of codex-acp (AIR `sessionFailure` capability); one `id` across its revisions. */
interface SessionFailure {
    id?: string;
    revision?: number;
    category?: string;
    severity: 'error' | 'warning';
    title: string;
    details?: string;
}

export interface TurnFailure {
    category?: string;
    title: string;
}

/** `failureId` ties a warning to a session failure, whose later revisions replace its text. */
interface Warning {
    text: string;
    failureId?: string;
    revision?: number;
}

export class Collector {
    #text = '';
    #finalText = '';
    /** Agent text received outside a prompt turn. */
    #preTurn = '';
    #inTurn = false;
    #usage: Usage = {};
    #warnings: Warning[] = [];
    #turnFailure: TurnFailure | undefined;
    #lastToolTitle: string | undefined;
    /** Agent text outside a turn that matches any of these is dropped instead of becoming a warning. */
    preTurnNoise: RegExp[] = [];

    /**
     * Starts a new prompt turn: `text` only ever holds the latest turn. Text the agent sent outside a turn
     * (e.g. claude-agent-acp announcing a permission-mode fallback right after set_mode) becomes a warning.
     */
    startTurn(): void {
        const before = this.#preTurn.trim();
        if (before) this.#warn(`agent message before the task: ${before.slice(0, 300)}`);
        this.#preTurn = '';
        this.#text = '';
        this.#finalText = '';
        this.#turnFailure = undefined;
        this.#inTurn = true;
    }

    handle(notification: SessionNotification): void {
        const update = notification.update;
        switch (update.sessionUpdate) {
            case 'agent_message_chunk':
                if (update.content.type === 'text') {
                    if (this.#inTurn) {
                        this.#text += update.content.text;
                        this.#finalText += update.content.text;
                    } else if (!this.#isNoise(update.content.text)) this.#preTurn += update.content.text;
                }
                break;
            case 'tool_call':
                this.#lastToolTitle = update.title;
                if (this.#inTurn) this.#finalText = '';
                break;
            case 'tool_call_update':
                if (update.title != null) this.#lastToolTitle = update.title;
                break;
            case 'usage_update':
                if (update.cost != null) this.#usage.cost_usd = update.cost.amount;
                break;
            case 'notice':
                this.#warn(
                    update.description
                        ? `${update.severity}: ${update.title} — ${update.description}`
                        : `${update.severity}: ${update.title}`
                );
                break;
            case 'session_info_update':
                this.#failure(sessionFailure(update._meta), false);
                break;
        }
    }

    #isNoise(text: string): boolean {
        return this.preTurnNoise.some(pattern => pattern.test(text));
    }

    endTurn(response: PromptResponse): void {
        this.#failure(sessionFailure(response._meta), true);
        this.#inTurn = false;
        if (response.usage != null) {
            this.#usage.input_tokens = (this.#usage.input_tokens ?? 0) + response.usage.inputTokens;
            this.#usage.output_tokens = (this.#usage.output_tokens ?? 0) + response.usage.outputTokens;
        }
    }

    /**
     * An error in the PromptResponse fails the turn; anything else is a warning. codex-acp reports the current
     * turn's own failure only in its PromptResponse; its `session_info_update` errors are of other turns or
     * arrive after the prompt.
     */
    #failure(failure: SessionFailure | undefined, fromResponse: boolean): void {
        if (!failure) return;
        if (failure.severity === 'error' && fromResponse) {
            this.#turnFailure = {
                ...(failure.category !== undefined ? { category: failure.category } : {}),
                title: failure.title,
            };
            return;
        }
        const category = failure.category === undefined ? '' : ` (${failure.category})`;
        const details = failure.details ? ` — ${failure.details}` : '';
        const text = `${failure.severity}${category}: ${failure.title}${details}`;
        const earlier = failure.id === undefined ? undefined : this.#warnings.find(w => w.failureId === failure.id);
        if (!earlier) {
            this.#warn(text, failure);
            return;
        }
        // A revision older than the one shown arrived late.
        if ((failure.revision ?? Infinity) < (earlier.revision ?? -Infinity)) return;
        earlier.text = text;
        if (failure.revision !== undefined) earlier.revision = failure.revision;
    }

    #warn(text: string, failure?: SessionFailure): void {
        if (!failure?.id && this.#warnings.some(w => w.text === text && w.failureId === undefined)) return;
        this.#warnings.push({
            text,
            ...(failure?.id !== undefined ? { failureId: failure.id } : {}),
            ...(failure?.revision !== undefined ? { revision: failure.revision } : {}),
        });
    }

    /** Agent text of the last turn. */
    get text(): string {
        return this.#text;
    }

    /** The last turn's final message: its agent text after the last `tool_call` (DESIGN §6). */
    get finalText(): string {
        return this.#finalText;
    }

    get usage(): Usage {
        return { ...this.#usage };
    }

    get warnings(): string[] {
        return [...new Set(this.#warnings.map(w => w.text))];
    }

    /** The current turn's failure, from a severity-`error` session failure in its PromptResponse (DESIGN §4.3); cleared by `startTurn`. */
    get turnFailure(): TurnFailure | undefined {
        return this.#turnFailure;
    }

    /** Title of the latest tool call seen; progress reports it. */
    get lastToolTitle(): string | undefined {
        return this.#lastToolTitle;
    }
}

/** The session failure in `meta`, or undefined when absent or malformed. */
function sessionFailure(meta: unknown): SessionFailure | undefined {
    const raw = field(field(field(meta, 'jetbrains'), 'air'), 'sessionFailure');
    if (typeof raw !== 'object' || raw === null) return undefined;
    const { id, revision, category, severity, title, details } = raw as Record<string, unknown>;
    if ((severity !== 'error' && severity !== 'warning') || typeof title !== 'string') return undefined;
    return {
        severity,
        title,
        ...(typeof id === 'string' ? { id } : {}),
        ...(typeof revision === 'number' ? { revision } : {}),
        ...(typeof category === 'string' ? { category } : {}),
        ...(typeof details === 'string' ? { details } : {}),
    };
}

function field(value: unknown, key: string): unknown {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}
