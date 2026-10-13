import { resolveAdapter } from './discovery.ts';
import type { AdapterSpec } from './discovery.ts';
import type { HarnessDefinition } from './types.ts';

// Cursor CLI speaks ACP itself (`cursor-agent acp`), so the adapter and the harness are one binary (docs/harnesses.md).
const spec: AdapterSpec = {
    id: 'cursor',
    installHint: 'curl https://cursor.com/install -fsS | bash',
    adapter: 'cursor-agent',
    args: ['acp'],
};

export const cursor: HarnessDefinition = {
    id: spec.id,
    resolve: (config, env) => resolveAdapter(spec, config, env),
    // No thought_level option: effort is part of the model value (`…[reasoning=medium]`).
    mapEffort: () => undefined,
    // `--force` auto-approves shell, MCP tools and web search; edits never ask. The default mode `agent` serves both.
    permissionSetup: mode => (mode === 'auto' ? { args: ['--force'] } : {}),
    // The login itself is the user's `agent login`; without `authenticate` session/new fails.
    authMethodId: 'cursor_login',
    continueViaLoad: true,
};
