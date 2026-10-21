import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { type FakeCall, type FakeScenario, readFakeCalls } from '../../test/fake-agent/index.ts';
import { fakeHarness, tagAlive } from '../../test/fake-harness.ts';
import { type Config, DEFAULT_CONFIG, type PermissionPolicy } from '../config.ts';
import type { JsonSchemaObject, RunFailure, RunSuccess } from '../contract.ts';
import { listHarnesses } from '../list.ts';
import { log } from '../log.ts';
import { runThronglet } from '../mcp/tools/run-thronglet.ts';
import { sendMessage } from '../mcp/tools/send-message.ts';
import type { RunOutcome } from '../run.ts';
import { readSessionRecord } from '../sessions.ts';
import { copilot } from './copilot.ts';

// The copilot harness: its definition, and end to end on the fake agent's copilot scenarios (docs/harnesses.md;
// DESIGN §3.3, §4.1, §5, §6).

const h = fakeHarness('throng-copilot-');
afterAll(() => h.cleanup());
afterEach(() => vi.unstubAllEnvs());

const input = (agent: string, prompt = 'do the thing', schema?: JsonSchemaObject) => ({
    agent,
    prompt,
    cwd: h.work,
    description: 'copilot test',
    ...(schema ? { schema } : {}),
});

/** The schema the fake agent's json-* scenarios are written against. */
const RESULT_SCHEMA: JsonSchemaObject = {
    type: 'object',
    properties: { answer: { type: 'string' } },
    required: ['answer'],
    additionalProperties: false,
};

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

/** A copilot run in `scenario` under `policy`, its FAKE_CALL_LOG lines and the fake's tag. */
async function copilotRun(
    policy: PermissionPolicy,
    scenario: FakeScenario = 'copilot',
    opts: { agent?: string; schema?: JsonSchemaObject; agentEnv?: Record<string, string> } = {}
): Promise<{ outcome: RunOutcome; calls: FakeCall[]; tag: string }> {
    const callLog = newCallLog();
    const { loaded, tag } = h.fakeAs('copilot', scenario, `permissions: ${policy}`, {
        FAKE_CALL_LOG: callLog,
        ...opts.agentEnv,
    });
    const outcome = await runThronglet(
        input(opts.agent ?? 'copilot/fake-small', 'do the thing', opts.schema),
        h.makeCtx(loaded)
    );
    return { outcome, calls: readFakeCalls(callLog), tag };
}

/** `<event> <value>` per call; `^` marks a loaded session; `start` shows argv after the tag and COPILOT_ALLOW_ALL. */
const summary = (calls: FakeCall[]) =>
    calls.map(c => {
        if (c.event === 'start') {
            const args = c.argv.slice(1).map(a => (a.startsWith('{') ? '<json>' : a));
            return [`start`, ...args, ...(c.allowAll === undefined ? [] : [`COPILOT_ALLOW_ALL=${c.allowAll}`])].join(
                ' '
            );
        }
        if (c.event === 'authenticate') return `authenticate ${c.methodId}`;
        if (c.event === 'new') return `new [${c.mcpServers.join(', ')}]`;
        if (c.event === 'load') return `load [${(c.mcpServers ?? []).join(', ')}]`;
        if (c.event === 'resume') return `resume [${(c.mcpServers ?? []).join(', ')}]`;
        const r = c.resumed ? '^' : '';
        if (c.event === 'set_mode') return `${r}set_mode ${c.modeId}`;
        if (c.event === 'set_model') return `${r}set_model ${c.modelId}`;
        if (c.event === 'set_config_option') return `${r}set_config_option ${c.configId}=${String(c.value)}`;
        return `${r}prompt`;
    });

let dirs = 0;
/** A fresh PATH dir holding executable stubs for `bins`. */
function pathDir(bins: string[]): string {
    const dir = join(h.root, `bin-${dirs++}`);
    mkdirSync(dir);
    for (const bin of bins) {
        writeFileSync(join(dir, bin), '#!/bin/sh\nexit 0\n');
        chmodSync(join(dir, bin), 0o755);
    }
    return dir;
}

