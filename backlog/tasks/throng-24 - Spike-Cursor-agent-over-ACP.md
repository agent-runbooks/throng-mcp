---
id: THRONG-24
title: 'Spike: Cursor agent over ACP'
status: Done
assignee:
  - '@nodge'
created_date: '2026-10-02 21:23'
updated_date: '2026-10-10 15:32'
labels: []
milestone: m-3
dependencies:
  - THRONG-21
references:
  - 'https://cursor.com/docs/cli/reference/parameters'
priority: low
type: spike
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cursor subscriptions bundle many models plus the Composer models that exist nowhere else, bound to Cursor login. DESIGN §11 already names Cursor: 'cursor-agent acp' with extension methods cursor/ask_question and cursor/create_plan that the client must answer. Open questions nobody has verified: whether the global flag 'cursor-agent --force acp' (alias --yolo) really applies in ACP mode (vendor docs describe the flag, only a forum reply and a third-party wrapper claim it works over ACP), how model and effort are exposed, and what the two extension methods expect as answers. Cursor also always prompts for web search and does not cover MCP servers from session/new with --force, which matters for the throng_result submit tool (§6).

cursor-agent was not installed on the maintainer machine in v1. The spike needs it installed and logged in (maintainer does that), then a throwaway ACP session driven by hand or by a script under scripts/smoke. Outcome is a written answer, then a decision whether a native definition task is worth creating.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A note (backlog notes or docs/) answers: does --force before acp disable request_permission; what modes, config options (model, thought_level) session/new advertises; what cursor/ask_question and cursor/create_plan require from the client; whether the throng_result MCP server is usable under --force
- [x] #2 Based on the answers, either a native Cursor harness task is created with concrete acceptance criteria, or the note records why Cursor is not supported
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Went through the runbook-task-cycle; report spot-checked
- [ ] #2 Gates green: pnpm typecheck && pnpm test
- [ ] #3 DESIGN.md updated if an external contract (DESIGN §3) changed
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Spike result, 2026-10-10. cursor-agent 2026.10.01-e373342 (darwin-arm64 archive from downloads.cursor.com, run unpacked, not installed), free Cursor account (Hobby) logged in by nodge. Driven by a throwaway raw ACP probe (JSON-RPC over stdio, every line logged); model Auto unless noted.

Handshake and auth
- initialize: agentCapabilities {loadSession: true, sessionCapabilities: {list}, mcpCapabilities: {http, sse}, promptCapabilities: {image}}; authMethods [cursor_login]. No session/resume.
- session/new before auth → -32000 "Authentication required ... call authenticate() with methodId 'cursor_login'". After `agent login` the client must still call `authenticate {methodId: 'cursor_login'}` once per process; then session/new works.
- `agent login` stores tokens in the macOS login keychain (generic passwords, service cursor-access-token and cursor-refresh-token, account cursor-user); auth works with any CURSOR_CONFIG_DIR, even a minimal cli-config.json. Written regardless of CURSOR_CONFIG_DIR: ~/.cursor/agent-cli-state.json, ~/.cursor/projects/, ~/.cursor/plans/, ~/Library/Caches/cursor-compile-cache/.

Q1: does --force disable request_permission? Yes, in ACP mode too.
- Default config: approvalMode allowlist, permissions.allow [Shell(ls)].
- Without --force: shell outside the allowlist, web search, web fetch and MCP tool calls each send session/request_permission (kinds execute, search, fetch, other; options allow-once/allow_once, allow-always/allow_always, reject-once/reject_once); reject_once is honoured.
- File edits (Write tool, kind edit) never send request_permission in agent mode: applied even when the client would refuse. So allow_all/deny_all/elicit cannot gate edits through request_permission.
- Edits can be denied by config: CURSOR_CONFIG_DIR with cli-config.json permissions.deny ["Write(**)"] → tool fails "Write permission denied", no file. That makes deny_all honest (own config dir + reject every request). elicit has a gap: edits are either unasked or fully denied.
- `cursor-agent --force acp`: shell, MCP tool calls and web search run with no request_permission. The rumour that --force does not cover web search or MCP did not hold. --approve-mcps does not change per-call approval of MCP tools.

