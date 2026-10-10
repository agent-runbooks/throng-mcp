import type { RequestPermissionRequest } from '@agentclientprotocol/sdk';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type Config } from './config.ts';
import type { ElicitRequestFormParams, ElicitResult } from '@modelcontextprotocol/sdk/types.js';
import {
    createPermissionBridge,
    deciderFor,
    type Elicitation,
    elicits,
    isThrongResultCall,
    type PermissionDecision,
    resolvePermissions,
} from './permissions.ts';

function request(
    options: RequestPermissionRequest['options'],
    toolCall: RequestPermissionRequest['toolCall'] = { toolCallId: 't1', title: 'write notes.txt', kind: 'edit' }
): RequestPermissionRequest {
    return { sessionId: 's', toolCall, options };
}

const submitCall = { toolCallId: 't9', title: 'mcp.throng_result.submit_result', kind: 'other' } as const;
const deny = deciderFor('deny', { elicitationTimeoutMs: 1000 });
const fullOptions: RequestPermissionRequest['options'] = [
    { optionId: 'always', name: 'Always', kind: 'allow_always' },
    { optionId: 'yes', name: 'Allow', kind: 'allow_once' },
    { optionId: 'never', name: 'Never', kind: 'reject_always' },
    { optionId: 'no', name: 'Reject', kind: 'reject_once' },
];
const onceOptions: RequestPermissionRequest['options'] = [
    { optionId: 'ok', name: 'Allow', kind: 'allow_once' },
    { optionId: 'no', name: 'Reject', kind: 'reject_once' },
];

