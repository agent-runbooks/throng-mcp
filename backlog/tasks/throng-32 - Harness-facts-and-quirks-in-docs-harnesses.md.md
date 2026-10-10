---
id: THRONG-32
title: Harness facts and quirks in docs/harnesses.md
status: Done
assignee:
  - '@nodge'
created_date: '2026-10-10 21:16'
updated_date: '2026-10-10 21:31'
labels: []
milestone: m-3
dependencies: []
priority: low
type: docs
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
DESIGN §2.3 ("Adapters") collects how each harness CLI behaves over ACP: versions checked, capabilities, modes, quirks (OpenCode calling fs/write_text_file, Gemini load replay, Cursor persisting a session only after output). That is knowledge about third-party CLIs, not the design of throng, and README repeats the user-facing part as per-harness "Limits"/"Notes" bullets. Maintainer (2026-10-10): move it into a separate doc; DESIGN and README only link to it. Triggered by the Cursor smoke (THRONG-30), which found three more Cursor facts that needed a home.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/harnesses.md has one section per built-in harness (Claude Code, Codex, OpenCode, Gemini CLI, Cursor CLI): the version checked, what the user sees (limits, caveats) and the adapter facts (capabilities, modes, model/effort, auth, quirks), with the content now in DESIGN §2.3 and README moved there, not duplicated
- [x] #2 DESIGN §2.3 keeps only a pointer to docs/harnesses.md (the ACP registry paragraph, which the discovery design uses, stays in DESIGN); README keeps install and login per harness and links to docs/harnesses.md for the caveats
- [x] #3 Every `DESIGN §2.3` reference in src/, docs/ and tests points to docs/harnesses.md instead
- [x] #4 The Cursor facts from the THRONG-30 smoke are in the Cursor section: a session is stored only after its first turn produced output (steer/cancel before that leaves nothing to continue), a model selected through set_config_option becomes Cursor's ACP default in ~/.cursor/acp-config.json, the process takes about 2 s or more to exit after stdin closes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Went through the runbook-task-cycle; report spot-checked
- [x] #2 Gates green: pnpm typecheck && pnpm test
- [x] #3 DESIGN.md updated if an external contract (DESIGN §3) changed
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done by the main session (docs and comments only, no code path changed, so not run through the task cycle). DESIGN §2.3 keeps a pointer and the ACP registry paragraph; README keeps install/login per harness with a link; configuration.md keeps its permission notes about Gemini trust and Cursor edits (they explain how the permission settings apply). The gemini session (THRONG-27/31) edits the Gemini README block and DESIGN §2.3 too: expect a conflict there when the branches meet; the Gemini text now lives in docs/harnesses.md#gemini-cli.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
docs/harnesses.md: one section per built-in harness with what the user notices and the ACP facts, plus an overview table; content moved from DESIGN §2.3 and README (not duplicated), Cursor facts from the THRONG-30 smoke added. DESIGN §2.3 is a pointer plus the registry paragraph; README links per harness and in Documentation; every DESIGN §2.3 reference in src/, test/ and scripts/ now points to docs/harnesses.md. Gates: typecheck 0, lint 0, vitest 393/393.
<!-- SECTION:FINAL_SUMMARY:END -->
