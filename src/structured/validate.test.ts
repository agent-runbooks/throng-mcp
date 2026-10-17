import { describe, expect, it } from 'vitest';
import { compileSchema, parseResult } from './validate.ts';

const body = { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] };

describe('compileSchema', () => {
    it.each([
        ['draft-07', { $schema: 'http://json-schema.org/draft-07/schema#', ...body }],
        ['2020-12', { $schema: 'https://json-schema.org/draft/2020-12/schema', ...body }],
        ['no $schema', body],
    ])('%s: validates, errors are ajv text', (_, schema) => {
        const compiled = compileSchema(schema);
        expect(compiled.validate({ answer: 'pong' })).toStrictEqual({ ok: true });
        expect(compiled.validate({ answer: 1 })).toStrictEqual({ ok: false, errors: 'result/answer must be string' });
        expect(compiled.validate({})).toStrictEqual({
            ok: false,
            errors: "result must have required property 'answer'",
        });
    });

    it('allErrors: every error, joined with "; "', () => {
        const compiled = compileSchema({
            type: 'object',
            properties: { a: { type: 'string' }, b: { type: 'number' } },
        });
        expect(compiled.validate({ a: 1, b: 'x' })).toStrictEqual({
            ok: false,
            errors: 'result/a must be string; result/b must be number',
        });
    });

    it('the dialect comes from $schema: draft-07 tuples vs 2020-12 prefixItems', () => {
        const tuple = { type: 'array', items: [{ type: 'string' }, { type: 'number' }], additionalItems: false };
        const draft07 = compileSchema({ $schema: 'http://json-schema.org/draft-07/schema#', ...tuple });
        expect(draft07.validate(['a', 1])).toStrictEqual({ ok: true });
        expect(draft07.validate(['a', 1, 2])).toStrictEqual({
            ok: false,
            errors: 'result must NOT have more than 2 items',
        });
        expect(compileSchema(tuple).validate(['a', 'b'])).toStrictEqual({
            ok: false,
            errors: 'result/1 must be number',
        });
        const draft2020 = compileSchema({
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            type: 'array',
            prefixItems: [{ type: 'string' }],
            items: false,
        });
        expect(draft2020.validate(['a'])).toStrictEqual({ ok: true });
        expect(draft2020.validate(['a', 'b'])).toStrictEqual({
            ok: false,
            errors: 'result must NOT have more than 1 items',
        });
    });

    it('a non-object schema root: arrays and scalars', () => {
        const compiled = compileSchema({ type: 'array', items: { type: 'integer' } });
        expect(compiled.validate([1, 2])).toStrictEqual({ ok: true });
        expect(compiled.validate('x')).toStrictEqual({ ok: false, errors: 'result must be array' });
    });

    it('an invalid schema throws with the ajv message', () => {
        expect(() => compileSchema({ type: 'nope' })).toThrow(/schema is invalid: data\/type must be/);
    });

    it('unknown keywords and formats do not throw', () => {
        const compiled = compileSchema({
            type: 'object',
            'x-custom': true,
            properties: { mail: { type: 'string', format: 'email' }, when: { type: 'string', format: 'nope' } },
        });
        expect(compiled.validate({ mail: 'not a mail', when: 'x' })).toStrictEqual({ ok: true });
    });
});

describe('parseResult', () => {
    const compiled = compileSchema(body);
    const fence = (json: string, info = 'json') => `\`\`\`${info}\n${json}\n\`\`\``;

    it('the whole message as JSON, surrounding whitespace aside', () => {
        expect(parseResult('{"answer":"pong"}', compiled)).toStrictEqual({ kind: 'ok', result: { answer: 'pong' } });
        expect(parseResult('\n  {\n  "answer": "pong"\n}\n', compiled)).toStrictEqual({
            kind: 'ok',
            result: { answer: 'pong' },
        });
    });

    it('a fenced block after narration, any info string or none', () => {
        const json = '{"answer": "pong"}';
        for (const info of ['json', '', 'JSON5', 'text']) {
            expect(parseResult(`Here it is.\n\n${fence(json, info)}\n`, compiled), info).toStrictEqual({
                kind: 'ok',
                result: { answer: 'pong' },
            });
        }
        expect(parseResult(fence(json), compiled), 'the message is only the fence').toStrictEqual({
            kind: 'ok',
            result: { answer: 'pong' },
        });
    });

    it('of several fenced blocks, the last one counts', () => {
        const message = `First try:\n${fence('{"answer": "draft"}')}\nFinal:\n${fence('{"answer": "pong"}')}`;
        expect(parseResult(message, compiled)).toStrictEqual({ kind: 'ok', result: { answer: 'pong' } });
        const brokenLast = `${fence('{"answer": "pong"}')}\nand\n${fence('{"answer": ')}`;
        expect(parseResult(brokenLast, compiled), 'an earlier block is not a fallback').toStrictEqual({
            kind: 'missing',
        });
    });

    it('a block with no content lines counts as a block', () => {
        const emptyLast = '```json\n{"answer":"draft"}\n```\n\n```json\n```';
        expect(parseResult(emptyLast, compiled), 'an empty last block hides no earlier one').toStrictEqual({
            kind: 'missing',
        });
        const emptyFirst = '```text\n```\n\n```json\n{"answer":"final"}\n```';
        expect(parseResult(emptyFirst, compiled), 'its closing fence opens no block').toStrictEqual({
            kind: 'ok',
            result: { answer: 'final' },
        });
    });

    it('prose, broken JSON, JSON with trailing prose, an empty message → missing', () => {
        expect(parseResult('Done, the answer is pong.', compiled)).toStrictEqual({ kind: 'missing' });
        expect(parseResult('{"answer": "pong"', compiled)).toStrictEqual({ kind: 'missing' });
        expect(parseResult('{"answer": "pong"}\nHope that helps!', compiled)).toStrictEqual({ kind: 'missing' });
        expect(parseResult('', compiled)).toStrictEqual({ kind: 'missing' });
        expect(parseResult(fence(''), compiled)).toStrictEqual({ kind: 'missing' });
    });

    it('JSON the schema rejects → invalid with the ajv errors', () => {
        expect(parseResult('{"answer": 1}', compiled)).toStrictEqual({
            kind: 'invalid',
            errors: 'result/answer must be string',
        });
        expect(parseResult(`Result:\n${fence('{}')}`, compiled)).toStrictEqual({
            kind: 'invalid',
            errors: "result must have required property 'answer'",
        });
    });

    it('any JSON value, null included, is checked against the schema', () => {
        expect(parseResult('null', compiled)).toStrictEqual({ kind: 'invalid', errors: 'result must be object' });
        const nullable = compileSchema({ type: 'null' });
        expect(parseResult('null', nullable)).toStrictEqual({ kind: 'ok', result: null });
        expect(parseResult('[1, 2]', compileSchema({ type: 'array' }))).toStrictEqual({ kind: 'ok', result: [1, 2] });
    });
});
