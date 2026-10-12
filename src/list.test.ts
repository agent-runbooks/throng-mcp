import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { HARNESS_IDS } from './contract.ts';
import { loadConfig, type LoadedConfig } from './config.ts';
import { listHarnesses } from './list.ts';

// Which rows list_harnesses reports when nothing gets as far as a probe (DESIGN §3.4). Probes are covered with the fake
// agent in mcp.test.ts and the harness tests.

const root = mkdtempSync(join(tmpdir(), 'throng-list-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

// No adapter on this PATH.
const bin = join(root, 'bin');
mkdirSync(bin);

let configs = 0;
function loadYaml(content: string): LoadedConfig {
    const path = join(root, `config-${configs++}.yaml`);
    writeFileSync(path, content);
    return loadConfig({ THRONG_MCP_CONFIG: path });
}

const list = (loaded: LoadedConfig) => listHarnesses(loaded, { handshakeMs: 5000, depth: 0, env: { PATH: bin } });

describe('listHarnesses rows', () => {
    it('a built-in harness without its adapter and without an override is in neither list', async () => {
        const out = await list(loadYaml(''));
        expect(out.harnesses).toStrictEqual([]);
        expect(out.unavailable).toStrictEqual([]);
    });

    it('a built-in override whose command is not found is unavailable with its reason', async () => {
        const out = await list(loadYaml('harnesses:\n  codex: { command: my-codex-acp }\n'));
        expect(out.harnesses).toStrictEqual([]);
        expect(out.unavailable).toStrictEqual([
            {
                harness: 'codex',
                reason: 'my-codex-acp (harnesses.codex.command) not found on PATH; install: npm i -g @agentclientprotocol/codex-acp',
            },
        ]);
    });

    it('a custom harness whose command is missing is unavailable with its reason', async () => {
        const out = await list(loadYaml('custom_harnesses:\n  kimi: { command: kimi-acp }\n'));
        expect(out.unavailable).toStrictEqual([
            { harness: 'kimi', reason: 'kimi-acp (custom_harnesses.kimi.command) not found on PATH' },
        ]);
    });

    it('a config error still lists every built-in harness as unavailable', async () => {
        const loaded = loadYaml('limits: [\n');
        expect(loaded.error).toBeDefined();
        const out = await list(loaded);
        expect(out.harnesses).toStrictEqual([]);
        expect(out.unavailable.map(u => u.harness)).toStrictEqual([...HARNESS_IDS]);
        for (const { reason } of out.unavailable) expect(reason).toBe(`config error: ${loaded.error}`);
    });
});
