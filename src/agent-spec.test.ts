import { describe, expect, it } from 'vitest';
import { formatAgentSpec, parseAgentSpec } from './agent-spec.ts';
import { EFFORT_LEVELS, type ErrorCode, ThrongError } from './contract.ts';

function assertThrongError(fn: () => unknown, code: ErrorCode, includes: string[]): void {
    let error: unknown;
    try {
        fn();
    } catch (err) {
        error = err;
    }
    expect(error, 'expected a ThrongError').toBeInstanceOf(ThrongError);
    const { code: actual, message } = error as ThrongError;
    expect(actual).toBe(code);
    for (const part of includes) expect(message, `message "${message}" lacks "${part}"`).toContain(part);
}

describe('parseAgentSpec', () => {
    it('parses the DESIGN §3.1 examples', () => {
        expect(parseAgentSpec('claude/opus-5-5')).toStrictEqual({ harness: 'claude', model: 'opus-5-5' });
        expect(parseAgentSpec('claude/opus-5-5:max')).toStrictEqual({
            harness: 'claude',
            model: 'opus-5-5',
            effort: 'max',
        });
        expect(parseAgentSpec('codex/gpt-6-sol:xhigh')).toStrictEqual({
            harness: 'codex',
            model: 'gpt-6-sol',
            effort: 'xhigh',
        });
        expect(parseAgentSpec('opencode/openrouter/moonshotai/kimi-k3:high')).toStrictEqual({
            harness: 'opencode',
            model: 'openrouter/moonshotai/kimi-k3',
            effort: 'high',
        });
    });

    it("keeps a model's own :tag", () => {
        expect(parseAgentSpec('opencode/ollama/llama3:8b')).toStrictEqual({
            harness: 'opencode',
            model: 'ollama/llama3:8b',
        });
        expect(parseAgentSpec('opencode/ollama/llama3:8b:low')).toStrictEqual({
            harness: 'opencode',
            model: 'ollama/llama3:8b',
            effort: 'low',
        });
    });

    it('omits the effort key when there is no suffix', () => {
        expect('effort' in parseAgentSpec('codex/gpt-6-sol')).toBe(false);
    });

    for (const effort of EFFORT_LEVELS) {
        it(`recognizes effort "${effort}"`, () => {
            expect(parseAgentSpec(`codex/m:${effort}`)).toStrictEqual({ harness: 'codex', model: 'm', effort });
        });
    }

    it('rejects a missing harness with harness_unavailable', () => {
        assertThrongError(() => parseAgentSpec(''), 'harness_unavailable', ['""']);
        assertThrongError(() => parseAgentSpec('/opus-5-5'), 'harness_unavailable', ['""']);
    });

    it('leaves a non-empty harness id to the run, which knows the config', () => {
        expect(parseAgentSpec('kimi/k2:high')).toStrictEqual({ harness: 'kimi', model: 'k2', effort: 'high' });
        expect(parseAgentSpec('nope/pro')).toStrictEqual({ harness: 'nope', model: 'pro' });
    });

    it('rejects an empty model with model_rejected', () => {
        for (const spec of ['claude', 'claude/', 'claude/:max']) {
            assertThrongError(() => parseAgentSpec(spec), 'model_rejected', [
                `"${spec}"`,
                '<harness>/<model>[:<effort>]',
            ]);
        }
    });

    it('formatAgentSpec spells a parsed spec back', () => {
        for (const spec of ['claude/opus-5-5', 'codex/gpt-6-sol:xhigh', 'opencode/ollama/llama3:8b', 'kimi/k2:low'])
            expect(formatAgentSpec(parseAgentSpec(spec))).toBe(spec);
    });
});
