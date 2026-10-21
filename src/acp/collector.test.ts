import type { PromptResponse, SessionNotification, SessionUpdate } from '@agentclientprotocol/sdk';
import { describe, expect, it } from 'vitest';
import { Collector } from './collector.ts';

const note = (update: SessionUpdate): SessionNotification => ({ sessionId: 's1', update });
const text = (chunk: string): SessionNotification =>
    note({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: chunk } });
const stop = (inputTokens?: number, outputTokens?: number): PromptResponse =>
    inputTokens === undefined || outputTokens === undefined
        ? { stopReason: 'end_turn' }
        : { stopReason: 'end_turn', usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens } };

/** codex-acp's `_meta.jetbrains.air.sessionFailure`. */
const air = (failure: Record<string, unknown>) => ({ jetbrains: { air: { version: 1, sessionFailure: failure } } });
const failure = (severity: string, title: string, extra: Record<string, unknown> = {}) =>
    air({ id: 't1:error', revision: 1, category: 'service', severity, title, actions: [], ...extra });
const info = (meta: Record<string, unknown>): SessionNotification =>
    note({ sessionUpdate: 'session_info_update', _meta: meta });

describe('collector', () => {
    it('text is the last turn; startTurn resets it', () => {
        const c = new Collector();
        c.startTurn();
        c.handle(text('first '));
        c.handle(text('turn'));
        c.endTurn(stop());
        expect(c.text).toBe('first turn');
        c.startTurn();
        expect(c.text).toBe('');
        c.handle(text('second'));
        c.endTurn(stop());
        expect(c.text).toBe('second');
    });

    it('finalText: the turn after its last tool_call, not reset by tool_call_update, reset by startTurn', () => {
        const c = new Collector();
        c.startTurn();
        c.handle(text('narration '));
        expect(c.finalText).toBe('narration ');
        c.handle(note({ sessionUpdate: 'tool_call', toolCallId: 't1', title: 'read a.txt' }));
        c.handle(text('more '));
        c.handle(note({ sessionUpdate: 'tool_call', toolCallId: 't2', title: 'read b.txt' }));
        c.handle(text('{"answer":'));
        c.handle(note({ sessionUpdate: 'tool_call_update', toolCallId: 't2', status: 'completed' }));
        c.handle(text('"pong"}'));
        c.endTurn(stop());
        expect(c.finalText).toBe('{"answer":"pong"}');
        expect(c.text).toBe('narration more {"answer":"pong"}');
        c.handle(note({ sessionUpdate: 'tool_call', toolCallId: 't3', title: 'late' }));
        expect(c.finalText, 'a tool_call outside a turn changes nothing').toBe('{"answer":"pong"}');
        c.startTurn();
        expect(c.finalText).toBe('');
    });

    it('pre-turn text matching preTurnNoise is dropped; other text still warns', () => {
        const c = new Collector();
        c.preTurnNoise = [/^\[MODE_UPDATE\] \S+$/];
        c.handle(text('[MODE_UPDATE] yolo'));
        c.handle(text('something else'));
        c.startTurn();
        c.handle(text('[MODE_UPDATE] yolo'));
        c.endTurn(stop());
        expect(c.text).toBe('[MODE_UPDATE] yolo');
        expect(c.warnings).toStrictEqual(['agent message before the task: something else']);
    });

    it('agent text before the turn becomes a warning, not text', () => {
        const c = new Collector();
        c.handle(text('Auto mode unavailable; using Accept edits instead.'));
        c.startTurn();
        c.handle(text('done'));
        c.endTurn(stop());
        expect(c.text).toBe('done');
        expect(c.warnings).toStrictEqual([
            'agent message before the task: Auto mode unavailable; using Accept edits instead.',
        ]);
        // Text of a finished turn is not re-reported by the next startTurn.
        c.startTurn();
        expect(c.warnings.length).toBe(1);
    });

    it('non-text message chunks are ignored for text', () => {
        const c = new Collector();
        c.startTurn();
        c.handle(
            note({
                sessionUpdate: 'agent_message_chunk',
                content: { type: 'image', data: 'AA==', mimeType: 'image/png' },
            })
        );
        expect(c.text).toBe('');
    });

    it('cost: last value wins; tokens: summed across turns', () => {
        const c = new Collector();
        c.handle(note({ sessionUpdate: 'usage_update', used: 1, size: 10, cost: { amount: 0.01, currency: 'USD' } }));
        c.endTurn(stop(10, 5));
        c.handle(note({ sessionUpdate: 'usage_update', used: 2, size: 10, cost: { amount: 0.03, currency: 'USD' } }));
        c.handle(note({ sessionUpdate: 'usage_update', used: 3, size: 10 }));
        c.endTurn(stop(7, 2));
        c.endTurn(stop());
        expect(c.usage).toStrictEqual({ cost_usd: 0.03, input_tokens: 17, output_tokens: 7 });
    });

    it('usage is empty until something reports it', () => {
        expect(new Collector().usage).toStrictEqual({});
    });

    it('notice → warnings, exact duplicates dropped', () => {
        const c = new Collector();
        c.handle(
            note({ sessionUpdate: 'notice', severity: 'warning', title: 'fell back', description: 'to default model' })
        );
        c.handle(note({ sessionUpdate: 'notice', severity: 'info', title: 'no description' }));
        c.handle(
            note({ sessionUpdate: 'notice', severity: 'warning', title: 'fell back', description: 'to default model' })
        );
        expect(c.warnings).toStrictEqual(['warning: fell back — to default model', 'info: no description']);
    });

    it('thought and plan are ignored', () => {
        const c = new Collector();
        c.startTurn();
        c.handle(note({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'hmm' } }));
        c.handle(note({ sessionUpdate: 'plan', entries: [{ content: 'step', priority: 'high', status: 'pending' }] }));
        c.endTurn(stop());
        expect(c.text).toBe('');
        expect(c.warnings).toStrictEqual([]);
    });

    it('lastToolTitle follows tool_call and titled tool_call_update', () => {
        const c = new Collector();
        expect(c.lastToolTitle).toBe(undefined);
        c.handle(note({ sessionUpdate: 'tool_call', toolCallId: 't1', title: 'read a.txt' }));
        expect(c.lastToolTitle).toBe('read a.txt');
        c.handle(note({ sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed' }));
        expect(c.lastToolTitle).toBe('read a.txt');
        c.handle(note({ sessionUpdate: 'tool_call_update', toolCallId: 't1', title: 'read b.txt' }));
        expect(c.lastToolTitle).toBe('read b.txt');
    });

    describe('session failures', () => {
        it('an error in the PromptResponse _meta fails the turn; startTurn clears it', () => {
            const c = new Collector();
            c.startTurn();
            c.endTurn({ stopReason: 'end_turn', _meta: failure('error', "model 'x' is not enabled") });
            expect(c.turnFailure).toStrictEqual({ category: 'service', title: "model 'x' is not enabled" });
            expect(c.warnings).toStrictEqual([]);
            c.startTurn();
            expect(c.turnFailure).toBe(undefined);
        });

        it('an error in a session_info_update is a warning, in a turn or outside one', () => {
            const c = new Collector();
            c.handle(info(failure('error', 'before', { id: 'a' })));
            c.startTurn();
            c.handle(text('partial'));
            c.handle(info(failure('error', 'boom', { id: 'b', category: undefined })));
            c.endTurn(stop());
            expect(c.turnFailure).toBe(undefined);
            expect(c.text).toBe('partial');
            c.handle(info(failure('error', 'after', { id: 'c', details: 'stream closed' })));
            expect(c.warnings).toStrictEqual([
                'error (service): before',
                'error: boom',
                'error (service): after — stream closed',
            ]);
        });

        it('warnings: revisions of one id leave one entry with the latest title; a stale revision is ignored', () => {
            const c = new Collector();
            c.startTurn();
            c.handle(info(failure('warning', 'Reconnecting… 1/5')));
            c.handle(note({ sessionUpdate: 'notice', severity: 'warning', title: 'plain' }));
            c.handle(info(failure('warning', 'Reconnecting… 3/5', { revision: 3 })));
            c.handle(info(failure('warning', 'Reconnecting… 2/5', { revision: 2 })));
            c.handle(info(failure('warning', 'other', { id: 't2:error' })));
            c.endTurn({ stopReason: 'end_turn', _meta: failure('warning', 'Reconnecting… 5/5', { revision: 5 }) });
            expect(c.turnFailure).toBe(undefined);
            expect(c.warnings).toStrictEqual([
                'warning (service): Reconnecting… 5/5',
                'warning: plain',
                'warning (service): other',
            ]);
        });

        it('the terminal error of a retried failure fails the turn and keeps the last retry warning', () => {
            const c = new Collector();
            c.startTurn();
            c.handle(info(failure('warning', 'Reconnecting… 2/2', { revision: 2 })));
            c.endTurn({ stopReason: 'end_turn', _meta: failure('error', 'gave up', { revision: 3 }) });
            expect(c.turnFailure).toStrictEqual({ category: 'service', title: 'gave up' });
            expect(c.warnings).toStrictEqual(['warning (service): Reconnecting… 2/2']);
        });

        it('malformed or foreign _meta is ignored', () => {
            const c = new Collector();
            c.startTurn();
            for (const meta of [
                { throngDepth: '1' },
                { jetbrains: null },
                { jetbrains: { air: 'x' } },
                air({ severity: 'fatal', title: 't' }),
                air({ severity: 'error', title: 42 }),
                air({ severity: 'error' }),
            ]) {
                c.handle(info(meta));
                c.endTurn({ stopReason: 'end_turn', _meta: meta });
            }
            expect(c.turnFailure).toBe(undefined);
            expect(c.warnings).toStrictEqual([]);
        });
    });
});
