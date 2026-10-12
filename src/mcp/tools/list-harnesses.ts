import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readDepth } from '../../config.ts';
import { listHarnesses } from '../../list.ts';
import type { ToolEnv } from '../tools.ts';

export const name = 'list_harnesses';

export function register(server: McpServer, env: ToolEnv): void {
    server.registerTool(
        name,
        {
            description:
                'Lists valid agent values for run_thronglet: installed harnesses with their models and effort levels, ' +
                'unavailable harnesses that are installed or configured but cannot run (config error, configured ' +
                'command not found, failed probe) with the reason, and the server limits. A built-in harness that is ' +
                'not installed is not listed; run_thronglet on it names what to install.',
            inputSchema: {},
        },
        async () => {
            const { loaded } = env;
            const out = await env.track(
                listHarnesses(loaded, { handshakeMs: loaded.config.limits.handshake_s * 1000, depth: readDepth() })
            );
            return { content: [{ type: 'text', text: JSON.stringify(out) }] };
        }
    );
}