describe('permissions', () => {
    it('resolvePermissions: the defaults are harness_mode auto and permission_answers deny (= permissions auto)', () => {
        expect(resolvePermissions(DEFAULT_CONFIG, 'opencode')).toStrictEqual({
            mode: 'auto',
            answers: 'deny',
            answersKey: 'permission_answers',
        });
        expect(resolvePermissions(DEFAULT_CONFIG, 'kimi')).toStrictEqual(resolvePermissions(DEFAULT_CONFIG, 'claude'));
    });

    it('resolvePermissions: the permissions shorthand expands to its pair, the answers key naming permissions', () => {
        const expected = {
            auto: { mode: 'auto', answers: 'deny' },
            allow_all: { mode: 'ask', answers: 'allow' },
            deny_all: { mode: 'ask', answers: 'deny' },
            elicit: { mode: 'ask', answers: 'elicit' },
        } as const;
        for (const [policy, pair] of Object.entries(expected)) {
            const permissions = policy as keyof typeof expected;
            expect(resolvePermissions({ ...DEFAULT_CONFIG, permissions }, 'claude'), policy).toStrictEqual({
                ...pair,
                answersKey: 'permissions',
            });
            const entry = { ...DEFAULT_CONFIG, harnesses: { codex: { permissions } } };
            expect(resolvePermissions(entry, 'codex'), policy).toStrictEqual({
                ...pair,
                answersKey: 'harnesses.codex.permissions',
            });
            const custom = { ...DEFAULT_CONFIG, custom_harnesses: { kimi: { command: 'kimi', permissions } } };
            expect(resolvePermissions(custom, 'kimi'), policy).toStrictEqual({
                ...pair,
                answersKey: 'custom_harnesses.kimi.permissions',
            });
        }
    });

    it('resolvePermissions: a per-harness value overrides the global one key by key', () => {
        const config: Config = {
            ...DEFAULT_CONFIG,
            permission_answers: 'elicit',
            harnesses: { codex: { harness_mode: 'ask' } },
        };
        expect(resolvePermissions(config, 'codex')).toStrictEqual({
            mode: 'ask',
            answers: 'elicit',
            answersKey: 'permission_answers',
        });
        expect(resolvePermissions(config, 'claude')).toStrictEqual({
            mode: 'auto',
            answers: 'elicit',
            answersKey: 'permission_answers',
        });
        const answersOnly: Config = {
            ...DEFAULT_CONFIG,
            harness_mode: 'ask',
            harnesses: { codex: { permission_answers: 'allow' } },
        };
        expect(resolvePermissions(answersOnly, 'codex')).toStrictEqual({
            mode: 'ask',
            answers: 'allow',
            answersKey: 'harnesses.codex.permission_answers',
        });
        // The shorthand on the entry sets both keys, over a global pair.
        const shorthand: Config = {
            ...DEFAULT_CONFIG,
            harness_mode: 'ask',
            permission_answers: 'allow',
            harnesses: { codex: { permissions: 'auto' } },
        };
        expect(resolvePermissions(shorthand, 'codex')).toStrictEqual({
            mode: 'auto',
            answers: 'deny',
            answersKey: 'harnesses.codex.permissions',
        });
    });

    it('resolvePermissions: a custom harness entry wins over a built-in override of the same id', () => {
        const config: Config = {
            ...DEFAULT_CONFIG,
            permissions: 'deny_all',
            harnesses: { claude: { permissions: 'elicit' }, codex: { permissions: 'elicit' } },
            custom_harnesses: {
                claude: { command: 'my-claude', permissions: 'allow_all' },
                codex: { command: 'my-codex' },
                kimi: { command: 'kimi', harness_mode: 'auto' },
            },
        };
        expect(resolvePermissions(config, 'claude')).toStrictEqual({
            mode: 'ask',
            answers: 'allow',
            answersKey: 'custom_harnesses.claude.permissions',
        });
        const global = { mode: 'ask', answers: 'deny', answersKey: 'permissions' };
        expect(resolvePermissions(config, 'codex')).toStrictEqual(global);
        expect(resolvePermissions(config, 'kimi')).toStrictEqual({ ...global, mode: 'auto' });
        expect(resolvePermissions(config, 'opencode')).toStrictEqual(global);
        expect(resolvePermissions({ ...config, custom_harnesses: {} }, 'claude')).toStrictEqual({
            mode: 'ask',
            answers: 'elicit',
            answersKey: 'harnesses.claude.permissions',
        });
        expect(resolvePermissions(config, 'glm')).toStrictEqual(global);
    });

    it('deny: reject_once picked by kind, never reject_always or allow_*, and reports the decision', async () => {
        const decisions: PermissionDecision[] = [];
        const bridge = createPermissionBridge(d => decisions.push(d), deny);
        const answer = await bridge.answer(
            request([
                { optionId: 'always-xyz', name: 'Always', kind: 'allow_always' },
                { optionId: 'once-abc', name: 'Allow', kind: 'allow_once' },
                { optionId: 'never', name: 'Never', kind: 'reject_always' },
                { optionId: 'no-def', name: 'Reject', kind: 'reject_once' },
            ])
        );
        expect(answer).toStrictEqual({ outcome: { outcome: 'selected', optionId: 'no-def' } });
        expect(decisions).toStrictEqual([{ title: 'write notes.txt', kind: 'edit', choice: 'no-def' }]);
    });

    it('deny without a reject_once option answers cancelled', async () => {
        const decisions: PermissionDecision[] = [];
        const bridge = createPermissionBridge(d => decisions.push(d), deny);
        const answer = await bridge.answer(
            request([
                { optionId: 'always', name: 'Always', kind: 'allow_always' },
                { optionId: 'yes', name: 'Allow', kind: 'allow_once' },
            ])
        );
        expect(answer).toStrictEqual({ outcome: { outcome: 'cancelled' } });
        expect(decisions).toStrictEqual([{ title: 'write notes.txt', kind: 'edit', choice: 'cancelled' }]);
    });

    it('isThrongResultCall: by title substrings, codex and claude spellings', () => {
        expect(isThrongResultCall(submitCall)).toBe(true);
        expect(isThrongResultCall({ toolCallId: 't', title: 'mcp__throng_result__submit_result' })).toBe(true);
        expect(isThrongResultCall({ toolCallId: 't', title: 'mcp.other.submit_result' })).toBe(false);
        expect(isThrongResultCall({ toolCallId: 't', title: 'mcp.throng_result.other' })).toBe(false);
        expect(isThrongResultCall({ toolCallId: 't' })).toBe(false);
    });

    it('our submit_result is allowed once before the answers; other tools still rejected', async () => {
        const decisions: PermissionDecision[] = [];
        const bridge = createPermissionBridge(d => decisions.push(d), deny);
        expect(await bridge.answer(request(onceOptions, submitCall))).toStrictEqual({
            outcome: { outcome: 'selected', optionId: 'ok' },
        });
        expect(await bridge.answer(request(onceOptions))).toStrictEqual({
            outcome: { outcome: 'selected', optionId: 'no' },
        });
        expect(decisions).toStrictEqual([
            { title: 'mcp.throng_result.submit_result', kind: 'other', choice: 'ok' },
            { title: 'write notes.txt', kind: 'edit', choice: 'no' },
        ]);
    });

    it('our submit_result without an allow_once option → the answers decide, never allow_always', async () => {
        const bridge = createPermissionBridge(() => undefined, deny);
        const answer = await bridge.answer(
            request(
                [
                    { optionId: 'always', name: 'Always', kind: 'allow_always' },
                    { optionId: 'no', name: 'Reject', kind: 'reject_once' },
                ],
                submitCall
            )
        );
        expect(answer).toStrictEqual({ outcome: { outcome: 'selected', optionId: 'no' } });
    });

    it('cancelAll answers a pending request cancelled, and every later one', async () => {
        const decisions: PermissionDecision[] = [];
        let sawAbort = false;
        const bridge = createPermissionBridge(
            d => decisions.push(d),
            (_req, signal) =>
                new Promise(() => {
                    signal.addEventListener('abort', () => (sawAbort = true));
                })
        );
        const pending = bridge.answer(request([{ optionId: 'y', name: 'Allow', kind: 'allow_once' }]));
        await new Promise(resolve => setImmediate(resolve));
        bridge.cancelAll();
        expect(await pending).toStrictEqual({ outcome: { outcome: 'cancelled' } });
        expect(sawAbort).toBe(true);
        expect(await bridge.answer(request([{ optionId: 'y', name: 'Allow', kind: 'allow_once' }]))).toStrictEqual({
            outcome: { outcome: 'cancelled' },
        });
        expect(decisions.length).toBe(2);
        expect(decisions.every(d => d.choice === 'cancelled')).toBe(true);
    });

    describe('allow', () => {
        const decide = deciderFor('allow', { elicitationTimeoutMs: 1000 });
        const signal = new AbortController().signal;

        it('allow_once picked by kind, never allow_always', async () => {
            expect(await decide(request(fullOptions), signal)).toStrictEqual({ outcome: 'selected', optionId: 'yes' });
        });

        it('no allow_once → reject_once; neither → cancelled', async () => {
            expect(
                await decide(
                    request([
                        { optionId: 'always', name: 'Always', kind: 'allow_always' },
                        { optionId: 'no', name: 'Reject', kind: 'reject_once' },
                    ]),
                    signal
                )
            ).toStrictEqual({ outcome: 'selected', optionId: 'no' });
            expect(
                await decide(request([{ optionId: 'always', name: 'Always', kind: 'allow_always' }]), signal)
            ).toStrictEqual({ outcome: 'cancelled' });
        });
    });

    it('deny: reject_once by kind, else cancelled', async () => {
        const decide = deciderFor('deny', { elicitationTimeoutMs: 1000 });
        const signal = new AbortController().signal;
        expect(await decide(request(fullOptions), signal)).toStrictEqual({ outcome: 'selected', optionId: 'no' });
        expect(await decide(request([{ optionId: 'yes', name: 'Allow', kind: 'allow_once' }]), signal)).toStrictEqual({
            outcome: 'cancelled',
        });
    });

    describe('auto', () => {
        const signal = new AbortController().signal;

        it('with an elicitation: asks, and the answer is the chosen option', async () => {
            const asked: string[] = [];
            const decide = deciderFor('auto', {
                elicitation: {
                    ask: params => {
                        asked.push(params.message);
                        return Promise.resolve({ action: 'accept', content: { decision: 'allow_once' } });
                    },
                },
                elicitationTimeoutMs: 1000,
                description: 'auto test',
            });
            expect(await decide(request(fullOptions), signal)).toStrictEqual({ outcome: 'selected', optionId: 'yes' });
            expect(asked.map(m => m.split('\n')[0])).toStrictEqual(['[auto test] write notes.txt']);
        });

        it('without an elicitation: as deny, reject_once by kind, else cancelled', async () => {
            const decide = deciderFor('auto', { elicitationTimeoutMs: 1000 });
            expect(await decide(request(fullOptions), signal)).toStrictEqual({ outcome: 'selected', optionId: 'no' });
            expect(
                await decide(request([{ optionId: 'yes', name: 'Allow', kind: 'allow_once' }]), signal)
            ).toStrictEqual({ outcome: 'cancelled' });
        });

        it('elicits: elicit always, auto only with an elicitation, allow and deny never', () => {
            const elicitation = { ask: () => Promise.resolve({ action: 'cancel' as const }) };
            expect(elicits('elicit', undefined)).toBe(true);
            expect(elicits('auto', elicitation)).toBe(true);
            expect(elicits('auto', undefined)).toBe(false);
            expect(elicits('allow', elicitation)).toBe(false);
            expect(elicits('deny', elicitation)).toBe(false);
        });
    });

    describe('elicit', () => {
        interface Asked {
            params: ElicitRequestFormParams;
            opts: { signal: AbortSignal; timeoutMs: number };
        }

        function fakeElicitation(answer: (asked: Asked) => Promise<ElicitResult>): Elicitation & { asked: Asked[] } {
            const asked: Asked[] = [];
            return {
                asked,
                ask: (params, opts) => {
                    asked.push({ params, opts });
                    return answer({ params, opts });
                },
            };
        }

        const decideWith = (elicitation: Elicitation, description?: string) =>
            deciderFor('elicit', {
                elicitation,
                elicitationTimeoutMs: 1234,
                ...(description !== undefined ? { description } : {}),
            });
        const signal = new AbortController().signal;

        it('form: titled oneOf of the *_once kinds present, first option of each kind; message and timeout', async () => {
            const elicitation = fakeElicitation(() => Promise.resolve({ action: 'cancel' }));
            await decideWith(elicitation, 'notes writer')(
                request(
                    [
                        { optionId: 'always', name: 'Always', kind: 'allow_always' },
                        { optionId: 'yes', name: 'Allow once', kind: 'allow_once' },
                        { optionId: 'yes2', name: 'Allow again', kind: 'allow_once' },
                        { optionId: 'never', name: 'Never', kind: 'reject_always' },
                        { optionId: 'no', name: 'Reject', kind: 'reject_once' },
                    ],
                    {
                        toolCallId: 't1',
                        title: 'write notes.txt',
                        kind: 'edit',
                        rawInput: { path: 'notes.txt' },
                        locations: [{ path: '/w/notes.txt' }, { path: '/w/b.txt', line: 3 }],
                    }
                ),
                signal
            );
            expect(elicitation.asked).toHaveLength(1);
            const [{ params, opts }] = elicitation.asked as [Asked];
            expect(params).toStrictEqual({
                mode: 'form',
                message: [
                    '[notes writer] write notes.txt',
                    'kind: edit',
                    'input: {"path":"notes.txt"}',
                    'locations: /w/notes.txt, /w/b.txt',
                ].join('\n'),
                requestedSchema: {
                    type: 'object',
                    properties: {
                        decision: {
                            type: 'string',
                            title: 'Decision',
                            oneOf: [
                                { const: 'allow_once', title: 'Allow once' },
                                { const: 'reject_once', title: 'Reject' },
                            ],
                        },
                    },
                    required: ['decision'],
                },
            });
            expect(opts.timeoutMs).toBe(1234);
            expect(opts.signal).toBe(signal);
        });

        it('message: [agent] and only the title when nothing else is present; rawInput over 2 KB is truncated', async () => {
            const elicitation = fakeElicitation(() => Promise.resolve({ action: 'cancel' }));
            const decide = decideWith(elicitation, '');
            await decide(request(onceOptions, { toolCallId: 't7' }), signal);
            await decide(
                request(onceOptions, { toolCallId: 't8', title: 'big', rawInput: { text: 'x'.repeat(5000) } }),
                signal
            );
            const [bare, big] = elicitation.asked.map(a => a.params.message);
            expect(bare).toBe('[agent] t7');
            const input = big?.split('\n')[1] ?? '';
            expect(input.startsWith('input: {"text":"xxx')).toBe(true);
            expect(input).toMatch(/… \(truncated, 5011 chars\)$/);
            expect(input.length).toBeLessThan(2048 + 50);
        });

        it('message: the description is one line of at most 80 chars; whitespace-only → [agent]', async () => {
            const elicitation = fakeElicitation(() => Promise.resolve({ action: 'cancel' }));
            const ask = (description: string) =>
                decideWith(elicitation, description)(
                    request(onceOptions, { toolCallId: 't9', title: 'rm -rf build' }),
                    signal
                );
            await ask('notes\nkind: read\ninput: {}');
            await ask(' \n\t ');
            await ask('d'.repeat(100));
            const firstLines = elicitation.asked.map(a => a.params.message.split('\n'));
            expect(firstLines).toStrictEqual([
                ['[notes kind: read input: {}] rm -rf build'],
                ['[agent] rm -rf build'],
                [`[${'d'.repeat(80)}…] rm -rf build`],
            ]);
        });

        it('accept → the chosen option; decline → reject_once; cancel → cancelled', async () => {
            const answers: ElicitResult[] = [
                { action: 'accept', content: { decision: 'allow_once' } },
                { action: 'accept', content: { decision: 'reject_once' } },
                { action: 'decline' },
                { action: 'cancel' },
            ];
            const elicitation = fakeElicitation(() => Promise.resolve(answers.shift() ?? { action: 'cancel' }));
            const decide = decideWith(elicitation);
            expect(await decide(request(fullOptions), signal)).toStrictEqual({ outcome: 'selected', optionId: 'yes' });
            expect(await decide(request(fullOptions), signal)).toStrictEqual({ outcome: 'selected', optionId: 'no' });
            expect(await decide(request(fullOptions), signal)).toStrictEqual({ outcome: 'selected', optionId: 'no' });
            expect(await decide(request(fullOptions), signal)).toStrictEqual({ outcome: 'cancelled' });
        });

        it('decline without reject_once → cancelled', async () => {
            const decide = decideWith(fakeElicitation(() => Promise.resolve({ action: 'decline' })));
            expect(
                await decide(request([{ optionId: 'yes', name: 'Allow', kind: 'allow_once' }]), signal)
            ).toStrictEqual({ outcome: 'cancelled' });
        });

        it('accept with a decision not offered, or none, → cancelled', async () => {
            const answers: ElicitResult[] = [
                { action: 'accept', content: { decision: 'allow_always' } },
                { action: 'accept', content: { decision: 'reject_once' } },
                { action: 'accept' },
            ];
            const decide = decideWith(fakeElicitation(() => Promise.resolve(answers.shift() ?? { action: 'cancel' })));
            const allowOnly = request([
                { optionId: 'always', name: 'Always', kind: 'allow_always' },
                { optionId: 'yes', name: 'Allow', kind: 'allow_once' },
            ]);
            expect(await decide(allowOnly, signal)).toStrictEqual({ outcome: 'cancelled' });
            expect(await decide(allowOnly, signal)).toStrictEqual({ outcome: 'cancelled' });
            expect(await decide(allowOnly, signal)).toStrictEqual({ outcome: 'cancelled' });
        });

        it('a rejected ask (timeout, transport gone) → cancelled', async () => {
            const decide = decideWith(fakeElicitation(() => Promise.reject(new Error('Request timed out'))));
            expect(await decide(request(fullOptions), signal)).toStrictEqual({ outcome: 'cancelled' });
        });

        it('no *_once option → cancelled without asking', async () => {
            const elicitation = fakeElicitation(() => Promise.resolve({ action: 'accept' }));
            const decide = decideWith(elicitation);
            expect(
                await decide(request([{ optionId: 'always', name: 'Always', kind: 'allow_always' }]), signal)
            ).toStrictEqual({ outcome: 'cancelled' });
            expect(elicitation.asked).toHaveLength(0);
        });

        it('our submit_result is allowed before the answers, without asking', async () => {
            const elicitation = fakeElicitation(() => Promise.resolve({ action: 'decline' }));
            const bridge = createPermissionBridge(() => undefined, decideWith(elicitation));
            expect(await bridge.answer(request(onceOptions, submitCall))).toStrictEqual({
                outcome: { outcome: 'selected', optionId: 'ok' },
            });
            expect(elicitation.asked).toHaveLength(0);
        });

        it("cancelAll aborts the pending ask's signal and answers cancelled", async () => {
            const decisions: PermissionDecision[] = [];
            const elicitation = fakeElicitation(
                ({ opts }) =>
                    new Promise((_, reject) =>
                        opts.signal.addEventListener('abort', () => reject(new Error('aborted')))
                    )
            );
            const bridge = createPermissionBridge(d => decisions.push(d), decideWith(elicitation));
            const pending = bridge.answer(request(fullOptions));
            await new Promise(resolve => setImmediate(resolve));
            expect(elicitation.asked).toHaveLength(1);
            bridge.cancelAll();
            expect(await pending).toStrictEqual({ outcome: { outcome: 'cancelled' } });
            expect(elicitation.asked[0]?.opts.signal.aborted).toBe(true);
            expect(decisions).toStrictEqual([{ title: 'write notes.txt', kind: 'edit', choice: 'cancelled' }]);
        });
    });
});
