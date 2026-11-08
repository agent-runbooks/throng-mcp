import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PINNED_FILES, pin, UNPINNED_LAUNCH } from './sync-version.ts';

// A version the release PR forgot to carry over fails here, before it reaches a release.
const root = new URL('..', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as { version: string };

describe.each(PINNED_FILES)('$path', ({ path, json }) => {
    const text = readFileSync(new URL(path, root), 'utf8');

    it(`pins ${version}`, () => {
        expect(text).toMatch(json ? `"version": "${version}"` : `throng-mcp@${version}`);
        expect(text, 'run `node scripts/sync-version.ts`').toBe(pin(text, version, json));
    });

    it('launches no unpinned throng-mcp', () => {
        expect(text).not.toMatch(UNPINNED_LAUNCH);
    });
});

describe('pin', () => {
    it('replaces @latest, ranges and exact versions, and JSON version fields', () => {
        const json = '{ "version": "0.1.0", "args": ["-y", "throng-mcp@latest"], "b": "throng-mcp@^0.2" }';
        expect(pin(json, '1.2.3', true)).toBe(
            '{ "version": "1.2.3", "args": ["-y", "throng-mcp@1.2.3"], "b": "throng-mcp@1.2.3" }'
        );
        expect(pin('`npx -y throng-mcp@0.9.0`; "version": "0.1.0"', '1.2.3')).toBe(
            '`npx -y throng-mcp@1.2.3`; "version": "0.1.0"'
        );
    });

    it('UNPINNED_LAUNCH spots a launch without a version, not a pinned one or the bare name', () => {
        expect('npx -y throng-mcp').toMatch(UNPINNED_LAUNCH);
        expect('["npx", "-y", "throng-mcp"]').toMatch(UNPINNED_LAUNCH);
        expect('npx -y throng-mcp@0.9.0').not.toMatch(UNPINNED_LAUNCH);
        expect('`throng-mcp` after a global install').not.toMatch(UNPINNED_LAUNCH);
    });
});
