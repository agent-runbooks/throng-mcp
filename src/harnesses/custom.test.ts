import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { type FakeCall, type FakeScenario, readFakeCalls } from '../../test/fake-agent/index.ts';
import { fakeHarness, tagAlive } from '../../test/fake-harness.ts';
import { type CustomHarnessEntry, DEFAULT_CONFIG, loadConfig, type LoadedConfig } from '../config.ts';
import type { RunFailure, RunSuccess } from '../contract.ts';
import { cancelThronglet, stopBoundMs } from '../cancel.ts';
import { listHarnesses } from '../list.ts';
import { listThronglets } from '../list-thronglets.ts';
import { runThronglet } from '../mcp/tools/run-thronglet.ts';
import { sendMessage } from '../mcp/tools/send-message.ts';
import { noProgress } from '../progress.ts';
import type { RunContext, RunOutcome } from '../run.ts';
import { readSessionRecord } from '../sessions.ts';
import { waitThronglet } from '../wait.ts';
import { customHarness } from './custom.ts';
import { loadRegistry } from './index.ts';
import type { HarnessResolution } from './types.ts';

// Custom harnesses (DESIGN §4.1 "Custom harnesses", decision-8): the definition built from a config entry, and runs of
// one backed by the fake agent.

const h = fakeHarness('throng-custom-');
afterAll(() => h.cleanup());

const registry = loadRegistry();
const bin = join(h.root, 'bin');

const AUTO_MODE = {
    mode: 'yolo',
    config_options: { permission: 'bypass', brave_mode: true },
    args: ['--yolo'],
    env: { KIMI_YOLO: '1' },
};

const kimi = (entry: Partial<CustomHarnessEntry> = {}) => customHarness('kimi', { command: 'kimi', ...entry });

describe('customHarness: permissionSetup', () => {
    it('auto takes auto_mode, ask takes ask_mode', () => {
        const def = kimi({ auto_mode: AUTO_MODE, ask_mode: { mode: 'default', args: ['--ask'] } });
        expect(def.permissionSetup('auto')).toStrictEqual({
            modeId: 'yolo',
            configOptions: [
                { id: 'permission', value: 'bypass' },
                { id: 'brave_mode', value: true },
            ],
            args: ['--yolo'],
            env: { KIMI_YOLO: '1' },
        });
        expect(def.permissionSetup('ask')).toStrictEqual({ modeId: 'default', args: ['--ask'] });
    });

    it('auto without auto_mode: no setup, a warning naming the key', () => {
        const setup = kimi({ ask_mode: { mode: 'default' } }).permissionSetup('auto');
        expect(setup).toStrictEqual({
            warning: 'custom_harnesses.kimi.auto_mode is not set: kimi runs in the mode it starts in',
        });
    });

    it('an absent ask_mode is an empty setup; an empty auto_mode too, without a warning', () => {
        const def = kimi({ auto_mode: {} });
        expect(def.permissionSetup('auto')).toStrictEqual({});
        expect(def.permissionSetup('ask')).toStrictEqual({});
        expect(kimi().permissionSetup('ask')).toStrictEqual({});
    });

    it('config_options keep the order they are written in', () => {
        const def = kimi({ auto_mode: { config_options: { zeta: 'on', alpha: false, mid: 'x' } } });
        expect(def.permissionSetup('auto').configOptions?.map(o => o.id)).toStrictEqual(['zeta', 'alpha', 'mid']);
    });

    it('no registryId, preTurnNoise or newSessionMeta', () => {
        const def = kimi({ auto_mode: AUTO_MODE });
        expect(def.id).toBe('kimi');
        expect(def.registryId).toBe(undefined);
        expect(def.preTurnNoise).toBe(undefined);
        expect('newSessionMeta' in def.permissionSetup('auto')).toBe(false);
    });
});

