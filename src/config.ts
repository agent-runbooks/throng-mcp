import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { HARNESS_IDS } from './contract.ts';

// Server config (DESIGN §8). Unknown keys are rejected so a typo surfaces as a config error instead of being ignored.

// A section left with no value (`limits:` with every child commented out) parses as null; it counts as absent.
const section = <T extends z.ZodType>(schema: T) => z.preprocess(v => v ?? undefined, schema);

/** The mode throng puts the harness in (DESIGN §5): its own auto-approve mode, or a mode where it asks. */
const harnessMode = z.enum(['auto', 'ask']);
/** How throng answers `session/request_permission` (DESIGN §5). */
const permissionAnswers = z.enum(['auto', 'allow', 'deny', 'elicit']);
/** Shorthand for a harness_mode + permission_answers pair (DESIGN §5). */
const permissionPolicy = z.enum(['auto', 'allow_all', 'deny_all', 'elicit']);

/** The permission keys of one place (root, `harnesses.<id>`, `custom_harnesses.<id>`); defaults apply at resolution. */
const permissionKeys = {
    permissions: section(permissionPolicy.optional()),
    harness_mode: section(harnessMode.optional()),
    permission_answers: section(permissionAnswers.optional()),
};

/** `permissions` next to either key it stands for, at the same place, is a config error. */
function noShorthandConflict<
    T extends z.ZodType<{ permissions?: unknown; harness_mode?: unknown; permission_answers?: unknown }>,
>(schema: T) {
    return schema.refine(
        v => v.permissions === undefined || (v.harness_mode === undefined && v.permission_answers === undefined),
        'permissions is a shorthand for harness_mode and permission_answers; set either permissions or those two'
    );
}

/** `harnesses.<id>`: an override of a built-in harness's launch and permission settings. */
const harnessOverride = noShorthandConflict(
    z.strictObject({
        command: z.string().min(1).optional(),
        args: z.array(z.string()).optional(),
        env: z.record(z.string(), z.string()).optional(),
        ...permissionKeys,
    })
);

/** A custom harness's setup for one harness mode (DESIGN §4.1): `auto_mode` under `auto`, `ask_mode` under `ask`. */
const modeSetup = z.strictObject({
    mode: z.string().min(1).optional(),
    config_options: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
});

/** `custom_harnesses.<id>`: the whole definition of a custom harness. */
const customHarness = noShorthandConflict(
    z.strictObject({
        command: z.string().min(1),
        args: z.array(z.string()).optional(),
        env: z.record(z.string(), z.string()).optional(),
        ...permissionKeys,
        auto_mode: section(modeSetup.optional()),
        ask_mode: section(modeSetup.optional()),
    })
);

const limits = z.strictObject({
    timeout_s: z.number().positive().default(21600),
    handshake_s: z.number().positive().default(60),
    elicitation_s: z.number().positive().default(600),
    max_concurrency: z.number().int().positive().default(10),
    max_depth: z.number().int().nonnegative().default(2),
});

const configSchema = noShorthandConflict(
    z.strictObject({
        ...permissionKeys,
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
    })
);

export type HarnessMode = z.infer<typeof harnessMode>;
export type PermissionAnswers = z.infer<typeof permissionAnswers>;
export type PermissionPolicy = z.infer<typeof permissionPolicy>;
export type HarnessOverride = z.infer<typeof harnessOverride>;
export type CustomHarnessEntry = z.infer<typeof customHarness>;
export type ModeSetup = z.infer<typeof modeSetup>;
export type Config = z.infer<typeof configSchema>;

export const DEFAULT_CONFIG: Readonly<Config> = Object.freeze(configSchema.parse({}));

/** `custom_harnesses.<id>`, own keys only: an id like `constructor` must not reach Object.prototype. */
export function customHarnessEntry(config: Config, id: string): CustomHarnessEntry | undefined {
    return Object.hasOwn(config.custom_harnesses, id) ? config.custom_harnesses[id] : undefined;
}

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
