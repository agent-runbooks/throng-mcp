import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, isAbsolute, join, resolve } from 'node:path';
import type { Config } from '../config.ts';
import type { HarnessId } from '../contract.ts';
import type { HarnessResolution } from './types.ts';

// Adapter discovery shared by the harness definitions (DESIGN §4.1, decision-3).
// Kept apart from index.ts so the definitions can import it without an import cycle.

function isExecutableFile(path: string): boolean {
    try {
        if (!statSync(path).isFile()) return false;
        accessSync(path, constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

/** First executable regular file named `name` in `env.PATH`; empty and relative entries are skipped. */
export function findOnPath(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
    for (const dir of (env.PATH ?? '').split(delimiter)) {
        if (!dir || !isAbsolute(dir)) continue;
        const candidate = join(dir, name);
        if (isExecutableFile(candidate)) return candidate;
    }
    return undefined;
}

/**
 * A configured command: a value with a "/" is a path that must be an executable file, anything else is looked up on
 * PATH. `reason` names the value and `key`, its config key path.
 */
export function findCommand(
    key: string,
    configured: string,
    env: NodeJS.ProcessEnv = process.env
): { ok: true; command: string } | { ok: false; reason: string } {
    const isPath = configured.includes('/');
    const command = isPath
        ? isExecutableFile(configured)
            ? resolve(configured)
            : undefined
        : findOnPath(configured, env);
    if (command) return { ok: true, command };
    const where = isPath ? 'not found or not executable' : 'not found on PATH';
    return { ok: false, reason: `${configured} (${key}) ${where}` };
}

/** The per-harness data `resolveAdapter` needs; everything else about a harness lives in its definition. */
export interface AdapterSpec {
    id: HarnessId;
    /** What to install when the adapter is missing: the text after `install: ` in the reason. */
    installHint: string;
    /** Adapter command looked up on PATH. */
    adapter: string;
    args: string[];
    /** Harness binary whose absolute path goes into `envVar` when found on PATH. */
    harnessBin?: { name: string; envVar: string };
}

/**
 * Config `harnesses.<id>.command` wins over the PATH lookup; `args` and `env` from config override the defaults.
 * Availability depends on the adapter command only; a missing harness binary just leaves its env var unset.
 */
export function resolveAdapter(
    spec: AdapterSpec,
    config: Config,
    env: NodeJS.ProcessEnv = process.env
): HarnessResolution {
    const override = config.harnesses[spec.id];

    let command: string | undefined;
    if (override?.command) {
        const found = findCommand(`harnesses.${spec.id}.command`, override.command, env);
        if (!found.ok) return { available: false, reason: `${found.reason}; install: ${spec.installHint}` };
        command = found.command;
    } else {
        command = findOnPath(spec.adapter, env);
        if (!command)
            return {
                available: false,
                reason: `${spec.adapter} not found on PATH; install: ${spec.installHint}`,
                notInstalled: true,
            };
    }

    const configEnv = override?.env ?? {};
    const harnessEnv: Record<string, string> = {};
    // Config or the server's own environment may already point the adapter at a harness binary.
    if (spec.harnessBin && !(spec.harnessBin.envVar in configEnv) && !env[spec.harnessBin.envVar]) {
        const bin = findOnPath(spec.harnessBin.name, env);
        if (bin) harnessEnv[spec.harnessBin.envVar] = bin;
    }

    return {
        available: true,
        launch: { command, args: [...(override?.args ?? spec.args)], env: { ...harnessEnv, ...configEnv } },
    };
}
