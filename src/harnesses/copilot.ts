import { resolveAdapter } from './discovery.ts';
import type { AdapterSpec } from './discovery.ts';
import type { HarnessDefinition } from './types.ts';

// GitHub Copilot CLI speaks ACP itself (`copilot --acp`), so the adapter and the harness are one binary (docs/harnesses.md).
const spec: AdapterSpec = {
    id: 'copilot',
    installHint: 'npm i -g @github/copilot',
    adapter: 'copilot',
    args: ['--acp'],
};

export const copilot: HarnessDefinition = {
    id: spec.id,
    resolve: (config, env) => resolveAdapter(spec, config, env),
    mapEffort: (level, options) => (options.includes(level) ? level : undefined),
    // `allow_all` is off by default. Under ask, COPILOT_ALLOW_ALL=false stops an inherited `true` from approving silently.
    permissionSetup: mode =>
        mode === 'auto'
            ? { configOptions: [{ id: 'allow_all', value: 'on' }] }
            : { env: { COPILOT_ALLOW_ALL: 'false' } },
    continueViaLoad: true,
    // Copilot refuses stdio servers in session requests but takes them from this flag.
    mcpServerArgs: servers => [
        '--additional-mcp-config',
        JSON.stringify({
            mcpServers: Object.fromEntries(
                servers.map(({ name, command, args, env }) => [
                    name,
                    {
                        type: 'local',
                        command,
                        args,
                        env: Object.fromEntries(env.map(e => [e.name, e.value])),
                        tools: ['*'],
                    },
                ])
            ),
        }),
    ],
};