describe('customHarness: mapEffort', () => {
    it('only an exact thought_level value', () => {
        const def = kimi();
        expect(def.mapEffort('high', ['low', 'high'])).toBe('high');
        expect(def.mapEffort('max', ['low', 'high', 'xhigh'])).toBe(undefined);
        expect(def.mapEffort('low', [])).toBe(undefined);
    });
});

describe('customHarness: resolve', () => {
    let dirs = 0;
    function dirWith(files: { name: string; mode: number }[]): string {
        const dir = join(h.root, `resolve-${dirs++}`);
        mkdirSync(dir);
        for (const { name, mode } of files) {
            writeFileSync(join(dir, name), '#!/bin/sh\nexit 0\n');
            chmodSync(join(dir, name), mode);
        }
        return dir;
    }
    const resolve = (entry: CustomHarnessEntry, env: NodeJS.ProcessEnv): HarnessResolution =>
        customHarness('kimi', entry).resolve(DEFAULT_CONFIG, registry, env);

    it('a name found on PATH: its absolute path, the entry args and env, nothing else', () => {
        const dir = dirWith([{ name: 'kimi', mode: 0o755 }]);
        expect(
            resolve({ command: 'kimi', args: ['acp'], env: { X: '1' }, auto_mode: AUTO_MODE }, { PATH: dir })
        ).toStrictEqual({ available: true, launch: { command: join(dir, 'kimi'), args: ['acp'], env: { X: '1' } } });
        expect(resolve({ command: 'kimi' }, { PATH: dir })).toStrictEqual({
            available: true,
            launch: { command: join(dir, 'kimi'), args: [], env: {} },
        });
    });

    it('a name not on PATH: the command and its config key, no install hint', () => {
        expect(resolve({ command: 'kimi' }, { PATH: dirWith([]) })).toStrictEqual({
            available: false,
            reason: 'kimi (custom_harnesses.kimi.command) not found on PATH',
        });
    });

    it('a path: used when executable, otherwise not found or not executable', () => {
        const dir = dirWith([
            { name: 'kimi', mode: 0o755 },
            { name: 'plain', mode: 0o644 },
        ]);
        expect(resolve({ command: join(dir, 'kimi') }, { PATH: '' })).toMatchObject({
            available: true,
            launch: { command: join(dir, 'kimi') },
        });
        for (const path of [join(dir, 'plain'), join(dir, 'missing')]) {
            expect(resolve({ command: path }, { PATH: dir })).toStrictEqual({
                available: false,
                reason: `${path} (custom_harnesses.kimi.command) not found or not executable`,
            });
        }
    });
});

// Runs of a custom harness `kimi` backed by the fake agent. The fake's modes are ask, auto and default; its options are
// model (fake-small, fake-large) and effort (low, high), plus OPTIONS below.

const OPTIONS = [
    {
        id: 'permission',
        name: 'Permission',
        type: 'select',
        currentValue: 'ask',
        options: [
            { value: 'ask', name: 'Ask' },
            { value: 'bypass', name: 'Bypass' },
        ],
    },
    { id: 'brave_mode', name: 'Brave mode', type: 'boolean', currentValue: false },
];

const AUTO_BLOCK = [
    '    auto_mode:',
    '      mode: auto',
    '      config_options: { brave_mode: true, permission: bypass }',
    '      args: ["--auto-flag"]',
    '      env: { PROBE_AUTO: "yes" }',
];

const input = (agent: string, extra: Record<string, unknown> = {}) => ({
    agent,
    prompt: 'do the thing',
    cwd: h.work,
    description: 'custom harness test',
    ...extra,
});

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

