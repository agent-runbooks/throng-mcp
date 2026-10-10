import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { HARNESS_IDS } from './contract.ts';

// Server config (DESIGN §8). Unknown keys are rejected so a typo surfaces as a config error instead of being ignored.

// A section left with no value (`limits:` with every child commented out) parses as null; it counts as absent.
const section = <T extends z.ZodType>(schema: T) => z.preprocess(v => v ?? undefined, schema);

const permissionPolicy = z.enum(['auto', 'allow_all', 'deny_all', 'elicit']);

/** `harnesses.<id>`: an override of a built-in harness's launch and policy. */
const harnessOverride = z.strictObject({
    command: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    permissions: permissionPolicy.optional(),
});

/**
 * A custom harness's setup for one policy group (DESIGN §4.1): `auto_approve` under `auto`, `ask_approval` under the
 * rest.
 */
const approval = z.strictObject({
    mode: z.string().min(1).optional(),
    config_options: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
});

/** `custom_harnesses.<id>`: the whole definition of a custom harness. */
const customHarness = z.strictObject({
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    permissions: permissionPolicy.optional(),
    auto_approve: section(approval.optional()),
    ask_approval: section(approval.optional()),
});

const limits = z.strictObject({
    timeout_s: z.number().positive().default(21600),
    handshake_s: z.number().positive().default(60),
    elicitation_s: z.number().positive().default(600),
    max_concurrency: z.number().int().positive().default(10),
    max_depth: z.number().int().nonnegative().default(2),
});

const configSchema = z.strictObject({
    permissions: section(permissionPolicy.default('auto')),
    harnesses: section(
        z
            .partialRecord(
                z.enum(HARNESS_IDS),
                z.preprocess(v => v ?? {}, harnessOverride)
            )
            .default({})
    ),
    custom_harnesses: section(
        z
            .record(
                z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
                // A null entry becomes {} so the error names the missing `command`.
                z.preprocess(v => v ?? {}, customHarness),
                {
                    error: issue =>
                        issue.code === 'invalid_key'
                            ? 'a custom harness id is letters, digits, ".", "_" and "-", starting with a letter or digit'
                            : undefined,
                }
            )
            .default({})
    ),
    limits: section(limits.prefault({})),
});

export type PermissionPolicy = z.infer<typeof permissionPolicy>;
export type HarnessOverride = z.infer<typeof harnessOverride>;
export type CustomHarnessEntry = z.infer<typeof customHarness>;
export type ApprovalSetup = z.infer<typeof approval>;
export type Config = z.infer<typeof configSchema>;

export const DEFAULT_CONFIG: Readonly<Config> = Object.freeze(configSchema.parse({}));

export interface LoadedConfig {
    config: Config;
    /** One line with the path and the yaml/zod message; the config is then the defaults. */
    error?: string;
    path: string;
}

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- an empty variable means unset
    return env.THRONG_MCP_CONFIG || join(homedir(), '.config', 'throng', 'config.yaml');
}

/** Reads the YAML config over the defaults. Never throws: any failure yields the defaults plus `error`. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): LoadedConfig {
    const path = configPath(env);
    const fallback = (error: string): LoadedConfig => ({
        config: configSchema.parse({}),
        error: `${path}: ${error}`,
        path,
    });

    let source: string;
    try {
        source = readFileSync(path, 'utf8');
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { config: configSchema.parse({}), path };
        return fallback(`cannot read: ${err instanceof Error ? err.message : String(err)}`);
    }

    let raw: unknown;
    try {
        raw = parseYaml(source);
    } catch (err) {
        // yaml appends a multi-line source excerpt after the first line.
        const message = err instanceof Error ? err.message : String(err);
        return fallback(`invalid YAML: ${message.split('\n')[0]?.replace(/:$/, '')}`);
    }

    const result = configSchema.safeParse(raw ?? {});
    if (!result.success) {
        const issues = result.error.issues.map(i => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`);
        return fallback(`invalid config: ${issues.join('; ')}`);
    }
    return { config: result.data, path };
}

/** Nesting depth of this server (`THRONG_MCP_DEPTH`): a non-negative integer, anything else counts as 0. */
export function readDepth(env: NodeJS.ProcessEnv = process.env): number {
    const value = env.THRONG_MCP_DEPTH?.trim();
    if (!value || !/^\d+$/.test(value)) return 0;
    const depth = Number(value);
    return Number.isSafeInteger(depth) ? depth : 0;
}
