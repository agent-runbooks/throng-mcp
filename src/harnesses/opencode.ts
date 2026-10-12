import { resolveAdapter } from './discovery.ts';
import type { AdapterSpec } from './discovery.ts';
import type { HarnessDefinition } from './types.ts';

const spec: AdapterSpec = {
    id: 'opencode',
    installHint: 'see https://opencode.ai/docs (binary install)',
    adapter: 'opencode',
    args: ['acp'],
};

export const opencode: HarnessDefinition = {
    id: spec.id,
    resolve: (config, env) => resolveAdapter(spec, config, env),
    mapEffort: (level, options) => (options.includes(level) ? level : undefined),
    // `auto` keeps the user's opencode.json; `ask` routes every tool through request_permission.
    permissionSetup: mode => (mode === 'auto' ? {} : { env: { OPENCODE_CONFIG_CONTENT: '{"permission":"ask"}' } }),
};