/** `kimi` as the fake agent in `scenario`; `entry` lines continue its config entry, `top` lines follow it. */
function fakeKimi(
    scenario: FakeScenario,
    entry: string[] = [],
    top: string[] = [],
    agentEnv: Record<string, string> = {}
): { ctx: RunContext; calls: () => FakeCall[]; tag: string; loaded: LoadedConfig } {
    const callLog = join(mkdtempSync(join(h.root, 'calls-')), 'calls.jsonl');
    const { loaded, tag } = h.fakeCustom('kimi', scenario, [...entry, ...top].join('\n'), {
        FAKE_CALL_LOG: callLog,
        FAKE_CONFIG_OPTIONS: JSON.stringify(OPTIONS),
        PROBE_ENTRY: '1',
        ...agentEnv,
    });
    return { ctx: h.makeCtx(loaded), calls: () => readFakeCalls(callLog), tag, loaded };
}

/** The calls as `<event> <value>`; `^` marks a resumed session, `start` shows argv after the tag and the probes. */
const summary = (calls: FakeCall[]) =>
    calls.map(c => {
        if (c.event === 'start') {
            const probes = Object.fromEntries(Object.entries(c.probes ?? {}).sort(([a], [b]) => a.localeCompare(b)));
            return `start ${JSON.stringify(c.argv.slice(1))} ${JSON.stringify(probes)}`;
        }
        const r = c.resumed ? '^' : '';
        if (c.event === 'set_mode') return `${r}set_mode ${c.modeId}`;
        if (c.event === 'set_config_option') return `${r}set_config_option ${c.configId}=${JSON.stringify(c.value)}`;
        if (c.event === 'set_model') return `${r}set_model ${c.modelId}`;
        return `${r}prompt`;
    });

function yaml(lines: string[]): LoadedConfig {
    const path = join(mkdtempSync(join(h.root, 'yaml-')), 'config.yaml');
    writeFileSync(path, `${lines.join('\n')}\n`);
    const loaded = loadConfig({ THRONG_MCP_CONFIG: path });
    expect(loaded.error, loaded.error).toBe(undefined);
    return loaded;
}

