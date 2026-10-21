# Harnesses

How each built-in harness behaves under throng: what you will notice when you use it, and what its CLI or ACP adapter does over ACP. Install and login are in the [README](../README.md#2-the-agents-to-run); custom harnesses in [configuration.md](configuration.md#custom-harnesses). The facts below were checked against the versions named in each section; newer releases may differ.

## Overview

| | claude | codex | opencode | gemini | cursor | copilot |
|---|---|---|---|---|---|---|
| adapter on PATH | `claude-agent-acp` | `codex-acp` | `opencode acp` | `gemini --acp` | `cursor-agent acp` | `copilot --acp` |
| install hint | `npm i -g @agentclientprotocol/claude-agent-acp` | `npm i -g @agentclientprotocol/codex-acp` | opencode install docs | `npm i -g @google/gemini-cli` | `curl https://cursor.com/install -fsS \| bash` | `npm i -g @github/copilot` |
| harness on PATH | `claude` → `CLAUDE_CODE_EXECUTABLE` | `codex` → `CODEX_PATH` | same binary | same binary | same binary | same binary |
| auth | — | — | — | — | `authenticate cursor_login` after `initialize` | its own `copilot login` or the GitHub CLI's login; no `authenticate` |
| model | option category `model` | option category `model` | option category `model` | `models` list + `session/set_model` | option category `model`; a name resolves to its bracketed value | option category `model` when offered; none with a login from the GitHub CLI only |
| effort | option `thought_level`; exact | `thought_level`; `max → xhigh` | `thought_level` if present; otherwise warning | none; always a warning | none; always a warning | `thought_level` if present; otherwise warning |
| `harness_mode: auto` | mode `auto` | mode `agent` | opencode.json defaults | mode `yolo` | launch flag `--force` | option `allow_all=on` |
| `harness_mode: ask` | mode `default` | mode `read-only` (asks the client) | `OPENCODE_CONFIG_CONTENT={"permission":"ask"}` | mode `default` | no flag | `allow_all` off + `COPILOT_ALLOW_ALL=false` |
| `send_message` | `session/resume` | `session/resume` | `session/resume` | none: one turn | `session/load` | `session/load` |
| usage | tokens and cost | tokens | tokens and cost | none | none | tokens |

## Claude Code

`@agentclientprotocol/claude-agent-acp` 0.81.2 (bin `claude-agent-acp`):

- Drags a full copy of Claude Code with it: depends on `@anthropic-ai/claude-agent-sdk`, whose optional platform package (`…-darwin-arm64`, 217 MB) is the Claude Code 2.1.280 binary. `CLAUDE_CODE_EXECUTABLE` points the adapter at another `claude`, and then it runs without the platform package (decision-1).
- Model: config option category `model` (also env `ANTHROPIC_MODEL`). Effort: option `effort`, category `thought_level`.
- Modes: `default | acceptEdits | plan | auto | bypassPermissions`. `auto` falls back to `acceptEdits` with a `notice` when the model doesn't support it. Initial mode comes from `settings.json permissions.defaultMode`, so set it explicitly after `session/new`.
- `session/new._meta.claudeCode.options` passes Agent SDK options (`disallowedTools`, `allowedTools`, `env`, `settings`, ...).
- `mcpServers`: http/sse fine; stdio is recognized only when the object has no `type` field.
- Without client capability `elicitation.form` the adapter adds `AskUserQuestion` to `disallowedTools` by itself. That's what we want.
- Usage: `usage_update` with `cost.amount` (USD), plus `PromptResponse.usage`.

## Codex

`@agentclientprotocol/codex-acp` 1.13.1 (bin `codex-acp`, TypeScript):

- Same story as Claude: depends on `@openai/codex`, whose optional platform package is the codex binary; `CODEX_PATH` overrides it the same way.
- Options: `model`, `reasoning_effort` (category `thought_level`), `mode`.
- Mode presets: `read-only` (asks the user, workspace-write sandbox), `agent` (default; approvals decided by auto_review, workspace-write), `agent-full-access` (never + danger-full-access).
- `mcpServers`: stdio, http. Usage without cost. Env `CODEX_CONFIG` = JSON layered over config.toml.
- Failed turns (codex-acp 2.2.2): by default a backend error of a turn (e.g. "model 'gpt-6.1-sol' is not enabled") arrives as plain agent text and the turn ends `end_turn`, so it would read as the agent's answer. throng therefore declares the JetBrains AIR `sessionFailure` capability in `initialize.clientCapabilities._meta` (`{jetbrains: {air: {version: 1, capabilities: ['sessionFailure']}}}`). Then a failed turn ends with the failure in `PromptResponse._meta.jetbrains.air.sessionFailure` and no agent text, and retry warnings ("Reconnecting… 1/5"), config and deprecation warnings and errors of other turns or after the prompt come as `session_info_update` with the same `_meta`. throng fails the turn `agent_error` only on the `PromptResponse` failure; every `session_info_update` failure, errors included, becomes a warning (DESIGN §4.3).
- The `jetbrains.air` object also switches codex-acp to its AIR presentation: tool calls skip the "standard" field overrides, permission requests for a started command omit kind and status, `item/mcpToolCall/progress` is dropped, and agent messages carry `_meta.jetbrains.air.phase`.
- claude-agent-acp reads the same capability; throng does not declare it there, since it changes much more of that adapter's output.
- Not logged in: the handshake's Authentication required error (-32000) fails with `harness_unavailable`, and the message ends `; log in: codex login`.

## OpenCode

OpenCode 1.18.x (`opencode acp`):

- Model: option `model` = `<provider>/<model>`. Effort: option `effort` (model variants; not every model has them).
- Permissions: `permission` in opencode.json (`allow|ask|deny`, per tool). `ask` → `request_permission` (`once/always/reject`). Runtime override without touching files: env `OPENCODE_CONFIG_CONTENT` (inline JSON).
- Usage with cost.
- After an approved `edit` OpenCode calls the client's `fs/write_text_file` without checking the capability and ignores the error; it has already written the file itself. throng answers "method not found" and logs it.
- Custom providers live in the user's `~/.config/opencode/opencode.json`; throng doesn't touch it.

## Gemini CLI

Gemini CLI 0.63.0 (`gemini --acp`; facts read from the 0.61.0 source on 2026-10-03, bundled ACP SDK 0.16.1; full turns run on 0.63.0 with a Gemini API key on 2026-10-10, THRONG-27).

What you notice:

- One turn per session: Gemini CLI can't resume a session, so `send_message` to it fails with `session_not_found` before anything runs. `steer: true` is refused the same way and leaves the running turn alone; to stop a gemini turn, use `cancel_thronglet` and start a new run. `list_thronglets` shows such a session with `accepts_messages: false`.
- No effort levels: a `:<effort>` suffix is ignored with a warning.
- No usage numbers: the result's `usage` stays empty.
- The `cwd` you give it is trusted for the run (`GEMINI_CLI_TRUST_WORKSPACE=true`), under every permission setting.
- On the free API tier each model has a small daily request quota; once it is spent, runs on that model fail with `agent_error` and Gemini's message, and another model from `list_harnesses` still works. Free-tier requests can also take a minute or two each.

Over ACP:

- No config options at all. Models come through the unstable `models` field of `session/new` (`availableModels[].modelId`, `currentModelId`; the list depends on the account, `auto` is always there) and are set with the unstable `session/set_model`, which accepts any string without checking. No effort knob over ACP.
- No `session/resume` (no `sessionCapabilities`). `session/load` exists, but its response does not wait for the replay (checked in the 0.63.0 source): `streamHistory` runs unawaited, so at most the first replayed `session/update` precedes the response and the rest follows it, with no marker where the replay ends. The ACP spec requires the response only after the whole replay, and Cursor's continuation through `session/load` relies on that. throng doesn't use it for Gemini (decision-10); the upstream fix is google-gemini/gemini-cli#29708.
- Modes: `default | autoEdit | yolo | plan`. Every `set_mode` is echoed as an agent message `[MODE_UPDATE] <mode>`, listed in the definition's `preTurnNoise` ([DESIGN §4.1](DESIGN.md#41-harnesses-and-discovery)). Folder trust is on by default: in an untrusted folder `set_mode yolo` fails and no MCP servers start, those from `session/new` included. `GEMINI_CLI_TRUST_WORKSPACE=true` trusts the folder for the process.
- `request_permission` always offers `allow_once` and `reject_once`. In mode `default` read-only tools run without asking; edits, shell and MCP tools ask.
- No `usage_update`, no `PromptResponse.usage`, no cost: token counts sit only in `PromptResponse._meta.quota`, which throng does not read.
- Auth is a Gemini API key or Vertex; `session/new` fails with `-32000` when there is none. The CLI still offers Google-account sign-in, but for personal accounts the server refuses it ("This client is no longer supported for Gemini Code Assist for individuals", 2026-10-10). The OAuth terms forbid using that login from third-party software anyway, so Gemini is reached only through its own CLI.

## Cursor CLI

Cursor CLI 2026.10.01-e373342 (`cursor-agent acp`; the installer also links `agent`). Checked on a free account, 2026-10-10: spike THRONG-24 and the THRONG-30 smoke.

What you notice:

- Models are Cursor's own values with their parameters in brackets, e.g. `gpt-5.4-nano[reasoning=medium]`; `cursor/gpt-5.4-nano` works when only one value has that name. On a free plan only `cursor/default` (Auto) runs; other models answer "Upgrade your plan to continue", which comes back as the result text.
- File edits are never asked about, under any permission setting: Cursor applies them itself. `harness_mode: auto` launches it with `--force`, so shell, MCP tools and web search run without asking too; under `ask` those go to `permission_answers`.
- No effort levels: a `:<effort>` suffix is ignored with a warning. No usage numbers.
- `send_message` works: each turn picks the session up through `session/load`. Cursor stores a session only once its first turn has produced output: a steer or cancel that hits the first turn before that leaves nothing to continue, and the next `send_message` fails with `session_not_found`.
- The model throng selects is saved as Cursor's ACP default in `~/.cursor/acp-config.json`, so another ACP client that starts `cursor-agent acp` without choosing a model gets it too (seen with a raw client; no editor checked).

Over ACP:

- Auth: `initialize` lists `authMethods: [{id: 'cursor_login'}]`, and `session/new` fails with `-32000` "Authentication required. Please run 'agent login' first, then call authenticate() with methodId 'cursor_login'." until the client calls `authenticate {methodId: 'cursor_login'}`. The login itself is the user's `agent login` (tokens in the macOS keychain).
- Capabilities: `loadSession: true`, `sessionCapabilities.list`, no `sessionCapabilities.resume`. `session/load {sessionId, cwd, mcpServers}` in a fresh process continues the session with its memory; before answering it replays the history as `session/update` (`user_message_chunk`, `agent_thought_chunk`, `agent_message_chunk`, `available_commands_update`).
- Sessions live in `~/.cursor/acp-sessions/<id>/`: `meta.json` from `session/new`, the conversation in `store.db` once a turn has produced output. Without `store.db`, `session/load` answers `-32602` "Session not found".
- `session/new` returns `modes` (`agent` current, `plan`, `ask`), the unstable `models`, and config options `mode` and `model`. Model values carry their parameters in brackets: `default[]` (Auto), `gpt-5.4-nano[reasoning=medium]`, `claude-opus-5-5[context=300k,effort=medium,fast=false]`; `session/set_config_option` takes only a listed value and writes it to `~/.cursor/acp-config.json` (`selectedModelVariantId`). No `thought_level` option.
- `--force` (a root flag, accepted after `acp`) auto-approves shell, MCP tools and web search. Without it they send `request_permission` (kinds `execute`, `other`, `search`, `fetch`; option ids `allow-once`, `allow-always`, `reject-once`). File edits never ask, with or without the flag.
- MCP stdio servers from `session/new` work. `cursor/create_plan` arrives only in plan mode, which throng never sets.
- After its stdin closes the process exits in about 1.8 s when idle and in under 0.5 s right after a turn. In 2 of 8 smoke runs adapter processes were still alive 7 s after the client closed, for a reason not found; throng's SIGTERM and SIGKILL (5 s apart) end them either way.
- Also written outside the sessions directory: `~/.cursor/projects/`, `~/.cursor/plans/` (plan mode), `~/Library/Caches/cursor-compile-cache/`.

## GitHub Copilot CLI

Copilot CLI 1.0.96 (`copilot --acp`), checked 2026-10-12 with a raw ACP client and a login from the GitHub CLI only (THRONG-23).

What you notice:

- With a login that comes only from the GitHub CLI, Copilot offers no model choice over ACP: every copilot run fails with `model_rejected` ("harness exposes no model option") and `list_harnesses` shows `models: []`. Run `copilot login` and try again; that case was not checked yet.
- `harness_mode: auto` turns on Copilot's `allow_all`: tools, paths and URLs run without asking. Under `ask` it stays off, and shell commands and file edits go to `permission_answers`.
- `send_message` works: each turn picks the session up through `session/load`. A session whose first turn never ran (cancelled or steered before it started) can't be loaded, and the next `send_message` fails with `session_not_found`.
- Usage has tokens, no cost.
- Copilot loads your own Copilot config from `~/.copilot`: its skills and MCP servers come along into the run.

Over ACP:

- `initialize`: `loadSession: true`, `sessionCapabilities` `close` and `list`, no `resume`; `mcpCapabilities` `http` and `sse`. `authMethods` lists `copilot-login` (a terminal `copilot login`), but no `authenticate` call is needed: the CLI uses its own login or the GitHub CLI's.
- `session/new` returns `modes` with URL ids (`https://agentclientprotocol.com/protocol/session-modes#agent` current, `…#plan`, `…#autopilot`) and two config options: `mode` (category `mode`, the same values) and `allow_all` (category `permissions`, `on | off`, default `off`). With a GitHub-CLI-only login there is no `model` option and no `models` field. The CLI flag `--reasoning-effort` takes `none | minimal | low | medium | high | xhigh | max`.
- `session/set_config_option` with an unknown `configId`, and `session/set_model` with an unknown model, both answer success without doing anything.
- `allow_all=on` runs a shell command without `request_permission`. With it off, a shell command (`kind: 'execute'`, the title written by the model, `rawInput.command`) and a file edit (`kind: 'edit'`, title `Create file`, `rawInput.fileName` and `diff`) ask with options `allow_once | allow_always | reject_once`, the option ids equal to the kinds; `reject_once` fails the tool call and nothing is written. The launch flags `--allow-all` / `--yolo` start the option at `on`.
- `COPILOT_ALLOW_ALL=true` in the environment approves everything silently even with `allow_all` off (the option still reports `off`); `COPILOT_ALLOW_ALL=false` restores asking. throng sets `false` under `ask`.
- MCP: Copilot refuses every stdio server a client passes in `session/new` (its log in `~/.copilot/logs/`: "Rejecting non-http/sse MCP server … from client"). The launch flag `--additional-mcp-config <json>` works (`{"mcpServers": {"<name>": {"type": "local", "command", "args", "env", "tools": ["*"]}}}`). throng passes no MCP servers either way.
- `session/load {sessionId, cwd, mcpServers}` in a fresh process replays the history (`user_message_chunk`, `tool_call`, `tool_call_update`) before it answers; the next prompt remembers the earlier turns. A session that never ran a turn answers `-32002` "Resource not found: Session <id> not found", the same as an unknown id.
- Usage: `PromptResponse.usage` (`inputTokens`, `outputTokens`, …) and `usage_update {used, size}` without `cost`. No agent message arrives outside a turn.
- After its stdin closes the process exits in about 0.9 s. The npm bin is a node wrapper that runs the native `…/copilot --acp`.
