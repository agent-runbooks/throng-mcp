import type { ApprovalSetup, HarnessEntry } from '../config.ts';
import { findCommand } from './discovery.ts';
import type { HarnessDefinition, PermissionSetup } from './types.ts';

// A harness the user describes in the config (DESIGN §4.1 "User harnesses", decision-8): the entry is the whole
// definition, nothing is inferred.

/** `harnesses.<id>` of a user harness; the config schema makes `command` required for these. */
export type UserHarnessEntry = HarnessEntry & { command: string };

function setupOf(block: ApprovalSetup): PermissionSetup {
    return {
        ...(block.mode ? { modeId: block.mode } : {}),
        ...(block.config_options
            ? { configOptions: Object.entries(block.config_options).map(([id, value]) => ({ id, value })) }
            : {}),
        ...(block.args ? { args: [...block.args] } : {}),
        ...(block.env ? { env: { ...block.env } } : {}),
    };
}

/** The definition of user harness `id`, built from its config entry. */
export function userHarness(id: string, entry: UserHarnessEntry): HarnessDefinition {
    return {
        id,
        resolve(_config, _registry, env) {
            const found = findCommand(id, entry.command, env);
            if (!found.ok) return { available: false, reason: found.reason };
            return {
                available: true,
                launch: { command: found.command, args: [...(entry.args ?? [])], env: { ...entry.env } },
            };
        },
        mapEffort: (level, options) => (options.includes(level) ? level : undefined),
        permissionSetup(policy) {
            const block = policy === 'auto' ? entry.auto_approve : entry.ask_approval;
            if (block) return setupOf(block);
            if (policy !== 'auto') return {};
            return {
                warning: `harnesses.${id}.auto_approve is not set: ${id} runs in the mode it starts in, and throng refuses every permission request it makes (policy auto)`,
            };
        },
    };
}