describe('custom harness runs (fake agent)', () => {
    it('harness_mode auto: launched as configured, auto_mode applied after session/new in order; recorded under its id', async () => {
        const { ctx, calls, tag } = fakeKimi('echo', AUTO_BLOCK);
        const payload = ok(await runThronglet(input('kimi/fake-small'), ctx));
        expect(payload.text).toMatch(/^echo: /);
        expect(payload.warnings).toBe(undefined);
        expect(summary(calls())).toStrictEqual([
            'start ["--auto-flag"] {"PROBE_AUTO":"yes","PROBE_ENTRY":"1"}',
            'set_mode auto',
            'set_config_option brave_mode=true',
            'set_config_option permission="bypass"',
            'set_config_option model="fake-small"',
            'prompt',
        ]);
        expect(calls()[0]).toMatchObject({ event: 'start', argv: [`--tag=${tag}`, '--auto-flag'] });
        expect((await readSessionRecord(ctx.cacheDir, payload.session_id))?.harness).toBe('kimi');
        expect(tagAlive(tag)).toBe(false);
    });

    it('harness_mode auto without auto_mode: the starting mode and a warning naming the key', async () => {
        const { ctx, calls } = fakeKimi('echo', ['    ask_mode: { mode: default }']);
        const payload = ok(await runThronglet(input('kimi/fake-small'), ctx));
        expect(payload.warnings).toStrictEqual([
            'custom_harnesses.kimi.auto_mode is not set: kimi runs in the mode it starts in',
        ]);
        expect(summary(calls()).slice(1)).toStrictEqual(['set_config_option model="fake-small"', 'prompt']);
    });

    it('harness_mode ask without ask_mode: the starting mode, no warning', async () => {
        const { ctx, calls } = fakeKimi('echo', [...AUTO_BLOCK, '    harness_mode: ask']);
        const payload = ok(await runThronglet(input('kimi/fake-small'), ctx));
        expect(payload.warnings).toBe(undefined);
        expect(summary(calls())).toStrictEqual([
            'start [] {"PROBE_ENTRY":"1"}',
            'set_config_option model="fake-small"',
            'prompt',
        ]);
    });

    it('harness_mode ask with ask_mode, permission_answers allow: ask_mode applied, requests allowed', async () => {
        const entry = [
            ...AUTO_BLOCK,
            '    harness_mode: ask',
            '    permission_answers: allow',
            '    ask_mode: { mode: default, args: ["--ask"] }',
        ];
        const echo = fakeKimi('echo', entry);
        expect(ok(await runThronglet(input('kimi/fake-small'), echo.ctx)).warnings).toBe(undefined);
        expect(summary(echo.calls())).toStrictEqual([
            'start ["--ask"] {"PROBE_ENTRY":"1"}',
            'set_mode default',
            'set_config_option model="fake-small"',
            'prompt',
        ]);
        const permission = fakeKimi('permission', entry);
        expect(ok(await runThronglet(input('kimi/fake-small'), permission.ctx)).text).toBe('allowed');
    });

    it('harness_mode auto without auto_mode: a permission request is still refused (§5)', async () => {
        const { ctx } = fakeKimi('permission');
        expect(ok(await runThronglet(input('kimi/fake-small'), ctx)).text).toBe('rejected');
    });

    it('permissions allow_all: ask_mode applied, permission requests allowed', async () => {
        const entry = [...AUTO_BLOCK, '    permissions: allow_all', '    ask_mode: { mode: default, args: ["--ask"] }'];
        const echo = fakeKimi('echo', entry);
        const payload = ok(await runThronglet(input('kimi/fake-small'), echo.ctx));
        expect(payload.warnings).toBe(undefined);
        expect(summary(echo.calls())).toStrictEqual([
            'start ["--ask"] {"PROBE_ENTRY":"1"}',
            'set_mode default',
            'set_config_option model="fake-small"',
            'prompt',
        ]);
        const permission = fakeKimi('permission', [], ['permissions: allow_all']);
        expect(ok(await runThronglet(input('kimi/fake-small'), permission.ctx)).text).toBe('allowed');
    });

    it('an auto_mode option the agent lacks → warning, the turn runs', async () => {
        const { ctx } = fakeKimi('echo', ['    auto_mode: { config_options: { turbo: on } }']);
        const payload = ok(await runThronglet(input('kimi/fake-small'), ctx));
        expect(payload.warnings).toStrictEqual(['permission option "turbo" not applied: kimi does not advertise it']);
    });

    it('model and effort through the options: exact effort set, any other a warning; an unknown model rejected', async () => {
        const { ctx } = fakeKimi('echo', AUTO_BLOCK);
        const high = ok(await runThronglet(input('kimi/fake-large:high'), ctx));
        expect(high.text ?? '').toMatch(/\[model=fake-large effort=high\]$/);
        expect(high.warnings).toBe(undefined);

        const max = ok(await runThronglet(input('kimi/fake-small:max'), ctx));
        expect(max.warnings).toStrictEqual(['effort "max" not available for kimi; options: low, high']);

        const none = fakeKimi('no-effort-option', AUTO_BLOCK);
        const ignored = ok(await runThronglet(input('kimi/fake-small:high'), none.ctx));
        expect(ignored.warnings).toStrictEqual(['effort "high" ignored: kimi exposes no effort option']);

        const nope = failed(await runThronglet(input('kimi/nope'), ctx), 'model_rejected');
        expect(nope.message).toBe('model "nope" is not available; valid models: fake-small, fake-large');
    });

    it('model through the session models list and session/set_model', async () => {
        const { ctx, calls } = fakeKimi('gemini', [], ['permissions: allow_all']);
        const payload = ok(await runThronglet(input('kimi/gemini-2.5-flash'), ctx));
        expect(payload.text ?? '').toMatch(/\[model=gemini-2\.5-flash effort=\?\]$/);
        expect(summary(calls()).slice(1)).toStrictEqual(['set_model gemini-2.5-flash', 'prompt']);
        const nope = failed(await runThronglet(input('kimi/nope'), ctx), 'model_rejected');
        expect(nope.message).toBe('model "nope" is not available; valid models: gemini-2.5-pro, gemini-2.5-flash');
    });

    it('command not found → harness_unavailable before spawn, no install hint', async () => {
        for (const [command, where] of [
            ['kimi-acp', 'not found on PATH'],
            ['/nonexistent/kimi-acp', 'not found or not executable'],
        ]) {
            const loaded = yaml(['custom_harnesses:', '  kimi:', `    command: ${command}`]);
            const payload = failed(await runThronglet(input('kimi/k2'), h.makeCtx(loaded)), 'harness_unavailable');
            expect(payload.message).toBe(`${command} (custom_harnesses.kimi.command) ${where}`);
        }
    });

    it('an id neither built-in nor configured → harness_unavailable listing the built-in and the configured ids', async () => {
        const loaded = yaml(['custom_harnesses:', '  kimi: { command: kimi }', '  qwen.code: { command: qwen }']);
        const payload = failed(await runThronglet(input('glm/x:high'), h.makeCtx(loaded)), 'harness_unavailable');
        expect(payload.message).toBe(
            'Unknown harness "glm" in agent spec "glm/x:high"; valid harnesses: claude, codex, opencode, gemini, kimi, qwen.code'
        );
    });

    it('send_message: a resumed turn launches with the setup again and re-applies it after session/resume', async () => {
        const { ctx, calls } = fakeKimi('echo', AUTO_BLOCK);
        const first = ok(await runThronglet(input('kimi/fake-large:high'), ctx));
        const second = ok(await sendMessage({ session_id: first.session_id, prompt: 'again' }, ctx));
        expect(second.session_id).toBe(first.session_id);
        expect(second.warnings).toBe(undefined);
        expect(summary(calls()).slice(7)).toStrictEqual([
            'start ["--auto-flag"] {"PROBE_AUTO":"yes","PROBE_ENTRY":"1"}',
            '^set_mode auto',
            '^set_config_option brave_mode=true',
            '^set_config_option permission="bypass"',
            '^set_config_option model="fake-large"',
            '^set_config_option effort="high"',
            '^prompt',
        ]);
    });

    it('a session whose harness left the config: send_message fails before spawn; list, wait and cancel work', async () => {
        const kimiRun = fakeKimi('echo', AUTO_BLOCK);
        const first = ok(await runThronglet(input('kimi/fake-small'), kimiRun.ctx));
        const record = await readSessionRecord(kimiRun.ctx.cacheDir, first.session_id);

        // The same cache under a config without kimi.
        const { loaded, tag } = h.fakeClaude('echo');
        const ctx = h.makeCtx(loaded, { cacheDir: kimiRun.ctx.cacheDir });
        const payload = failed(
            await sendMessage({ session_id: first.session_id, prompt: 'x' }, ctx),
            'harness_unavailable'
        );
        expect(payload.message).toBe(
            `Unknown harness "kimi" in session ${first.session_id}; valid harnesses: claude, codex, opencode, gemini`
        );
        expect(payload.session_id).toBe(undefined);
        expect(tagAlive(tag)).toBe(false);
        expect(await readSessionRecord(ctx.cacheDir, first.session_id)).toStrictEqual(record);

        const listed = await listThronglets(ctx.cacheDir, ctx.sessions);
        expect(listed.thronglets.map(t => [t.session_id, t.agent, t.state])).toStrictEqual([
            [first.session_id, 'kimi/fake-small', 'idle'],
        ]);

        const waited = await waitThronglet(
            { session_id: first.session_id },
            {
                sessions: ctx.sessions,
                cacheDir: ctx.cacheDir,
                signal: ctx.signal,
                progress: noProgress,
                defaultTimeoutS: 5,
            }
        );
        expect(waited).toStrictEqual({ ok: true, payload: first });

        const cancelled = await cancelThronglet(first.session_id, {
            sessions: ctx.sessions,
            cacheDir: ctx.cacheDir,
            stopMs: stopBoundMs({ handshakeMs: 5000 }),
        });
        expect(cancelled).toStrictEqual({ session_id: first.session_id, state: 'idle', cancelled_turn: false });
    });
});

