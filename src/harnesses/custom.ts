import type { CustomHarnessEntry, ModeSetup } from '../config.ts';
import { findCommand } from './discovery.ts';
import type { HarnessDefinition, PermissionSetup } from './types.ts';

// A harness the user describes in the config (DESIGN §4.1 "Custom harnesses", decision-8): the entry is the whole
// definition, nothing is inferred.

function setupOf(block: ModeSetup): PermissionSetup {
    return {
        ...(block.mode ? { modeId: block.mode } : {}),
        ...(block.config_options
            ? { configOptions: Object.entries(block.config_options).map(([id, value]) => ({ id, value })) }
            : {}),
        ...(block.args ? { args: [...block.args] } : {}),
        ...(block.env ? { env: { ...block.env } } : {}),
    };
}

/** The definition of custom harness `id`, built from `custom_harnesses.<id>`. */
export function customHarness(id: string, entry: CustomHarnessEntry): HarnessDefinition {
    return {
        id,
        resolve(_config, _registry, env) {
            const found = findCommand(`custom_harnesses.${id}.command`, entry.command, env);
            if (!found.ok) return { available: false, reason: found.reason };
            return {
                available: true,
                launch: { command: found.command, args: [...(entry.args ?? [])], env: { ...entry.env } },
            };
        },
        mapEffort: (level, options) => (options.includes(level) ? level : undefined),
        permissionSetup(mode) {
            const block = mode === 'auto' ? entry.auto_mode : entry.ask_mode;
            if (block) return setupOf(block);
            if (mode === 'ask') return {};
            return { warning: `custom_harnesses.${id}.auto_mode is not set: ${id} runs in the mode it starts in` };
        },
    };
}
