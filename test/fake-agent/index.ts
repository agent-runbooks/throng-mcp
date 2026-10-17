import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type FakeScenario =
    | 'echo'
    | 'permission'
    | 'notice'
    | 'hang'
    | 'handshake-hang'
    | 'crash-on-prompt'
    | 'fs-call'
    | 'terminal-call'
    | 'grandchild'
    | 'grandchild-detached'
    | 'no-resume'
    | 'orphan-exit'
    | 'orphan-crash'
    | 'early-update'
    | 'no-effort-option'
    | 'mode-fallback'
    | 'empty'
    | 'refuse'
    | 'max-turns'
    | 'write-pong'
    | 'resume-memory'
    | 'steer'
    | 'submit-valid'
    | 'submit-invalid-then-valid'
    | 'submit-missing'
    | 'submit-invalid-always'
    | 'submit-ask'
    | 'gemini'
    | 'gemini-permission'
    | 'gemini-write-pong'
    | 'cursor'
    | 'cursor-permission'
    | 'cursor-resume-memory'
    | 'cursor-steer'
    | 'cursor-write-pong'
    | 'copilot'
    | 'copilot-permission'
    | 'copilot-resume-memory'
    | 'copilot-submit-valid'
    | 'copilot-submit-ask';

// Knobs besides FAKE_SCENARIO (env of the agent process): FAKE_TURN_MS — an echo or no-resume turn takes that long
// before answering (default 0); FAKE_MEMORY_DIR — where resume-memory and steer keep their notes; FAKE_SUBMIT — the valid submit_result (JSON);
// FAKE_CONFIG_OPTIONS — extra `SessionConfigOption[]` (JSON) every session/new and session/resume advertises, select or
// boolean; FAKE_CALL_LOG — a file the process appends a `FakeCall` JSON line to for its start (argv, the
// GEMINI_CLI_TRUST_WORKSPACE it sees when set, and every PROBE_* variable it sees), every authenticate, session/load,
// set_mode, set_config_option (rejected ones included), set_model and prompt, in order; read it with `readFakeCalls`;
// FAKE_STDERR — a line the process writes to stderr at startup;
// FAKE_MODELS — gemini-*: raw JSON sent as the session's `models` field; FAKE_AUTH_ERROR — cursor-*: `authenticate`
// fails with this text (-32000).
// steer: every turn appends its prompt to the session's notes; the session's first turn then hangs until session/cancel,
// every later one replies `you said: <notes joined ' | '>`.
// submit-ask: shaped like codex-acp 2.1.1, a `tool_call` titled `mcp.throng_result.submit_result` (kind `execute`,
// rawInput `{server, tool, arguments}`), then a permission request for the same toolCallId with kind `execute`, no
// title and no rawInput. Submits only when allowed, else replies `denied`.
// gemini, gemini-<scenario>: shaped like Gemini CLI 0.61 in ACP mode (docs/harnesses.md), with the turn of echo or
// <scenario>. No configOptions (FAKE_CONFIG_OPTIONS ignored); models in the session response's `models` field
// (gemini-2.5-pro current, gemini-2.5-flash), changed by session/set_model, which accepts any string; modes default,
// autoEdit, yolo, plan; `loadSession` (session/load as for cursor-*) and no resume capability; no usage_update and no
// usage in the prompt response. The echo text ends `[model=<id> effort=?]`.
// cursor, cursor-<scenario>: shaped like Cursor CLI 2026.10.01 in ACP mode (docs/harnesses.md), with the turn of echo or
// <scenario>. `authMethods` lists cursor_login, and session/new and session/load fail with -32000 ("Authentication
// required. Please run 'agent login' first, …") until `authenticate`; `loadSession` and no resume capability; modes and
// a `mode` option agent, plan, ask; a `model` option with bracketed values (`default[]` current, `fake-small[effort=low]`,
// `fake-big[reasoning=low]`, `fake-big[reasoning=high]`), no thought_level and no extra configOptions
// (FAKE_CONFIG_OPTIONS ignored). session/load replays the session's notes (resume-memory, steer) as user_message_chunk,
// agent_thought_chunk and agent_message_chunk `REPLAYED reply to: <note>`, then available_commands_update, and only
// then answers; resume-memory and steer reject an id without notes.
// copilot, copilot-<scenario>: shaped like Copilot CLI 1.0.96 in ACP mode (docs/harnesses.md), with the turn of echo or
// <scenario>. `loadSession` (session/load as for cursor-*) and no resume capability; modes and a `mode` option with URL
// ids (`…#agent` current, `…#plan`, `…#autopilot`); an `allow_all` select option (category `permissions`, on | off,
// default off) after the usual model and effort options. Stdio servers in session/new and session/load are dropped, as
// Copilot refuses them; the session's servers come from the launch arg `--additional-mcp-config <json>` instead
// (`{mcpServers: {<name>: {type: 'local', command, args, env: {NAME: value}}}}`). A permission request is skipped (the
// tool runs) when allow_all is on or COPILOT_ALLOW_ALL=true. copilot-permission asks before a shell command, option ids
// equal to their kinds, the request titled `List files`. With FAKE_TOOL_TITLE set, a `tool_call` for the command and
// the request are both titled that (the model writes Copilot's shell titles). copilot-submit-ask sends a `tool_call`
// titled FAKE_TOOL_TITLE (default `throng_result-submit_result`) and, when FAKE_TOOL_RETITLE is set, a
// `tool_call_update` retitling it to that value, then asks for the same toolCallId titled `submit_result`, and submits
// only when allowed, else replies `denied`.

/**
 * One line of FAKE_CALL_LOG. `resumed`: the session came from session/resume or session/load. copilot-*: `allowAll` is
 * the COPILOT_ALLOW_ALL the process sees when set; `new` and `load` name the MCP servers the session request carried.
 */
export type FakeCall =
    | { event: 'start'; argv: string[]; trustWorkspace?: string; allowAll?: string; probes?: Record<string, string> }
    | { event: 'new'; mcpServers: string[] }
    | { event: 'set_mode'; modeId: string; resumed: boolean }
    | { event: 'set_config_option'; configId: string; value: string | boolean; resumed: boolean }
    | { event: 'set_model'; modelId: string; resumed: boolean }
    | { event: 'prompt'; resumed: boolean }
    | { event: 'authenticate'; methodId: string }
    | { event: 'load'; sessionId: string; mcpServers?: string[] };

/** The FAKE_CALL_LOG lines so far, across every process that wrote to it; [] when the file is absent. */
export function readFakeCalls(path: string): FakeCall[] {
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line) as FakeCall);
}

const agentPath = fileURLToPath(new URL('./agent.ts', import.meta.url));

/**
 * Spawn spec for the fake agent (`cwd`/`depth` are the test's). `tag` is a unique argv marker,
 * so a test can find the process with `pgrep -f <tag>` even when the worker never came up.
 */
export function fakeAgentSpawn(scenario: FakeScenario): {
    command: string;
    args: string[];
    env: Record<string, string>;
    tag: string;
} {
    const tag = `fake-agent-${randomUUID()}`;
    return { command: process.execPath, args: [agentPath, `--tag=${tag}`], env: { FAKE_SCENARIO: scenario }, tag };
}
