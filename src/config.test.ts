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
            harnesses: {},
            custom_harnesses: {},
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
            withFile(
                'empty-sections.yaml',
                'permissions:\nharness_mode:\npermission_answers:\nharnesses:\nlimits:\n  # timeout_s: 10\n'
            )
        );
        expect(loaded.error).toBe(undefined);
        // A key with no value parses as present-but-undefined, the same as absent at resolution.
        expect(loaded.config).toEqual(DEFAULT_CONFIG);
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
            custom_harnesses: {},
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

describe('loadConfig: custom harnesses', () => {
    const errorOf = (name: string, content: string) => {
        const loaded = loadConfig(withFile(name, content));
        expect(loaded.config).toStrictEqual(DEFAULT_CONFIG);
        return loaded.error ?? '';
    };

    it('accepts a custom harness entry with every key, next to built-in overrides', () => {
        const loaded = loadConfig(
            withFile(
                'custom.yaml',
                [
                    'harnesses:',
                    '  claude: { permissions: deny_all }',
                    'custom_harnesses:',
                    '  kimi:',
                    '    command: kimi',
                    '    args: [acp]',
                    '    env: { KIMI_X: "1" }',
                    '    permissions: allow_all',
                    '    auto_mode:',
                    '      mode: yolo',
                    '      config_options: { permission: bypass, brave_mode: true }',
                    '      args: []',
                    '      env: {}',
                    '    ask_mode:',
                    '      mode: default',
                    '  qwen.code_2-x: { command: /opt/qwen }',
                ].join('\n')
            )
        );
        expect(loaded.error).toBe(undefined);
        expect(loaded.config.harnesses).toStrictEqual({ claude: { permissions: 'deny_all' } });
        expect(loaded.config.custom_harnesses).toStrictEqual({
            kimi: {
                command: 'kimi',
                args: ['acp'],
                env: { KIMI_X: '1' },
                permissions: 'allow_all',
                auto_mode: {
                    mode: 'yolo',
                    config_options: { permission: 'bypass', brave_mode: true },
                    args: [],
                    env: {},
                },
                ask_mode: { mode: 'default' },
            },
            'qwen.code_2-x': { command: '/opt/qwen' },
        });
        expect(Object.keys(loaded.config.custom_harnesses.kimi?.auto_mode?.config_options ?? {})).toStrictEqual([
            'permission',
            'brave_mode',
        ]);
    });

    it('accepts a custom harness with a built-in id', () => {
        const loaded = loadConfig(
            withFile('custom-claude.yaml', 'custom_harnesses:\n  claude: { command: my-claude }\n')
        );
        expect(loaded.error).toBe(undefined);
        expect(loaded.config.custom_harnesses).toStrictEqual({ claude: { command: 'my-claude' } });
        expect(loaded.config.harnesses).toStrictEqual({});
    });

    it('custom_harnesses with no value counts as absent', () => {
        const loaded = loadConfig(withFile('custom-null.yaml', 'custom_harnesses:\n  # kimi: { command: kimi }\n'));
        expect(loaded.error).toBe(undefined);
        expect(loaded.config).toStrictEqual(DEFAULT_CONFIG);
    });

    it('rejects a custom harness without command, also one with no value or an empty command', () => {
        for (const [name, entry] of [
            ['no-command.yaml', '  kimi: { args: [acp] }'],
            ['no-value.yaml', '  kimi:'],
        ] as const) {
            const error = errorOf(name, `custom_harnesses:\n${entry}\n`);
            expect(error).toMatch(/invalid config: custom_harnesses\.kimi\.command: Invalid input: expected string/);
        }
        expect(errorOf('empty-command.yaml', 'custom_harnesses:\n  kimi: { command: "" }\n')).toContain(
            'invalid config: custom_harnesses.kimi.command: '
        );
    });

    it('rejects an id outside letters, digits, ".", "_", "-"', () => {
        for (const [i, id] of ['a/b', 'a:b', '-x', '.x', 'a b'].entries()) {
            const error = errorOf(`bad-id-${i}.yaml`, `custom_harnesses:\n  "${id}": { command: x }\n`);
            expect(error).toContain(
                `invalid config: custom_harnesses.${id}: a custom harness id is letters, digits, ".", "_" and "-", starting with a letter or digit`
            );
        }
    });

    it('harnesses takes only the built-in ids', () => {
        const error = errorOf('harnesses-kimi.yaml', 'harnesses:\n  kimi: { command: kimi }\n');
        expect(error).toMatch(/invalid config: harnesses: .*"kimi"/);
    });

    it('rejects auto_mode and ask_mode under harnesses as unknown keys', () => {
        const error = errorOf(
            'builtin-mode.yaml',
            'harnesses:\n  claude: { auto_mode: { mode: x } }\n  codex: { ask_mode: {} }\n'
        );
        expect(error).toMatch(/harnesses\.claude: .*"auto_mode"/);
        expect(error).toMatch(/harnesses\.codex: .*"ask_mode"/);
    });

    it('rejects auto_approve and ask_approval under custom_harnesses as unknown keys', () => {
        const error = errorOf(
            'old-blocks.yaml',
            'custom_harnesses:\n  kimi: { command: k, auto_approve: { mode: x }, ask_approval: {} }\n'
        );
        expect(error).toMatch(/custom_harnesses\.kimi: .*"auto_approve"/);
        expect(error).toContain('"ask_approval"');
    });

    it('rejects an unknown key or a bad value in a mode block', () => {
        expect(
            errorOf('mode-key.yaml', 'custom_harnesses:\n  kimi: { command: k, auto_mode: { bogus: 1 } }\n')
        ).toMatch(/custom_harnesses\.kimi\.auto_mode: .*"bogus"/);
        expect(
            errorOf(
                'mode-value.yaml',
                'custom_harnesses:\n  kimi: { command: k, ask_mode: { config_options: { a: 1 } } }\n'
            )
        ).toContain('custom_harnesses.kimi.ask_mode.config_options.a');
        expect(
            errorOf('mode-mode.yaml', 'custom_harnesses:\n  kimi: { command: k, ask_mode: { mode: "" } }\n')
        ).toContain('custom_harnesses.kimi.ask_mode.mode');
        expect(errorOf('custom-key.yaml', 'custom_harnesses:\n  kimi: { command: k, bogus: 1 }\n')).toMatch(
            /custom_harnesses\.kimi: .*"bogus"/
        );
    });

    it('a mode block with no value counts as absent', () => {
        const loaded = loadConfig(
            withFile('mode-null.yaml', 'custom_harnesses:\n  kimi:\n    command: k\n    auto_mode:\n')
        );
        expect(loaded.error).toBe(undefined);
        expect(loaded.config.custom_harnesses.kimi?.command).toBe('k');
        expect(loaded.config.custom_harnesses.kimi?.auto_mode).toBe(undefined);
    });
});