describe('copilot definition', () => {
    it('resolve: `copilot --acp` from PATH; config command, args and env win; absent → not installed with the hint', () => {
        const dir = pathDir(['copilot', 'my-copilot']);
        expect(copilot.resolve(DEFAULT_CONFIG, { PATH: dir })).toStrictEqual({
            available: true,
            launch: { command: join(dir, 'copilot'), args: ['--acp'], env: {} },
        });
        const config: Config = {
            ...DEFAULT_CONFIG,
            harnesses: { copilot: { command: 'my-copilot', args: ['--acp', '--log-level', 'debug'], env: { X: '1' } } },
        };
        expect(copilot.resolve(config, { PATH: dir })).toStrictEqual({
            available: true,
            launch: { command: join(dir, 'my-copilot'), args: ['--acp', '--log-level', 'debug'], env: { X: '1' } },
        });
        expect(copilot.resolve(DEFAULT_CONFIG, { PATH: pathDir([]) })).toStrictEqual({
            available: false,
            reason: 'copilot not found on PATH; install: npm i -g @github/copilot',
            notInstalled: true,
        });
    });

    it('permissionSetup: auto → allow_all=on; ask → COPILOT_ALLOW_ALL=false; no mode under either', () => {
        expect(copilot.permissionSetup('auto')).toStrictEqual({ configOptions: [{ id: 'allow_all', value: 'on' }] });
        expect(copilot.permissionSetup('ask')).toStrictEqual({ env: { COPILOT_ALLOW_ALL: 'false' } });
    });

    it('mapEffort: the level itself when offered, else nothing', () => {
        const levels = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
        expect(copilot.mapEffort('max', levels)).toBe('max');
        expect(copilot.mapEffort('xhigh', ['low', 'high'])).toBe(undefined);
    });
});

