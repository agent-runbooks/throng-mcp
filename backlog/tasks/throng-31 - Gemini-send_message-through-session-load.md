---
id: THRONG-31
title: 'Gemini: send_message through session/load'
status: Blocked
assignee:
  - '@claude'
created_date: '2026-10-10 15:39'
updated_date: '2026-10-11 19:02'
labels: []
milestone: m-3
dependencies:
  - THRONG-30
references:
  - 'https://github.com/google-gemini/gemini-cli'
documentation:
  - docs/DESIGN.md
priority: medium
type: feature
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gemini CLI has no session/resume, so since THRONG-22 its sessions are one turn: send_message and steer are refused before anything runs (THRONG-26), list_thronglets shows accepts_messages false. That was the maintainer's call on 2026-10-03 because throng could not continue a session through session/load at all. Gemini CLI does have session/load (0.61.0 source), and THRONG-30 adds load-based continuation for agents that advertise loadSession without resume (Cursor). session/load replays the whole history as session/update (ACP spec); THRONG-30 keeps the replay out of the result by ignoring everything before session/prompt, which holds when the replay arrives before the load response (verified for Cursor). The THRONG-22 notes say Gemini's loadSession does not await the replay: whether its notifications still reach the client before the response is unknown and decides how this task goes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The Gemini CLI source (version current at pickup) is checked for the order of the replay notifications and the session/load response; the finding is recorded in the task notes and DESIGN §2.3
- [ ] #2 If the replay always precedes the response: gemini sessions continue through session/load (record resumable, send_message and steer work, list_thronglets shows accepts_messages true) and the one-turn wording is removed from DESIGN, README and the throng skill. Otherwise the approach (a boundary without timing heuristics, or gemini staying one-turn with the reason in DESIGN) is agreed with the maintainer before code
- [ ] #3 Tests via test/fake-agent: a gemini-like scenario continued through session/load, the replayed history stays out of the turn text and warnings
- [ ] #4 Maintainer smoke on the real Gemini CLI: send_message to a gemini session answers from the previous turn
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Went through the runbook-task-cycle; report spot-checked
- [ ] #2 Gates green: pnpm typecheck && pnpm test
- [ ] #3 DESIGN.md updated if an external contract (DESIGN §3) changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Approach agreed with the maintainer 2026-10-10 (decision-10): no throng-side replay boundary for Gemini.
1. Upstream: issue + PR to google-gemini/gemini-cli awaiting streamHistory before the session/load response (fix and regression test prepared locally; published on the maintainer's go).
2. Until a Gemini CLI release carries the fix: gemini stays one-turn, DESIGN §2.3 states why. Task Blocked on the upstream release and THRONG-30.
3. Then, on top of THRONG-30 merged to main: gemini opts into load-based continuation, gated on the first fixed Gemini CLI version (older versions stay one-turn); remove the one-turn wording from DESIGN, README, the throng skill and the smoke script; fake-agent tests per AC #3; real-CLI smoke per AC #4.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC #1 finding (2026-10-10, Gemini CLI 0.63.0 = npm latest, source tag v0.63.0, bundled @agentclientprotocol/sdk 0.16.1):
- packages/cli/src/acp/acpSessionManager.ts loadSession: resumes the chat, then calls session.streamHistory(messages) WITHOUT await (eslint no-floating-promises disabled on that line), schedules available_commands_update with setTimeout(0), and returns the response.
- acpSession.ts streamHistory: one sendUpdate per user message, thought, agent message and tool call (status completed/failed), each awaited in turn.
- SDK Connection: every outgoing message goes through one write queue (#writeQueue = #writeQueue.then(write)). The request handler's result is enqueued a few microtasks after loadSession returns; replay notification k+1 is enqueued only after write k has completed.
- Wire order therefore: at most the first replay notification precedes the session/load response; the rest of the replay (and available_commands_update) follows it, and can interleave with the client's next requests (set_mode echo, session/prompt). Any history longer than one notification leaks past a boundary at the load response.
- ACP spec (protocol/session-setup, Loading Sessions): 'When all the conversation entries have been streamed to the Client, the Agent MUST respond to the original session/load request.' Gemini CLI violates this; Cursor (THRONG-24) follows it.
- No replay end marker exists: nothing in the stream tells where the replay stops and the new turn starts.
- Upstream: no issue about the order found. The load path has a history of bugs: #28775 (open, 0.53.0: load erases the session), #28693/#29463/#29580 (fixed: same-minute load failure, resolve by exact id), #27913 (closed: load did not restore memory).
Per AC #2 the approach goes to the maintainer before code.

2026-10-10: upstream issue google-gemini/gemini-cli#29707, PR google-gemini/gemini-cli#29708 (Nodge/gemini-cli branch fix/acp-load-replay-before-response; awaits streamHistory before the session/load response, regression test fails on main with only the first message replayed before the response). Blocked on a Gemini CLI release with the fix, and on THRONG-30 merged to main. decision-10 records the approach.

2026-10-11: THRONG-30 merged (#19) and moved the Gemini facts from DESIGN §2.3 to docs/harnesses.md#gemini-cli; the AC #1 finding is recorded there. Remaining blocker: a Gemini CLI release with google-gemini/gemini-cli#29708.
<!-- SECTION:NOTES:END -->
