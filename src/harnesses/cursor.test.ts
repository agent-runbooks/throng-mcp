import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { type FakeCall, type FakeScenario, readFakeCalls } from '../../test/fake-agent/index.ts';
import { fakeHarness, tagAlive, waitFor } from '../../test/fake-harness.ts';
import type { PermissionPolicy } from '../config.ts';
import type { RunFailure, RunSuccess } from '../contract.ts';
import { listHarnesses } from '../list.ts';
import { listThronglets } from '../list-thronglets.ts';
import { log } from '../log.ts';
import { runThronglet } from '../mcp/tools/run-thronglet.ts';
import { sendMessage } from '../mcp/tools/send-message.ts';
import { SessionRegistry } from '../registry.ts';
import type { RunOutcome } from '../run.ts';
import { readSessionRecord } from '../sessions.ts';

// The cursor harness end to end on the fake agent's cursor scenarios (DESIGN §2.3, §3.3, §4.1, §5).

const h = fakeHarness('throng-cursor-');
afterAll(() => h.cleanup());

const input = (agent: string, prompt = 'do the thing') => ({ agent, prompt, cwd: h.work, description: 'cursor test' });

/** Never asked in these scenarios; present so `elicit` runs at all. */
const elicitation = { ask: () => Promise.reject(new Error('unexpected elicitation')) };

function ok(outcome: RunOutcome): RunSuccess {
    expect(outcome.ok, `expected success, got ${JSON.stringify(outcome.payload)}`).toBe(true);
    return outcome.payload as RunSuccess;
}

function failed(outcome: RunOutcome, code: RunFailure['code']): RunFailure {
    expect(outcome.ok, `expected failure, got ${JSON.stringify(outcome.payload)}`).toBe(false);
    const payload = outcome.payload as RunFailure;
    expect(payload.code, payload.message).toBe(code);
    return payload;
}

const newCallLog = () => join(mkdtempSync(join(h.root, 'calls-')), 'calls.jsonl');

/** A cursor run in `scenario` under `policy`, its FAKE_CALL_LOG lines and the fake's tag. */
async function cursorRun(
    agent: string,
    policy: PermissionPolicy,
    scenario: FakeScenario = 'cursor',
    agentEnv: Record<string, string> = {}
): Promise<{ outcome: RunOutcome; calls: FakeCall[]; tag: string }> {
    const callLog = newCallLog();
    const { loaded, tag } = h.fakeAs('cursor', scenario, `permissions: ${policy}`, {
        FAKE_CALL_LOG: callLog,
        ...agentEnv,
    });
    const outcome = await runThronglet(input(agent), h.makeCtx(loaded, { elicitation }));
    return { outcome, calls: readFakeCalls(callLog), tag };
}

/** `<event> <value>` per call; `^` marks a loaded session, `start` shows argv after the tag. */
const summary = (calls: FakeCall[]) =>
    calls.map(c => {
        if (c.event === 'start') return `start ${c.argv.slice(1).join(' ')}`.trim();
        if (c.event === 'authenticate') return `authenticate ${c.methodId}`;
        if (c.event === 'load') return `load ${c.sessionId}`;
        const r = c.resumed ? '^' : '';
        if (c.event === 'set_mode') return `${r}set_mode ${c.modeId}`;
        if (c.event === 'set_model') return `${r}set_model ${c.modelId}`;
        if (c.event === 'set_config_option') return `${r}set_config_option ${c.configId}=${String(c.value)}`;
        return `${r}prompt`;
    });