describe('list_harnesses with custom harnesses', () => {
    it('a configured custom harness is probed and listed under its id, after the built-in ones', async () => {
        const { loaded, tag } = fakeKimi('echo', AUTO_BLOCK);
        const out = await listHarnesses(loaded, { handshakeMs: 5000, depth: 0, env: { PATH: bin } });
        expect(out.harnesses).toHaveLength(1);
        expect(out.harnesses[0]).toMatchObject({
            harness: 'kimi',
            command: [process.execPath, expect.stringMatching(/agent\.ts$/), `--tag=${tag}`],
            models: ['fake-small', 'fake-large'],
            efforts: ['low', 'high'],
            version: '0.0.1',
        });
        expect(out.unavailable.map(u => u.harness)).toStrictEqual(['claude', 'codex', 'opencode', 'gemini']);
        expect(tagAlive(tag), 'probed fake agent still running').toBe(false);
    });

    it('a custom harness whose command is missing is unavailable with the reason', async () => {
        const loaded = yaml([
            'custom_harnesses:',
            '  kimi: { command: kimi-acp }',
            '  zed-agent: { command: /nonexistent/zed }',
        ]);
        const out = await listHarnesses(loaded, { handshakeMs: 5000, depth: 0, env: { PATH: bin } });
        expect(out.harnesses).toStrictEqual([]);
        expect(out.unavailable.slice(4)).toStrictEqual([
            { harness: 'kimi', reason: 'kimi-acp (custom_harnesses.kimi.command) not found on PATH' },
            {
                harness: 'zed-agent',
                reason: '/nonexistent/zed (custom_harnesses.zed-agent.command) not found or not executable',
            },
        ]);
    });

    it('a config error lists only the built-in harnesses as unavailable', async () => {
        const path = join(mkdtempSync(join(h.root, 'yaml-')), 'config.yaml');
        writeFileSync(path, 'custom_harnesses:\n  kimi: {}\n');
        const loaded = loadConfig({ THRONG_MCP_CONFIG: path });
        const out = await listHarnesses(loaded, { handshakeMs: 5000, depth: 0, env: { PATH: bin } });
        expect(out.unavailable.map(u => u.harness)).toStrictEqual(['claude', 'codex', 'opencode', 'gemini']);
        expect(out.unavailable[0]?.reason).toMatch(
            /^config error: .*custom_harnesses\.kimi\.command: Invalid input: expected string, received undefined$/
        );
    });
});

