import { Ajv } from 'ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { JsonSchemaObject } from '../contract.ts';

// Structured output (DESIGN §6): ajv for run_thronglet's schema check and for the result in the agent's final message.

export type Validation = { ok: true } | { ok: false; errors: string };

export interface CompiledSchema {
    validate(value: unknown): Validation;
}

/**
 * Compiles a draft-07 or 2020-12 schema. The dialect comes from `$schema` (draft-07 when absent): the two
 * engines differ in keyword semantics (`items` tuples vs `prefixItems`), so a meta schema alone isn't enough.
 * Unknown keywords and formats are ignored. Throws with ajv's message on an invalid schema.
 */
export function compileSchema(schema: JsonSchemaObject): CompiledSchema {
    const options = { allErrors: true, strict: false, validateFormats: false };
    const dialect = typeof schema.$schema === 'string' ? schema.$schema : '';
    const ajv = dialect.includes('2020-12') ? new Ajv2020(options) : new Ajv(options);
    const validate = ajv.compile(schema);
    return {
        validate: value =>
            validate(value)
                ? { ok: true }
                : { ok: false, errors: ajv.errorsText(validate.errors, { separator: '; ', dataVar: 'result' }) },
    };
}

/** The structured result of one turn. `invalid`: the JSON parsed, but the schema rejects it. */
export type StructuredResult =
    { kind: 'ok'; result: unknown } | { kind: 'missing' } | { kind: 'invalid'; errors: string };

/** A fenced code block: the opening fence with any info string, the content, the closing fence on its own line. */
const FENCED_BLOCK = /^[ \t]*```[^\n`]*\n([\s\S]*?)^[ \t]*```[ \t\r]*$/gm;

/**
 * The result in the agent's final message: the whole trimmed message as JSON, else the content of its last fenced
 * code block, else none. A parsed value is then checked against `schema`.
 */
export function parseResult(message: string, schema: CompiledSchema): StructuredResult {
    let value = parseJson(message.trim());
    if (value === undefined) {
        const last = [...message.matchAll(FENCED_BLOCK)].at(-1);
        if (last) value = parseJson((last[1] ?? '').trim());
    }
    if (value === undefined) return { kind: 'missing' };
    const validation = schema.validate(value.json);
    return validation.ok ? { kind: 'ok', result: value.json } : { kind: 'invalid', errors: validation.errors };
}

/** Wrapped, so that a parsed `null` differs from no JSON at all. */
function parseJson(text: string): { json: unknown } | undefined {
    if (!text) return undefined;
    try {
        return { json: JSON.parse(text) as unknown };
    } catch {
        return undefined;
    }
}
