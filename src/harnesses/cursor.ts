import { resolveAdapter } from './discovery.ts';
import type { AdapterSpec } from './discovery.ts';
import type { HarnessDefinition } from './types.ts';

// Cursor CLI speaks ACP itself (`cursor-agent acp`), so the adapter and the harness are one binary (DESIGN §2.3).
const spec: AdapterSpec = {
    id: 'cursor',
    registryId: 'cursor',
    adapter: 'cursor-agent',
    args: ['acp'],
};

export const cursor: HarnessDefinition = {
    id: spec.id,
    registryId: spec.registryId,
    resolve: (config, registry, env) => resolveAdapter(spec, config, registry, env),
    // No thought_level option: effort is part of the model value (`…[reasoning=medium]`).
    mapEffort: () => undefined,
    // `--force` auto-approves shell, MCP tools and web search; edits never ask. The default mode `agent` serves both.
    permissionSetup: mode => (mode === 'auto' ? { args: ['--force'] } : {}),
    // The login itself is the user's `agent login`; without `authenticate` session/new fails.
    authMethodId: 'cursor_login',
    continueViaLoad: true,
};
