import type { JsonSchemaObject } from './contract.ts';
import type { StructuredResult } from './structured/validate.ts';

// The prefix of every run_thronglet / send_message prompt (DESIGN §7): tells the agent where its answer goes.
// No rules about how to work: those belong to the caller's prompt.

export const EXECUTOR_PREFIX = `You are running as a nested session started by another agent through the throng MCP server. Your final message is returned to that agent as the result; it does not see your intermediate steps.

Task:`;

/** Final prompt text sent to the harness. With a schema, the result format and the schema follow the task (DESIGN §6). */
export function buildPrompt(task: string, schema?: JsonSchemaObject): string {
    const prompt = `${EXECUTOR_PREFIX}\n\n${task}`;
    if (!schema) return prompt;
    return (
        `${prompt}\n\n` +
        'Result format: end the turn with a final message that is only one JSON value matching the JSON Schema below. ' +
        'No text before or after it, though a ```json fence around it is fine. ' +
        'That JSON, not your prose, is returned to the caller.\n\n' +
        JSON.stringify(schema, null, 2)
    );
}

/** Re-prompt after a turn whose final message held no valid result. */
export function buildCorrectivePrompt(last: Exclude<StructuredResult, { kind: 'ok' }>): string {
    if (last.kind === 'missing') {
        return (
            'Your final message was not a JSON value. If you have not finished the task, finish it first. ' +
            'Then end the turn with a final message that is only the JSON value matching the JSON Schema from the task.'
        );
    }
    return `Your JSON does not match the schema: ${last.errors}. Reply with only the corrected JSON value.`;
}
