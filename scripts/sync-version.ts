// `changeset version` bumps package.json only. The release PR carries the same version everywhere the package
// is named by version: server.json (MCP Registry), the plugin manifest, and the `npx` commands that launch the server.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Files that pin the package version, relative to the repo root. `json`: its `"version"` fields are the package version too. */
export const PINNED_FILES: readonly { path: string; json?: true }[] = [
    { path: 'server.json', json: true },
    { path: '.claude-plugin/plugin.json', json: true },
    { path: 'README.md' },
    { path: 'docs/DESIGN.md' },
];

/** `throng-mcp@<anything>`: `@latest`, a range or an exact version. */
const SPEC = /\bthrong-mcp@[^\s"'`)]+/g;
const VERSION_FIELD = /("version":\s*)"[^"]*"/g;

/** `text` with every pinned spec (and, for JSON, every `"version"` field) set to `version`. */
export function pin(text: string, version: string, json = false): string {
    const pinned = text.replace(SPEC, `throng-mcp@${version}`);
    return json ? pinned.replace(VERSION_FIELD, `$1"${version}"`) : pinned;
}

/** An `npx` launch of the package with no version: `npx -y throng-mcp` or `"-y", "throng-mcp"`. */
export const UNPINNED_LAUNCH = /-y"?,?\s+"?throng-mcp(?![@\w-])/;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const root = new URL('..', import.meta.url);
    const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as { version: string };
    for (const { path, json } of PINNED_FILES) {
        const file = new URL(path, root);
        const text = readFileSync(file, 'utf8');
        const pinned = pin(text, version, json);
        if (pinned !== text) writeFileSync(file, pinned);
    }
}
