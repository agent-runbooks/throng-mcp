import type { Config } from '../config.ts';
import { HARNESS_IDS, type HarnessId, isNativeHarness } from '../contract.ts';
import { claude } from './claude.ts';
import { codex } from './codex.ts';
import { gemini } from './gemini.ts';
import { opencode } from './opencode.ts';
import type { HarnessDefinition } from './types.ts';
import { userHarness } from './user.ts';

export { findOnPath, installHint, loadRegistry } from './discovery.ts';

/** The native harnesses (DESIGN §4.1). */
export const HARNESSES: Record<HarnessId, HarnessDefinition> = { claude, codex, opencode, gemini };

/** A native harness, else a user harness from `config.harnesses`; `undefined` when `id` is neither. */
export function harnessFor(id: string, config: Config): HarnessDefinition | undefined {
    if (isNativeHarness(id)) return HARNESSES[id];
    const entry = Object.hasOwn(config.harnesses, id) ? config.harnesses[id] : undefined;
    return entry?.command === undefined ? undefined : userHarness(id, { ...entry, command: entry.command });
}

/** Every harness id `config` knows: the natives, then the user harnesses. */
export function harnessIds(config: Config): string[] {
    return [...HARNESS_IDS, ...Object.keys(config.harnesses).filter(id => !isNativeHarness(id))];
}
