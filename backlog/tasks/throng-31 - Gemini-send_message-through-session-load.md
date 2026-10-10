---
id: THRONG-31
title: 'Gemini: send_message through session/load'
status: To Do
assignee:
  - '@nodge'
created_date: '2026-10-10 15:39'
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
- [ ] #1 The Gemini CLI source (version current at pickup) is checked for the order of the replay notifications and the session/load response; the finding is recorded in the task notes and DESIGN §2.3
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
