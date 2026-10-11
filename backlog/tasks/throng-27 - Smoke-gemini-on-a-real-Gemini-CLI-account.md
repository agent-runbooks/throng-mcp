---
id: THRONG-27
title: Smoke gemini on a real Gemini CLI account
status: Done
assignee:
  - '@claude'
created_date: '2026-10-03 13:07'
updated_date: '2026-10-11 19:02'
labels: []
milestone: m-3
dependencies:
  - THRONG-22
priority: low
type: task
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
THRONG-22 shipped the gemini harness without a run on a real model turn: the maintainer has no Gemini account (2026-10-03). The harness was checked against Gemini CLI 0.61.0 only up to the first model request (handshake, models list, modes, folder trust, session/set_model, process pattern, with an invalid API key). This task is the former AC #5 of THRONG-22. Blocked until someone with a Google account or a Gemini API key can run it. The three commands are in docs/development.md, smoke section. With OAuth login the model list may differ from the API-key one recorded in the THRONG-22 notes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 pnpm smoke:gemini under permissions: auto on the real Gemini CLI: the agent edits a file in a temp project (PASS: pong.txt written), no orphans
- [x] #2 The same under permissions: deny_all: the edit is refused, the run itself succeeds
- [x] #3 pnpm smoke:gemini-schema: submit_result over the MCP server works in a trusted workspace
- [x] #4 A run with an effort suffix shows the model and the effort warning in the result; warnings contain nothing unexpected
- [x] #5 README: the note that gemini was not run on a real turn is removed and the tested Gemini CLI version is added; any difference from DESIGN §2.3 is fixed or filed
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Went through the runbook-task-cycle; report spot-checked
- [x] #2 Gates green: pnpm typecheck && pnpm test
- [x] #3 DESIGN.md updated if an external contract (DESIGN §3) changed
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Blocked: no Gemini account or API key available to the maintainer.

2026-10-10: unblocked — the maintainer created a Google account. Gemini CLI 0.63.0 (npm latest) installed locally in the session scratchpad (not global, maintainer's choice); the maintainer signs in with gemini themselves.

Smoke 2026-10-10, Gemini CLI 0.63.0 (local install, not global), Gemini API key from Google AI Studio, free tier. list_harnesses: gemini 0.63.0, 6 models (auto, gemini-3.1-pro-preview-customtools, gemini-3-flash-preview, gemini-2.5-pro, gemini-3.8-flash, gemini-3.5-flash-lite); claude-agent-acp 0.86.0, codex-acp 2.1.1, opencode 1.18.34 alongside.
Auth: Google-account sign-in is refused server-side for personal accounts ('This client is no longer supported for Gemini Code Assist for individuals ... migrate to Antigravity'); only an API key or Vertex works. README/DESIGN/configuration/development updated.
#1 auto, pnpm smoke:gemini (gemini/auto): first run code=timeout at the default 300 s (no text; free-tier latency, a raw ACP probe saw 120 s to the first token on 'pong'); rerun with --timeout 900: ok in 51 s, PASS pong.txt written, PASS no orphans (auto routed to gemini-3.8-flash per the Gemini chat record). The first run's orphan FAIL was a claude-agent-acp started 12 s earlier by another session (PPID unrelated), not a throng leftover.
#2 deny_all: on gemini/auto the edit and a shell fallback were refused (choice=cancel is Gemini's reject_once optionId), then the turn hit 'You have exhausted your daily quota on this model' (gemini-3.8-flash free-tier daily quota, spent by about 20 requests of probes and smokes) -> agent_error. Rerun on gemini/gemini-3.5-flash-lite: 4 permission requests (2 edits, 2 shell) all refused, run code=ok, text 'File creation tools were cancelled ... done', FAIL pong.txt not found (the expected outcome), PASS no orphans.
#3 schema: smoke:gemini-schema on auto hit the same quota; on gemini/gemini-3.5-flash-lite --schema: structured {file: pong.txt, content: pong}, PASS structured, PASS pong.txt written, PASS no orphans.
#4 effort: gemini/auto:high hit the quota but already returned warnings ['effort "high" ignored: gemini exposes no effort option']; gemini/gemini-3.5-flash-lite:high: ok, same single warning, PASS pong.txt written, no orphans; the Gemini chat record shows gemini-3.5-flash-lite answered.
Deviation: #2-#4 ran on gemini-3.5-flash-lite instead of auto because of the per-model daily quota; the harness path (set_model, modes, permissions, submit_result over MCP) is the same.
#5: no behaviour difference from DESIGN §2.3 found besides auth; DESIGN header now names 0.63.0.

2026-10-11, rebase onto THRONG-30 (#19): the Gemini facts moved from DESIGN §2.3 to docs/harnesses.md#gemini-cli; the version, auth and free-tier edits now live there, DESIGN untouched.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Ran the gemini smoke on Gemini CLI 0.63.0 with a Gemini API key (free tier): auto edits a file, deny_all refuses edits and shell while the run succeeds, submit_result over MCP returns {file: pong.txt, content: pong}, an effort suffix gives exactly the 'gemini exposes no effort option' warning; no orphans in any run. Runs #2-#4 used gemini-3.5-flash-lite after the free daily quota of gemini-3.8-flash (what auto routes to) ran out. Google-account sign-in is refused server-side for personal accounts, so README, docs/configuration.md, docs/development.md and docs/harnesses.md (the Gemini facts formerly in DESIGN §2.3) now say API key or Vertex, name 0.63.0, and describe free-tier quota and latency (--timeout 900 for the smoke). Evidence: smoke logs summarised in the notes; pnpm typecheck, lint, test green. DoD #1 not applicable: no code in this task (maintainer's call, 2026-10-10).
<!-- SECTION:FINAL_SUMMARY:END -->
