import { resolveAdapter } from './discovery.ts';
import type { AdapterSpec } from './discovery.ts';
import type { HarnessDefinition } from './types.ts';

const spec: AdapterSpec = {
    id: 'claude',
    installHint: 'npm i -g @agentclientprotocol/claude-agent-acp',
    adapter: 'claude-agent-acp',
    args: [],
    harnessBin: { name: 'claude', envVar: 'CLAUDE_CODE_EXECUTABLE' },
};

export const claude: HarnessDefinition = {
    id: spec.id,
    resolve: (config, env) => resolveAdapter(spec, config, env),
    mapEffort: (level, options) => (options.includes(level) ? level : undefined),
    permissionSetup: mode => ({ modeId: mode === 'auto' ? 'auto' : 'default' }),
};
