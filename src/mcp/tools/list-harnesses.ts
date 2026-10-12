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
                'installed or configured ones that cannot run with the reason, and the server limits. Built-in harnesses ' +
                'that are not installed are not listed.',
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
