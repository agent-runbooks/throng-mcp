import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { type Config, DEFAULT_CONFIG, type HarnessMode } from '../config.ts';
import { HARNESS_IDS } from '../contract.ts';
import { HARNESSES, findOnPath, harnessFor, harnessIds, shadowedHarnesses } from './index.ts';
import type { HarnessLaunch, HarnessResolution } from './types.ts';

const root = mkdtempSync(join(tmpdir(), 'throng-harnesses-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let dirs = 0;
/** A fresh PATH dir holding executable stubs for `bins`. */
function pathDir(bins: string[]): string {
    const dir = join(root, `bin-${dirs++}`);
    mkdirSync(dir);
    for (const bin of bins) {
        writeFileSync(join(dir, bin), '#!/bin/sh\nexit 0\n');
        chmodSync(join(dir, bin), 0o755);
    }
    return dir;
}

function withHarnesses(harnesses: Config['harnesses']): Config {
    return { ...DEFAULT_CONFIG, harnesses };
}

function launchOf(resolution: HarnessResolution): HarnessLaunch {
    if (!resolution.available) expect.unreachable(resolution.reason);
    return resolution.launch;
}

function reasonOf(resolution: HarnessResolution): string {
    expect(resolution.available).toBe(false);
    return resolution.available ? '' : resolution.reason;
}

const ALL_BINS = ['claude-agent-acp', 'claude', 'codex-acp', 'codex', 'opencode', 'gemini'];

describe('PATH lookup', () => {
    it('findOnPath skips non-executable files, directories and relative entries', () => {
        const plain = pathDir([]);
        writeFileSync(join(plain, 'tool'), '');
        mkdirSync(join(plain, 'dirtool'));
        const exec = pathDir(['tool', 'dirtool']);
        const env = { PATH: ['', 'relative', plain, exec].join(':') };
        expect(findOnPath('tool', env)).toBe(join(exec, 'tool'));
        expect(findOnPath('dirtool', env)).toBe(join(exec, 'dirtool'));
        expect(findOnPath('missing', env)).toBe(undefined);
        expect(findOnPath('tool', {})).toBe(undefined);
    });

    it('HARNESSES covers every harness id', () => {
        expect(Object.keys(HARNESSES)).toStrictEqual([...HARNESS_IDS]);
        for (const id of HARNESS_IDS) expect(harnessFor(id, DEFAULT_CONFIG)?.id).toBe(id);
    });
});

describe('harnessFor and harnessIds', () => {
    const config: Config = {
        ...withHarnesses({ claude: { permissions: 'deny_all' } }),
        custom_harnesses: { kimi: { command: 'kimi', args: ['acp'] }, 'qwen.code': { command: 'qwen' } },
    };
    const shadowing: Config = {
        ...withHarnesses({ claude: { command: 'other-claude' } }),
        custom_harnesses: { kimi: { command: 'kimi' }, claude: { command: 'my-claude', args: ['acp'] } },
    };

    it('custom harnesses from the config, else the built-in ones; anything else is unknown', () => {
        expect(harnessFor('claude', config)).toBe(HARNESSES.claude);
        const kimi = harnessFor('kimi', config);
        expect(kimi?.id).toBe('kimi');
        expect(harnessFor('glm', config)).toBe(undefined);
        expect(harnessFor('kimi', DEFAULT_CONFIG)).toBe(undefined);
        expect(harnessFor('constructor', config)).toBe(undefined);
    });

    it('lists the built-in ids, then the custom ids in config order', () => {
        expect(harnessIds(config)).toStrictEqual([...HARNESS_IDS, 'kimi', 'qwen.code']);
        expect(harnessIds(DEFAULT_CONFIG)).toStrictEqual([...HARNESS_IDS]);
    });

    it('a custom harness with a built-in id wins: resolved from its entry, listed once, reported as shadowing', () => {
        const def = harnessFor('claude', shadowing);
        if (!def) expect.unreachable('custom claude not found');
        expect(def).not.toBe(HARNESSES.claude);
        expect(def.id).toBe('claude');
        const dir = pathDir(['my-claude', 'other-claude', 'claude-agent-acp']);
        expect(launchOf(def.resolve(shadowing, { PATH: dir }))).toStrictEqual({
            command: join(dir, 'my-claude'),
            args: ['acp'],
            env: {},
        });
        expect(harnessIds(shadowing)).toStrictEqual([...HARNESS_IDS, 'kimi']);
        expect(shadowedHarnesses(shadowing)).toStrictEqual(['claude']);
        expect(shadowedHarnesses(config)).toStrictEqual([]);
    });
});

describe('resolve', () => {
    it('all present: adapters from PATH, harness binaries in env', () => {
        const dir = pathDir(ALL_BINS);
        const env = { PATH: dir };
        expect(launchOf(HARNESSES.claude.resolve(DEFAULT_CONFIG, env))).toStrictEqual({
            command: join(dir, 'claude-agent-acp'),
            args: [],
            env: { CLAUDE_CODE_EXECUTABLE: join(dir, 'claude') },
        });
        expect(launchOf(HARNESSES.codex.resolve(DEFAULT_CONFIG, env))).toStrictEqual({
            command: join(dir, 'codex-acp'),
            args: [],
            env: { CODEX_PATH: join(dir, 'codex') },
        });
        expect(launchOf(HARNESSES.opencode.resolve(DEFAULT_CONFIG, env))).toStrictEqual({
            command: join(dir, 'opencode'),
            args: ['acp'],
            env: {},
        });
        expect(launchOf(HARNESSES.gemini.resolve(DEFAULT_CONFIG, env))).toStrictEqual({
            command: join(dir, 'gemini'),
            args: ['--acp'],
            env: {},
        });
    });

    it('adapter missing, no override: not installed, the reason carries the install command', () => {
        const env = { PATH: pathDir(['claude', 'codex']) };
        expect(
            Object.fromEntries(HARNESS_IDS.map(id => [id, HARNESSES[id].resolve(DEFAULT_CONFIG, env)]))
        ).toStrictEqual({
            claude: {
                available: false,
                reason: 'claude-agent-acp not found on PATH; install: npm i -g @agentclientprotocol/claude-agent-acp',
                notInstalled: true,
            },
            codex: {
                available: false,
                reason: 'codex-acp not found on PATH; install: npm i -g @agentclientprotocol/codex-acp',
                notInstalled: true,
            },
            opencode: {
                available: false,
                reason: 'opencode not found on PATH; install: see https://opencode.ai/docs (binary install)',
                notInstalled: true,
            },
            gemini: {
                available: false,
                reason: 'gemini not found on PATH; install: npm i -g @google/gemini-cli',
                notInstalled: true,
            },
            cursor: {
                available: false,
                reason: 'cursor-agent not found on PATH; install: curl https://cursor.com/install -fsS | bash',
                notInstalled: true,
            },
        });
    });

    it('harness binary missing alone does not make the harness unavailable', () => {
        const env = { PATH: pathDir(['claude-agent-acp', 'codex-acp']) };
        expect(launchOf(HARNESSES.claude.resolve(DEFAULT_CONFIG, env)).env).toStrictEqual({});
        expect(launchOf(HARNESSES.codex.resolve(DEFAULT_CONFIG, env)).env).toStrictEqual({});
    });

    it('harness binary env var already set in the server environment is left alone', () => {
        const env = { PATH: pathDir(['claude-agent-acp', 'claude']), CLAUDE_CODE_EXECUTABLE: '/elsewhere/claude' };
        expect(launchOf(HARNESSES.claude.resolve(DEFAULT_CONFIG, env)).env).toStrictEqual({});
    });

    it('config override: command, args and env win; configured env is not overwritten from PATH', () => {
        const dir = pathDir(ALL_BINS);
        const custom = join(pathDir(['my-adapter']), 'my-adapter');
        const config = withHarnesses({
            claude: {
                command: custom,
                args: ['--flag'],
                env: { CLAUDE_CODE_EXECUTABLE: '/custom/claude', EXTRA: '1' },
            },
            codex: { env: { OTHER: 'x' } },
        });
        expect(launchOf(HARNESSES.claude.resolve(config, { PATH: dir }))).toStrictEqual({
            command: custom,
            args: ['--flag'],
            env: { CLAUDE_CODE_EXECUTABLE: '/custom/claude', EXTRA: '1' },
        });
        // Config env merges over the PATH-derived harness env.
        expect(launchOf(HARNESSES.codex.resolve(config, { PATH: dir })).env).toStrictEqual({
            CODEX_PATH: join(dir, 'codex'),
            OTHER: 'x',
        });
    });

    it('config override: bare command is looked up on PATH; a missing one is named in the reason and not marked notInstalled', () => {
        const dir = pathDir(['my-opencode']);
        const found = withHarnesses({ opencode: { command: 'my-opencode' } });
        expect(launchOf(HARNESSES.opencode.resolve(found, { PATH: dir }))).toStrictEqual({
            command: join(dir, 'my-opencode'),
            args: ['acp'],
            env: {},
        });

        const bare = withHarnesses({ opencode: { command: 'nope-opencode' } });
        expect(HARNESSES.opencode.resolve(bare, { PATH: dir })).toStrictEqual({
            available: false,
            reason: 'nope-opencode (harnesses.opencode.command) not found on PATH; install: see https://opencode.ai/docs (binary install)',
        });

        const path = withHarnesses({ claude: { command: join(root, 'no-such-adapter') } });
        const pathResolution = HARNESSES.claude.resolve(path, { PATH: pathDir(ALL_BINS) });
        expect(pathResolution).not.toHaveProperty('notInstalled');
        const pathReason = reasonOf(pathResolution);
        expect(
            pathReason.startsWith(
                `${join(root, 'no-such-adapter')} (harnesses.claude.command) not found or not executable`
            ),
            pathReason
        ).toBe(true);
        expect(pathReason).toContain('npm i -g @agentclientprotocol/claude-agent-acp');
    });
});

describe('mapEffort', () => {
    it('claude: exact value or nothing', () => {
        const options = ['default', 'low', 'medium', 'high', 'xhigh', 'max'];
        expect(HARNESSES.claude.mapEffort('high', options)).toBe('high');
        expect(HARNESSES.claude.mapEffort('max', options)).toBe('max');
        expect(HARNESSES.claude.mapEffort('max', ['low', 'high'])).toBe(undefined);
    });

    it('codex: exact, else max → xhigh', () => {
        expect(HARNESSES.codex.mapEffort('max', ['low', 'medium', 'high', 'xhigh'])).toBe('xhigh');
        expect(HARNESSES.codex.mapEffort('max', ['low', 'xhigh', 'max'])).toBe('max');
        expect(HARNESSES.codex.mapEffort('medium', ['low', 'medium'])).toBe('medium');
        expect(HARNESSES.codex.mapEffort('max', ['low', 'high'])).toBe(undefined);
        expect(HARNESSES.codex.mapEffort('xhigh', ['low', 'high'])).toBe(undefined);
    });

    it('opencode: exact value or nothing', () => {
        expect(HARNESSES.opencode.mapEffort('high', [])).toBe(undefined);
        expect(HARNESSES.opencode.mapEffort('high', ['low', 'high'])).toBe('high');
    });
});

describe('permissionSetup', () => {
    const modes: HarnessMode[] = ['auto', 'ask'];
    const ask = { env: { OPENCODE_CONFIG_CONTENT: '{"permission":"ask"}' } };
    const trust = { GEMINI_CLI_TRUST_WORKSPACE: 'true' };
    const expected = {
        claude: { auto: { modeId: 'auto' }, ask: { modeId: 'default' } },
        codex: { auto: { modeId: 'agent' }, ask: { modeId: 'read-only' } },
        opencode: { auto: {}, ask },
        gemini: { auto: { modeId: 'yolo', env: trust }, ask: { modeId: 'default', env: trust } },
        cursor: { auto: { args: ['--force'] }, ask: {} },
    } as const;

    for (const id of HARNESS_IDS) {
        for (const mode of modes) {
            it(`${id} × ${mode}`, () => {
                expect(HARNESSES[id].permissionSetup(mode)).toStrictEqual(expected[id][mode]);
            });
        }
    }
});