describe('loadConfig: harness_mode and permission_answers', () => {
    const CONFLICT =
        'permissions is a shorthand for harness_mode and permission_answers; set either permissions or those two';

    it('accepts both keys at the root, under harnesses.<id> and custom_harnesses.<id>', () => {
        const loaded = loadConfig(
            withFile(
                'split.yaml',
                [
                    'harness_mode: ask',
                    'permission_answers: elicit',
                    'harnesses:',
                    '  codex: { harness_mode: auto }',
                    '  claude: { permission_answers: allow, permissions: }',
                    'custom_harnesses:',
                    '  kimi: { command: k, harness_mode: ask, permission_answers: auto }',
                ].join('\n')
            )
        );
        expect(loaded.error).toBe(undefined);
        expect(loaded.config.harness_mode).toBe('ask');
        expect(loaded.config.permission_answers).toBe('elicit');
        expect(loaded.config.harnesses.codex).toStrictEqual({ harness_mode: 'auto' });
        expect(loaded.config.harnesses.claude?.permission_answers).toBe('allow');
        expect(loaded.config.custom_harnesses.kimi).toMatchObject({ harness_mode: 'ask', permission_answers: 'auto' });
    });

    it('rejects unknown values with the key', () => {
        const error = loadConfig(
            withFile('bad-split.yaml', 'harness_mode: yolo\npermission_answers: allow_all\n')
        ).error;
        expect(error).toMatch(/harness_mode: /);
        expect(error).toMatch(/permission_answers: /);
    });

    it('permissions next to harness_mode or permission_answers at the same place is an error naming the keys', () => {
        for (const [name, content, where] of [
            ['conflict-root.yaml', 'permissions: auto\nharness_mode: ask\n', '(root)'],
            ['conflict-root-answers.yaml', 'permissions: deny_all\npermission_answers: allow\n', '(root)'],
            [
                'conflict-builtin.yaml',
                'harnesses:\n  codex: { permissions: auto, permission_answers: elicit }\n',
                'harnesses.codex',
            ],
            [
                'conflict-custom.yaml',
                'custom_harnesses:\n  kimi: { command: k, permissions: elicit, harness_mode: auto }\n',
                'custom_harnesses.kimi',
            ],
        ] as const) {
            const loaded = loadConfig(withFile(name, content));
            expect(loaded.config, name).toStrictEqual(DEFAULT_CONFIG);
            expect(loaded.error, name).toContain(`invalid config: ${where}: ${CONFLICT}`);
        }
    });

    it('permissions at one place and the split keys at another is no conflict', () => {
        const loaded = loadConfig(
            withFile(
                'no-conflict.yaml',
                'permissions: elicit\nharnesses:\n  codex: { harness_mode: auto }\ncustom_harnesses:\n  kimi: { command: k, permission_answers: deny }\n'
            )
        );
        expect(loaded.error).toBe(undefined);
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