describe('copilot harness (fake agent)', () => {
    it('auto: allow_all=on after session/new, no mode set, no launch flag; the effort goes to thought_level', async () => {
        const { outcome, calls, tag } = await copilotRun('auto', 'copilot', { agent: 'copilot/fake-large:high' });
        const payload = ok(outcome);
        expect(payload.warnings).toBe(undefined);
        expect(payload.text ?? '').toMatch(/\[model=fake-large effort=high\]$/);
        expect(summary(calls)).toStrictEqual([
            'start',
            'new []',
            'set_config_option allow_all=on',
            'set_config_option model=fake-large',
            'set_config_option effort=high',
            'prompt',
        ]);
        expect(tagAlive(tag), 'adapter still running').toBe(false);
    });

    it('ask: allow_all left off, the adapter sees COPILOT_ALLOW_ALL=false, even when the server inherited true', async () => {
        vi.stubEnv('COPILOT_ALLOW_ALL', 'true');
        for (const policy of ['allow_all', 'deny_all'] as const) {
            const { outcome, calls } = await copilotRun(policy);
            ok(outcome);
            expect(summary(calls)).toStrictEqual([
                'start COPILOT_ALLOW_ALL=false',
                'new []',
                'set_config_option model=fake-small',
                'prompt',
            ]);
        }
    });

    it('permission requests: auto runs the command without asking; ask applies the answers (allow_once / reject_once)', async () => {
        const info = vi.spyOn(log, 'info');
        try {
            const auto = await copilotRun('auto', 'copilot-permission');
            expect(ok(auto.outcome).text).toBe('allowed');
            expect(info).not.toHaveBeenCalledWith('permission', expect.anything());

            const allowed = await copilotRun('allow_all', 'copilot-permission');
            expect(ok(allowed.outcome).text).toBe('allowed');
            expect(info).toHaveBeenCalledWith(
                'permission',
                expect.objectContaining({ title: 'List files', kind: 'execute', choice: 'allow_once' })
            );
            info.mockClear();
            vi.stubEnv('COPILOT_ALLOW_ALL', 'true');
            const denied = await copilotRun('deny_all', 'copilot-permission');
            expect(ok(denied.outcome).text).toBe('rejected');
            expect(info).toHaveBeenCalledWith(
                'permission',
                expect.objectContaining({ title: 'List files', choice: 'reject_once' })
            );
        } finally {
            info.mockRestore();
        }
    });

    it('send_message continues the session through session/load; the replayed history stays out of the result', async () => {
        const callLog = newCallLog();
        const { loaded, tag } = h.fakeAs('copilot', 'copilot-resume-memory', '', {
            FAKE_CALL_LOG: callLog,
            FAKE_MEMORY_DIR: mkdtempSync(join(h.root, 'memory-')),
        });
        const ctx = h.makeCtx(loaded);
        const first = ok(await runThronglet(input('copilot/fake-small', 'remember: banana'), ctx));
        expect(first.text).toBe('noted [model=fake-small effort=low]');
        expect((await readSessionRecord(ctx.cacheDir, first.session_id))?.resumable).toBe(true);

        const second = ok(await sendMessage({ session_id: first.session_id, prompt: 'what did I say?' }, ctx));
        expect(second.session_id).toBe(first.session_id);
        expect(second.text).toBe('you said: remember: banana [model=fake-small effort=low]');
        expect(second.warnings).toBe(undefined);
        expect(JSON.stringify(second)).not.toMatch(/REPLAYED|replayed thought/);
        expect(summary(readFakeCalls(callLog))).toStrictEqual([
            'start',
            'new []',
            'set_config_option allow_all=on',
            'set_config_option model=fake-small',
            'prompt',
            'start',
            'load []',
            '^set_config_option allow_all=on',
            '^set_config_option model=fake-small',
            '^prompt',
        ]);
        expect(tagAlive(tag), 'adapter still running').toBe(false);
    });

    it('schema: structured from the final message, no extra launch args, no servers in session/new and session/load', async () => {
        const callLog = newCallLog();
        const { loaded } = h.fakeAs('copilot', 'copilot-json-valid', '', { FAKE_CALL_LOG: callLog });
        const ctx = h.makeCtx(loaded);
        const first = ok(await runThronglet(input('copilot/fake-small', 'answer', RESULT_SCHEMA), ctx));
        expect(first.structured).toStrictEqual({ answer: 'pong' });
        expect(first.text).toBe(undefined);
        const firstCalls = readFakeCalls(callLog);
        expect(summary(firstCalls).slice(0, 2)).toStrictEqual(['start', 'new []']);

        const second = ok(
            await sendMessage({ session_id: first.session_id, prompt: 'again', schema: RESULT_SCHEMA }, ctx)
        );
        expect(second.structured).toStrictEqual({ answer: 'pong' });
        const secondCalls = readFakeCalls(callLog).slice(firstCalls.length);
        expect(summary(secondCalls).slice(0, 2)).toStrictEqual(['start', 'load []']);
    });

    it('schema under ask + deny: structured, with no permission request involved', async () => {
        const info = vi.spyOn(log, 'info');
        try {
            const { outcome } = await copilotRun('deny_all', 'copilot-json-valid', { schema: RESULT_SCHEMA });
            expect(ok(outcome).structured).toStrictEqual({ answer: 'pong' });
            expect(info).not.toHaveBeenCalledWith('permission', expect.anything());
        } finally {
            info.mockRestore();
        }
    });

    it('list_harnesses: copilot with the models and efforts of its options', async () => {
        const { loaded, tag } = h.fakeAs('copilot', 'copilot');
        const out = await listHarnesses(loaded, { handshakeMs: 5000, depth: 0, env: { PATH: join(h.root, 'bin') } });
        expect(out.harnesses).toHaveLength(1);
        expect(out.harnesses[0]).toMatchObject({
            harness: 'copilot',
            models: ['fake-small', 'fake-large'],
            efforts: ['low', 'high'],
        });
        expect(tagAlive(tag), 'probed fake agent still running').toBe(false);
    });

    it('copilot not on PATH: list_harnesses leaves it out, run_thronglet names the install command', async () => {
        const { loaded } = h.fakeClaude('echo');
        const out = await listHarnesses(loaded, { handshakeMs: 5000, depth: 0, env: { PATH: join(h.root, 'bin') } });
        expect([...out.harnesses, ...out.unavailable].map(row => row.harness)).not.toContain('copilot');
        const payload = failed(await runThronglet(input('copilot/x'), h.makeCtx(loaded)), 'harness_unavailable');
        expect(payload.message).toBe('copilot not found on PATH; install: npm i -g @github/copilot');
    });
});