Q2: modes and config options from session/new
- modes: agent (current), plan, ask. No auto/yolo/bypass mode: auto exists only as the launch flag (THRONG-21 args).
- configOptions: mode (category mode) and model (category model; 44 values on the free account, e.g. "default[]" = Auto, "gpt-5.4-nano[reasoning=medium]", "claude-opus-5-5[context=300k,effort=medium,fast=false]"). No thought_level option.
- Effort is baked into the model value in brackets, with vendor-specific keys (effort, reasoning, reasoning_effort). set_config_option accepts only the exact listed values: "gpt-5.4-nano[reasoning=low]" → -32602 "Invalid model value". The CLI flag --model accepts bracket overrides per --help; not verified over ACP.
- Free plan: Auto runs; a specific listed model (gpt-5.4-nano) answers with the agent message "Upgrade your plan to continue" and stopReason end_turn, no error. A harness would report that as success unless it detects the text.

Q3: cursor/ask_question and cursor/create_plan
- ask_question was never sent: asked explicitly, the model said it has no ask-question tool in this session (likely gated on a client capability we don't advertise).
- create_plan is sent only in plan mode: params {toolCallId, name, overview, plan (markdown), todos[], isProject, phases[]}. Answering -32601 is harmless: the turn ends end_turn; the plan is saved to ~/.cursor/plans/*.plan.md. throng runs in agent mode and can answer method not found.

Q4: throng_result MCP server under --force
- A stdio MCP server passed in session/new is started and its tools are listed (stdio works although mcpCapabilities lists only http/sse). Calling submit_result: without --force → request_permission kind other, title "probe-submit_result: submit_result", rawInput null; with --force → runs without asking. The submit tool is usable; throng's own-tool auto-allow must match this title shape.

Also checked
- session/load in a fresh process continues the session (asked for a code word from the previous process: answered correctly); the history is replayed as user_message_chunk/agent_message_chunk before the new turn's updates, so a harness has to drop the replay. Without load support Cursor is a one-turn harness (THRONG-26 semantics).

Verdict for AC #2: a native Cursor harness is feasible. What it needs: launch `cursor-agent [--force] acp` (auto via args), authenticate(cursor_login) after initialize, a throng-owned CURSOR_CONFIG_DIR per policy (deny Write(**) for deny_all), an elicit decision for unasked edits, model from the listed values with effort as a warning (or a mapping to the listed variant), session/load with replay suppression for send_message, detection of the "Upgrade your plan" reply, create_plan answered method not found. Task creation waits on the maintainer's approval.

Maintainer decisions on the findings (nodge, 2026-10-10): no throng-owned CURSOR_CONFIG_DIR — edits Cursor applies without asking are acceptable under every policy, deny_all/elicit only answer the requests Cursor sends; the free-plan "Upgrade your plan to continue" reply is passed through, not detected; session/load replay is ACP spec behaviour, the fix is on throng's side (the collector turns pre-turn agent text into a warning, and throng cannot continue a session via load yet). THRONG-30 created for the native harness, in the worktree .claude/worktrees/cursor-harness; implementation waits on the maintainer. DoD #1/#2 not applicable: a spike with no code change; the probe was a throwaway script. Cleanup done: `agent logout` removed both keychain entries (verified), ~/.cursor and ~/Library/Caches/cursor-compile-cache moved to the Trash, unpacked archive, logs and temp workspaces deleted.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Spike answered all four questions on cursor-agent 2026.10.01 over ACP with a free account (details in notes): --force before acp disables request_permission for shell, MCP and web search; without it those ask while file edits never ask; session/new offers modes agent/plan/ask and config options mode/model with effort baked into model values, no thought_level; ask_question never sent, create_plan only in plan mode and safe to answer method not found; the stdio MCP submit tool works and runs unasked under --force. Also: authenticate(cursor_login) required, no resume but session/load with history replay. Outcome: THRONG-30 (native Cursor harness) created with the maintainer's decisions.
<!-- SECTION:FINAL_SUMMARY:END -->
