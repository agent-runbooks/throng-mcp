import { describe, expect, it } from 'vitest';
import { buildCorrectivePrompt, buildPrompt, EXECUTOR_PREFIX } from './prompt.ts';

describe('buildPrompt', () => {
    it('without a schema: the prefix and the task', () => {
        expect(buildPrompt('do the thing')).toBe(`${EXECUTOR_PREFIX}\n\ndo the thing`);
    });

    it('with a schema: the result format, then the schema verbatim, pretty-printed', () => {
        const schema = {
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            type: 'object',
            properties: { answer: { type: 'string', description: 'the answer' } },
            required: ['answer'],
        };
        const prompt = buildPrompt('do the thing', schema);
        expect(prompt.startsWith(`${EXECUTOR_PREFIX}\n\ndo the thing\n\nResult format: `)).toBe(true);
        expect(prompt).toContain('a final message that is only one JSON value matching the JSON Schema below');
        expect(prompt.endsWith(`\n\n${JSON.stringify(schema, null, 2)}`)).toBe(true);
    });
});

describe('buildCorrectivePrompt', () => {
    it('missing and invalid, the latter with the ajv errors', () => {
        expect(buildCorrectivePrompt({ kind: 'missing' })).toBe(
            'Your final message was not a JSON value. If you have not finished the task, finish it first. Then end the turn with a final message that is only the JSON value matching the JSON Schema from the task.'
        );
        expect(buildCorrectivePrompt({ kind: 'invalid', errors: 'result/answer must be string' })).toBe(
            'Your JSON does not match the schema: result/answer must be string. Reply with only the corrected JSON value.'
        );
    });
});
