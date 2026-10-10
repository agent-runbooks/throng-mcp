import { type Config, customHarnessEntry } from '../config.ts';
import { HARNESS_IDS, type HarnessId, isBuiltinHarness } from '../contract.ts';
import { claude } from './claude.ts';
import { codex } from './codex.ts';
import { customHarness } from './custom.ts';
import { gemini } from './gemini.ts';
import { opencode } from './opencode.ts';
import type { HarnessDefinition } from './types.ts';

export { findOnPath, installHint, loadRegistry } from './discovery.ts';

/** The built-in harnesses (DESIGN §4.1). */
export const HARNESSES: Record<HarnessId, HarnessDefinition> = { claude, codex, opencode, gemini };

/** A custom harness from `config.custom_harnesses`, else a built-in one; `undefined` when `id` is neither. */
export function harnessFor(id: string, config: Config): HarnessDefinition | undefined {
    const entry = customHarnessEntry(config, id);
    if (entry) return customHarness(id, entry);
    return isBuiltinHarness(id) ? HARNESSES[id] : undefined;
}

/** Every harness id `config` knows: the built-in ids, shadowed ones in place, then the other custom ones. */
export function harnessIds(config: Config): string[] {
    return [...HARNESS_IDS, ...Object.keys(config.custom_harnesses).filter(id => !isBuiltinHarness(id))];
}

/** Built-in ids that `custom_harnesses` redefines, which makes the built-in harness unreachable. */
export function shadowedHarnesses(config: Config): HarnessId[] {
    return HARNESS_IDS.filter(id => customHarnessEntry(config, id) !== undefined);
}
