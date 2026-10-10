import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, loadConfig, readDepth } from './config.ts';

const dir = mkdtempSync(join(tmpdir(), 'throng-config-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function withFile(name: string, content: string): NodeJS.ProcessEnv {
    const path = join(dir, name);
    writeFileSync(path, content);
    return { THRONG_MCP_CONFIG: path };
}

describe('loadConfig', () => {
    it('has the DESIGN §8 defaults', () => {
        expect(DEFAULT_CONFIG).toStrictEqual({
            permissions: 'auto',
            harnesses: {},
            limits: { timeout_s: 21600, handshake_s: 60, elicitation_s: 600, max_concurrency: 10, max_depth: 2 },
        });
    });

    it('returns defaults without an error when the file is missing', () => {
        const path = join(dir, 'missing.yaml');
        const loaded = loadConfig({ THRONG_MCP_CONFIG: path });
        expect(loaded).toStrictEqual({ config: DEFAULT_CONFIG, path });
    });

    it('defaults the path to ~/.config/throng/config.yaml', () => {
        expect(loadConfig({}).path).toMatch(/\/\.config\/throng\/config\.yaml$/);
    });

    it('treats an empty file as defaults', () => {
        const loaded = loadConfig(withFile('empty.yaml', ''));
        expect(loaded.error).toBe(undefined);
        expect(loaded.config).toStrictEqual(DEFAULT_CONFIG);
    });

    it('treats sections without a value as absent', () => {
        const loaded = loadConfig(
            withFile('empty-sections.yaml', 'permissions:\nharnesses:\nlimits:\n  # timeout_s: 10\n')
        );
        expect(loaded.error).toBe(undefined);
        expect(loaded.config).toStrictEqual(DEFAULT_CONFIG);
    });

    it('treats a harness entry without a value as an empty override', () => {
        const loaded = loadConfig(
            withFile('empty-harness.yaml', 'harnesses:\n  codex:\n    # permissions: allow_all\n')
        );
        expect(loaded.error).toBe(undefined);
        expect(loaded.config.harnesses).toStrictEqual({ codex: {} });
    });

    it('merges file values over the defaults', () => {
        const env = withFile(
            'partial.yaml',
            [
                'permissions: deny_all',
                'harnesses:',
                '  opencode: { command: /opt/opencode, args: [acp], env: { X: "1" } }',
                '  codex: { permissions: allow_all }',
                'limits: { max_depth: 3, timeout_s: 100 }',
            ].join('\n')
        );
        const loaded = loadConfig(env);
        expect(loaded.error).toBe(undefined);
        expect(loaded.config).toStrictEqual({
            permissions: 'deny_all',
            harnesses: {
                opencode: { command: '/opt/opencode', args: ['acp'], env: { X: '1' } },
                codex: { permissions: 'allow_all' },
            },
            limits: { ...DEFAULT_CONFIG.limits, max_depth: 3, timeout_s: 100 },
        });
    });

    it('reports invalid YAML as one line with the path, keeping defaults', () => {
        const env = withFile('broken.yaml', 'limits: { max_depth: 3\npermissions: [\n');
        const loaded = loadConfig(env);
        expect(loaded.config).toStrictEqual(DEFAULT_CONFIG);
        const error = loaded.error ?? '';
        expect(error.startsWith(`${env.THRONG_MCP_CONFIG}: invalid YAML: `), error).toBe(true);
        expect(error).not.toContain('\n');
    });

    it('reports schema violations with the field path, keeping defaults', () => {
        const env = withFile('bad.yaml', 'permissions: yolo\nharnesses: { nope: {} }\nlimits: { max_depth: -1 }\n');
        const loaded = loadConfig(env);
        expect(loaded.config).toStrictEqual(DEFAULT_CONFIG);
        const error = loaded.error ?? '';
        expect(error.startsWith(`${env.THRONG_MCP_CONFIG}: invalid config: `), error).toBe(true);
        for (const field of ['permissions', 'harnesses', 'limits.max_depth']) expect(error, error).toContain(field);
        expect(error).not.toContain('\n');
    });

    it('rejects unknown keys', () => {
        const loaded = loadConfig(withFile('typo.yaml', 'limit: { max_depth: 3 }\n'));
        expect(loaded.error ?? '').toMatch(/invalid config: .*limit/);
    });

    it('reports an unreadable path, keeping defaults', () => {
        const loaded = loadConfig({ THRONG_MCP_CONFIG: dir });
        expect(loaded.config).toStrictEqual(DEFAULT_CONFIG);
        expect(loaded.error?.startsWith(`${dir}: cannot read: `), loaded.error).toBe(true);
    });
});

describe('loadConfig: user harnesses', () => {
    const errorOf = (name: string, content: string) => {
        const loaded = loadConfig(withFile(name, content));
        expect(loaded.config).toStrictEqual(DEFAULT_CONFIG);
        return loaded.error ?? '';
    };

    it('accepts a user harness entry with every key', () => {
        const loaded = loadConfig(
            withFile(
                'user.yaml',
                [
                    'harnesses:',
                    '  kimi:',
                    '    command: kimi',
                    '    args: [acp]',
                    '    env: { KIMI_X: "1" }',
                    '    permissions: allow_all',
                    '    auto_approve:',
                    '      mode: yolo',
                    '      config_options: { permission: bypass, brave_mode: true }',
                    '      args: []',
                    '      env: {}',
                    '    ask_approval:',
                    '      mode: default',
                    '  qwen.code_2-x: { command: /opt/qwen }',
                ].join('\n')
            )
        );
        expect(loaded.error).toBe(undefined);
        expect(loaded.config.harnesses).toStrictEqual({
            kimi: {
                command: 'kimi',
                args: ['acp'],
                env: { KIMI_X: '1' },
                permissions: 'allow_all',
                auto_approve: {
                    mode: 'yolo',
                    config_options: { permission: 'bypass', brave_mode: true },
                    args: [],
                    env: {},
                },
                ask_approval: { mode: 'default' },
            },
            'qwen.code_2-x': { command: '/opt/qwen' },
        });
        expect(Object.keys(loaded.config.harnesses.kimi?.auto_approve?.config_options ?? {})).toStrictEqual([
            'permission',
            'brave_mode',
        ]);
    });

    it('rejects a user harness without command, also one with no value', () => {
        for (const [name, entry] of [
            ['no-command.yaml', '  kimi: { args: [acp] }'],
            ['no-value.yaml', '  kimi:'],
        ] as const) {
            const error = errorOf(name, `harnesses:\n${entry}\n`);
            expect(error).toMatch(
                /invalid config: harnesses\.kimi\.command: required for a user harness \(kimi is not one of the native claude, codex, opencode, gemini\)$/
            );
        }
    });

    it('rejects an id with "/" or ":"', () => {
        for (const id of ['a/b', 'a:b']) {
            const error = errorOf(
                `bad-id-${id.length}-${id.charCodeAt(1)}.yaml`,
                `harnesses:\n  "${id}": { command: x }\n`
            );
            expect(error).toContain(`invalid config: harnesses.${id}: a user harness id is`);
        }
    });

    it('rejects auto_approve and ask_approval on a native harness, naming the key path', () => {
        const error = errorOf(
            'native-approval.yaml',
            'harnesses:\n  claude: { auto_approve: { mode: x } }\n  codex: { ask_approval: {} }\n'
        );
        expect(error).toContain(
            'harnesses.claude.auto_approve: claude is a native harness; auto_approve is only for user harnesses'
        );
        expect(error).toContain(
            'harnesses.codex.ask_approval: codex is a native harness; ask_approval is only for user harnesses'
        );
    });

    it('rejects a null auto_approve or ask_approval on a native harness', () => {
        const error = errorOf(
            'native-approval-null.yaml',
            'harnesses:\n  claude:\n    auto_approve:\n  codex:\n    ask_approval: null\n'
        );
        expect(error).toContain(
            'harnesses.claude.auto_approve: claude is a native harness; auto_approve is only for user harnesses'
        );
        expect(error).toContain(
            'harnesses.codex.ask_approval: codex is a native harness; ask_approval is only for user harnesses'
        );
    });

    it('rejects an unknown key or a bad value in an approval block', () => {
        expect(
            errorOf('approval-key.yaml', 'harnesses:\n  kimi: { command: k, auto_approve: { bogus: 1 } }\n')
        ).toMatch(/harnesses\.kimi\.auto_approve: .*"bogus"/);
        expect(
            errorOf(
                'approval-value.yaml',
                'harnesses:\n  kimi: { command: k, ask_approval: { config_options: { a: 1 } } }\n'
            )
        ).toContain('harnesses.kimi.ask_approval.config_options.a');
        expect(
            errorOf('approval-mode.yaml', 'harnesses:\n  kimi: { command: k, ask_approval: { mode: "" } }\n')
        ).toContain('harnesses.kimi.ask_approval.mode');
    });

    it('an approval block with no value counts as absent', () => {
        const loaded = loadConfig(
            withFile('approval-null.yaml', 'harnesses:\n  kimi:\n    command: k\n    auto_approve:\n')
        );
        expect(loaded.error).toBe(undefined);
        expect(loaded.config.harnesses.kimi?.command).toBe('k');
        expect(loaded.config.harnesses.kimi?.auto_approve).toBe(undefined);
    });
});

describe('readDepth', () => {
    it('reads a non-negative integer', () => {
        expect(readDepth({})).toBe(0);
        expect(readDepth({ THRONG_MCP_DEPTH: '0' })).toBe(0);
        expect(readDepth({ THRONG_MCP_DEPTH: '1' })).toBe(1);
        expect(readDepth({ THRONG_MCP_DEPTH: ' 3 ' })).toBe(3);
    });

    it('treats garbage as 0', () => {
        for (const value of ['', '-1', '1.5', 'abc', '2x', '1e3'])
            expect(readDepth({ THRONG_MCP_DEPTH: value }), value).toBe(0);
    });

    it('treats values beyond a safe integer as 0', () => {
        expect(readDepth({ THRONG_MCP_DEPTH: '9007199254740993' })).toBe(0);
        expect(readDepth({ THRONG_MCP_DEPTH: '9'.repeat(400) })).toBe(0);
    });
});