describe('a custom harness with a built-in id', () => {
    // harnesses.claude points at a command that does not exist and asks for deny_all: neither may take effect.
    const OVERRIDE = ['harnesses:', '  claude: { command: /nonexistent/claude-acp, permissions: deny_all }'];

    function fakeCustomClaude(
        scenario: FakeScenario,
        entry: string[] = []
    ): { ctx: RunContext; calls: () => FakeCall[]; tag: string; loaded: LoadedConfig } {
        const callLog = join(mkdtempSync(join(h.root, 'calls-')), 'calls.jsonl');
        const { loaded, tag } = h.fakeCustom('claude', scenario, [...entry, ...OVERRIDE].join('\n'), {
            FAKE_CALL_LOG: callLog,
            FAKE_CONFIG_OPTIONS: JSON.stringify(OPTIONS),
            PROBE_ENTRY: '1',
        });
        return { ctx: h.makeCtx(loaded), calls: () => readFakeCalls(callLog), tag, loaded };
    }

    it('a run launches the custom command with its auto_mode; a resumed turn stays on it', async () => {
        const { ctx, calls } = fakeCustomClaude('echo', AUTO_BLOCK);
        const first = ok(await runThronglet(input('claude/fake-small'), ctx));
        expect(first.warnings).toBe(undefined);
        expect(summary(calls())).toStrictEqual([
            'start ["--auto-flag"] {"PROBE_AUTO":"yes","PROBE_ENTRY":"1"}',
            'set_mode auto',
            'set_config_option brave_mode=true',
            'set_config_option permission="bypass"',
            'set_config_option model="fake-small"',
            'prompt',
        ]);
        expect((await readSessionRecord(ctx.cacheDir, first.session_id))?.harness).toBe('claude');

        ok(await sendMessage({ session_id: first.session_id, prompt: 'again' }, ctx));
        expect(summary(calls()).slice(6, 8)).toStrictEqual([
            'start ["--auto-flag"] {"PROBE_AUTO":"yes","PROBE_ENTRY":"1"}',
            '^set_mode auto',
        ]);
    });

    it('the permission settings come from custom_harnesses.claude, not harnesses.claude', async () => {
        const allow = fakeCustomClaude('permission', ['    permissions: allow_all']);
        expect(ok(await runThronglet(input('claude/fake-small'), allow.ctx)).text).toBe('allowed');

        const elicit = fakeCustomClaude('echo', ['    permissions: elicit']);
        const payload = failed(await runThronglet(input('claude/fake-small'), elicit.ctx), 'elicitation_unsupported');
        expect(payload.message).toContain('set custom_harnesses.claude.permissions in the throng config');
    });

    it('once the custom entry is gone, its sessions go to the built-in harness (DESIGN §3.3)', async () => {
        const custom = fakeCustomClaude('echo');
        const first = ok(await runThronglet(input('claude/fake-small'), custom.ctx));

        // The same cache under a config without custom_harnesses.claude: the built-in claude, whose adapter is not on PATH.
        const { loaded } = h.fakeAs('codex', 'echo');
        const ctx = h.makeCtx(loaded, { cacheDir: custom.ctx.cacheDir });
        const payload = failed(
            await sendMessage({ session_id: first.session_id, prompt: 'x' }, ctx),
            'harness_unavailable'
        );
        expect(payload.message).toMatch(/^claude-agent-acp not found on PATH; install: /);
    });

    it('list_harnesses: one claude row, the custom one', async () => {
        const { loaded, tag } = fakeCustomClaude('echo');
        const out = await listHarnesses(loaded, { handshakeMs: 5000, depth: 0, env: { PATH: bin } });
        expect(out.harnesses).toHaveLength(1);
        expect(out.harnesses[0]).toMatchObject({
            harness: 'claude',
            command: [process.execPath, expect.stringMatching(/agent\.ts$/), `--tag=${tag}`],
            models: ['fake-small', 'fake-large'],
        });
        expect(out.unavailable.map(u => u.harness)).toStrictEqual(['codex', 'opencode', 'gemini']);
    });
});

describe('elicitation_unsupported on a custom harness', () => {
    it('names custom_harnesses.<id>.permissions', async () => {
        const { ctx } = fakeKimi('echo', ['    permissions: elicit']);
        const payload = failed(await runThronglet(input('kimi/fake-small'), ctx), 'elicitation_unsupported');
        expect(payload.message).toContain('set custom_harnesses.kimi.permissions in the throng config');
    });

    it('names custom_harnesses.<id>.permission_answers', async () => {
        const { ctx } = fakeKimi('echo', ['    permission_answers: elicit']);
        const payload = failed(await runThronglet(input('kimi/fake-small'), ctx), 'elicitation_unsupported');
        expect(payload.message).toContain(
            'set custom_harnesses.kimi.permission_answers in the throng config to auto, allow or deny'
        );
    });
});