describe('cursor harness (fake agent)', () => {
    const cases: [PermissionPolicy, string][] = [
        ['auto', 'start --force'],
        ['allow_all', 'start'],
        ['deny_all', 'start'],
        ['elicit', 'start'],
    ];
    for (const [policy, start] of cases) {
        it(`${policy} → ${start === 'start' ? 'no launch flag' : '--force'}; authenticate after initialize, no mode set`, async () => {
            const { outcome, calls } = await cursorRun('cursor/fake-small[effort=low]', policy);
            ok(outcome);
            expect(outcome.payload.warnings).toBe(undefined);
            expect(summary(calls)).toStrictEqual([
                start,
                'authenticate cursor_login',
                'set_config_option model=fake-small[effort=low]',
                'prompt',
            ]);
        });
    }

    it('a model by its name before the bracket resolves to the listed value', async () => {
        const { outcome, calls, tag } = await cursorRun('cursor/fake-small', 'auto');
        const payload = ok(outcome);
        expect(payload.text ?? '').toMatch(/\[model=fake-small\[effort=low\] effort=\?\]$/);
        expect(summary(calls).slice(2)).toStrictEqual(['set_config_option model=fake-small[effort=low]', 'prompt']);
        expect(tagAlive(tag), 'adapter still running').toBe(false);
    });

    it('`default` resolves to `default[]`; a full listed value is taken as is', async () => {
        const auto = await cursorRun('cursor/default', 'auto');
        expect(ok(auto.outcome).text ?? '').toMatch(/\[model=default\[\] effort=\?\]$/);
        const exact = await cursorRun('cursor/fake-big[reasoning=high]', 'auto');
        expect(ok(exact.outcome).text ?? '').toMatch(/\[model=fake-big\[reasoning=high\] effort=\?\]$/);
    });

    it('an ambiguous or unknown name → model_rejected with the listed values, no prompt', async () => {
        const list =
            'valid models: default[], fake-small[effort=low], fake-big[reasoning=low], fake-big[reasoning=high]';
        for (const model of ['fake-big', 'fake-huge', 'fake-small[effort=high]']) {
            const { outcome, calls } = await cursorRun(`cursor/${model}`, 'auto');
            const payload = failed(outcome, 'model_rejected');
            expect(payload.message).toBe(`model "${model}" is not available; ${list}`);
            expect(summary(calls)).toStrictEqual(['start --force', 'authenticate cursor_login']);
        }
    });

    it('an effort suffix is ignored with a warning; the turn completes', async () => {
        const { outcome } = await cursorRun('cursor/fake-small:high', 'auto');
        const payload = ok(outcome);
        expect(payload.stop_reason).toBe('end_turn');
        expect(payload.warnings).toStrictEqual(['effort "high" ignored: cursor exposes no effort option']);
    });

    it('permission requests: allow_all → allow-once, deny_all → reject-once', async () => {
        const info = vi.spyOn(log, 'info');
        try {
            const allowed = await cursorRun('cursor/default', 'allow_all', 'cursor-permission');
            expect(ok(allowed.outcome).text).toBe('allowed');
            expect(info).toHaveBeenCalledWith(
                'permission',
                expect.objectContaining({ title: 'ls', choice: 'allow-once' })
            );
            info.mockClear();
            const denied = await cursorRun('cursor/default', 'deny_all', 'cursor-permission');
            expect(ok(denied.outcome).text).toBe('rejected');
            expect(info).toHaveBeenCalledWith(
                'permission',
                expect.objectContaining({ title: 'ls', choice: 'reject-once' })
            );
        } finally {
            info.mockRestore();
        }
    });

    it('authenticate rejected (no `agent login`) → handshake_failed with the agent message', async () => {
        const text = "Not logged in. Please run 'agent login' first.";
        const { outcome, calls, tag } = await cursorRun('cursor/default', 'auto', 'cursor', { FAKE_AUTH_ERROR: text });
        const payload = failed(outcome, 'handshake_failed');
        expect(payload.message).toBe(`authenticate failed: ${text}`);
        expect(summary(calls)).toStrictEqual(['start --force', 'authenticate cursor_login']);
        expect(tagAlive(tag)).toBe(false);
    });

    it('send_message continues the session through session/load; the replayed history stays out of the result', async () => {
        const callLog = newCallLog();
        const { loaded, tag } = h.fakeAs('cursor', 'cursor-resume-memory', '', {
            FAKE_CALL_LOG: callLog,
            FAKE_MEMORY_DIR: mkdtempSync(join(h.root, 'memory-')),
        });
        const ctx = h.makeCtx(loaded);
        const first = ok(await runThronglet(input('cursor/fake-small', 'remember: banana'), ctx));
        expect(first.text).toBe('noted [model=fake-small[effort=low] effort=?]');
        const record = await readSessionRecord(ctx.cacheDir, first.session_id);
        expect(record?.resumable).toBe(true);
        const { thronglets } = await listThronglets(ctx.cacheDir, ctx.sessions);
        expect(thronglets.map(t => [t.session_id, t.accepts_messages, t.agent])).toStrictEqual([
            [first.session_id, true, 'cursor/fake-small'],
        ]);

        const second = ok(await sendMessage({ session_id: first.session_id, prompt: 'what did I say?' }, ctx));
        expect(second.session_id).toBe(first.session_id);
        expect(second.text).toBe('you said: remember: banana [model=fake-small[effort=low] effort=?]');
        expect(second.warnings).toBe(undefined);
        expect(JSON.stringify(second)).not.toMatch(/REPLAYED|replayed thought/);
        expect(summary(readFakeCalls(callLog))).toStrictEqual([
            'start --force',
            'authenticate cursor_login',
            'set_config_option model=fake-small[effort=low]',
            'prompt',
            'start --force',
            'authenticate cursor_login',
            `load ${first.session_id}`,
            '^set_config_option model=fake-small[effort=low]',
            '^prompt',
        ]);
        expect(tagAlive(tag), 'adapter still running').toBe(false);
    });

    it('send_message steer: the running turn is cancelled, the steer turn continues the session through session/load', async () => {
        const memory = mkdtempSync(join(h.root, 'memory-'));
        const sessions = new SessionRegistry();
        const cacheDir = mkdtempSync(join(h.root, 'cache-'));
        const ctxFor = (onTurnStarted?: (id: string) => void) => {
            const { loaded } = h.fakeAs('cursor', 'cursor-steer', '', { FAKE_MEMORY_DIR: memory });
            return h.makeCtx(loaded, { sessions, cacheDir, ...(onTurnStarted ? { onTurnStarted } : {}) });
        };
        let id: string | undefined;
        const run = runThronglet(
            input('cursor/default', 'first task'),
            ctxFor(sessionId => (id = sessionId))
        );
        await waitFor('first turn', () => id !== undefined);
        if (id === undefined) expect.unreachable();

        const steered = ok(await sendMessage({ session_id: id, prompt: 'new direction', steer: true }, ctxFor()));
        expect(failed(await run, 'cancelled').message).toBe('cancelled by steer');
        expect(steered.text).toBe('you said: first task | new direction');
        expect(steered.warnings).toBe(undefined);
    });

    it('list_harnesses: the probe authenticates; bracketed models from the model option, no efforts', async () => {
        const callLog = newCallLog();
        const { loaded, tag } = h.fakeAs('cursor', 'cursor', '', { FAKE_CALL_LOG: callLog });
        const out = await listHarnesses(loaded, { handshakeMs: 5000, depth: 0, env: { PATH: join(h.root, 'bin') } });
        expect(out.harnesses).toHaveLength(1);
        expect(out.harnesses[0]).toMatchObject({
            harness: 'cursor',
            models: ['default[]', 'fake-small[effort=low]', 'fake-big[reasoning=low]', 'fake-big[reasoning=high]'],
            efforts: [],
            version: '0.0.1',
        });
        expect(out.unavailable.map(u => u.harness)).toStrictEqual(['claude', 'codex', 'opencode', 'gemini']);
        expect(summary(readFakeCalls(callLog))).toStrictEqual(['start', 'authenticate cursor_login']);
        expect(tagAlive(tag), 'probed fake agent still running').toBe(false);
    });

    it('list_harnesses: cursor-agent not on PATH → unavailable with the install hint', async () => {
        const { loaded } = h.fakeClaude('echo');
        const out = await listHarnesses(loaded, { handshakeMs: 5000, depth: 0, env: { PATH: join(h.root, 'bin') } });
        expect(out.unavailable.find(u => u.harness === 'cursor')?.reason).toBe(
            'cursor-agent not found on PATH; install: curl https://cursor.com/install -fsS | bash'
        );
    });
});
