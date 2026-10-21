import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { fakeHarness, tagAlive } from '../../test/fake-harness.ts';
import type { RunFailure } from '../contract.ts';
import { listHarnesses } from '../list.ts';
import { runThronglet } from '../mcp/tools/run-thronglet.ts';
import { HARNESSES } from './index.ts';

// The codex harness's login hint (docs/harnesses.md; DESIGN §4.2).

const h = fakeHarness('throng-codex-');
afterAll(() => h.cleanup());

const input = (agent: string) => ({ agent, prompt: 'do the thing', cwd: h.work, description: 'codex test' });

describe('codex harness', () => {
    it('has the codex login hint; no other built-in has one', () => {
        expect(HARNESSES.codex.loginHint).toBe('codex login');
        for (const def of Object.values(HARNESSES).filter(d => d.id !== 'codex')) {
            expect(def.loginHint, def.id).toBe(undefined);
        }
    });

    it('Authentication required → harness_unavailable naming codex login', async () => {
        // The cursor scenario answers session/new with -32000 until `authenticate`, which codex never sends.
        const { loaded, tag } = h.fakeAs('codex', 'cursor');
        const outcome = await runThronglet(input('codex/x'), h.makeCtx(loaded));
        expect(outcome.ok).toBe(false);
        const payload = outcome.payload as RunFailure;
        expect(payload.code, payload.message).toBe('harness_unavailable');
        expect(payload.message).toMatch(/^session\/new failed: Authentication required\. .*; log in: codex login$/);
        expect(tagAlive(tag)).toBe(false);
    });

    it('list_harnesses: the probe reports the same message as the reason', async () => {
        const { loaded } = h.fakeAs('codex', 'cursor');
        const out = await listHarnesses(loaded, { handshakeMs: 5000, depth: 0, env: { PATH: join(h.root, 'bin') } });
        expect(out.harnesses).toStrictEqual([]);
        expect(out.unavailable).toHaveLength(1);
        expect(out.unavailable[0]?.harness).toBe('codex');
        expect(out.unavailable[0]?.reason).toMatch(
            /^session\/new failed: Authentication required\. .*; log in: codex login$/
        );
    });
});
