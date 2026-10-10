---
id: THRONG-30
title: Cursor CLI as a native harness
status: To Do
assignee:
  - '@nodge'
created_date: '2026-10-10 15:32'
labels: []
milestone: m-3
dependencies:
  - THRONG-24
references:
  - 'https://cursor.com/docs/cli/acp'
documentation:
  - docs/DESIGN.md
priority: medium
type: feature
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cursor subscriptions bundle many models plus the Composer models that exist nowhere else, bound to Cursor login; only cursor-agent can spend them. THRONG-24 (spike, 2026-10-10, cursor-agent 2026.10.01-e373342, free account) answered how it behaves over ACP; its notes hold the raw facts. In short: `cursor-agent acp` needs `authenticate {methodId: cursor_login}` after initialize (tokens come from `agent login`, kept in the macOS keychain); the only auto switch is the global flag before the subcommand, `cursor-agent --force acp`, and it covers shell, MCP tools and web search; without it shell, web search/fetch and MCP calls send request_permission, file edits are applied without asking; modes are agent/plan/ask, config options mode and model (effort is part of the model value, e.g. `gpt-5.4-nano[reasoning=medium]`, no thought_level); no session/resume, only session/load, which replays the history as session/update before the next turn (ACP spec behaviour).

Decided by nodge (2026-10-10): no throng-owned CURSOR_CONFIG_DIR; edits Cursor applies without asking are fine under every policy (a harness that does not ask is not throng's concern), so allow_all, deny_all and elicit only answer the requests Cursor sends; the free-plan reply "Upgrade your plan to continue" (end_turn, no error) is passed through as text, no special handling. Implementation starts on the maintainer's go, in the worktree .claude/worktrees/cursor-harness. THRONG-20 (generic registry harness) runs in parallel and the registry has an entry with id cursor: the native definition takes precedence over it; expect overlap in harness registration code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Agent strings `cursor/<model>` run through `cursor-agent acp`; list_harnesses shows cursor with the models from the session/new config option of category model; cursor-agent not on PATH → unavailable with an install hint
- [ ] #2 After initialize throng calls `authenticate` with the method the agent advertises (`cursor_login`); a machine without `agent login` fails before the turn with a message telling the user to run it
- [ ] #3 Policy auto launches `cursor-agent --force acp`; allow_all, deny_all and elicit launch without the flag and answer the request_permission Cursor sends per the §5 table; nothing blocks edits Cursor applies on its own, and DESIGN/README say so
- [ ] #4 A model is accepted as a listed value or as its name before the bracket (e.g. `gpt-5.4-nano`), resolved to the listed value; anything else → model_rejected with the list; an explicit effort gives the standard warning that the harness has no effort knob
- [ ] #5 `send_message` continues a Cursor session through session/load in a new adapter process when the agent advertises loadSession but not resume; the replayed history ends up neither in the turn text nor in warnings; the session record counts as resumable, list_thronglets shows accepts_messages true
- [ ] #6 Tests via test/fake-agent cover: authenticate after initialize, `--force` in launch args for auto only, model resolution by name, continuation via session/load with a replayed history that stays out of the result
- [ ] #7 scripts/smoke has a cursor case; maintainer smoke on a real Cursor account: auto run edits a file, deny_all refuses a shell command, send_message answers from the previous turn
- [ ] #8 DESIGN §4.1 table gets a cursor column and §11 drops Cursor from the future list; README lists cursor among supported harnesses with the `agent login` step
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Went through the runbook-task-cycle; report spot-checked
- [ ] #2 Gates green: pnpm typecheck && pnpm test
- [ ] #3 DESIGN.md updated if an external contract (DESIGN §3) changed
<!-- DOD:END -->
