---
id: THRONG-28
title: list_harnesses shows only installed harnesses; drop the registry snapshot
status: To Do
assignee: []
created_date: '2026-10-10 14:38'
updated_date: '2026-10-10 16:01'
labels: []
milestone: m-3
dependencies: []
priority: medium
type: enhancement
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
list_harnesses puts every built-in harness whose adapter is not on PATH into `unavailable` with an install hint. The maintainer wants throng tools to show only harnesses the user actually has: a calling model gains nothing from a list of harnesses it cannot run, and each row costs context on every call. Once those rows are gone, data/registry.json is used only for the install hints and descriptions (built-in harnesses hardcode their commands and args), so the snapshot can go too. Decided with the maintainer on 2026-10-10 while reworking THRONG-20 (custom harnesses from config); kept out of THRONG-20 on purpose. `unavailable` still has a job for things that are configured or installed but broken: config errors, a configured command that is not found, a failed probe.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 list_harnesses omits a built-in harness whose adapter command is not on PATH and has no config override; `unavailable` keeps config errors, a configured command that is not found (built-in override or custom harness), and probe failures
- [ ] #2 run_thronglet on a built-in harness whose adapter is missing still fails with harness_unavailable before spawn, and the message names the missing command
- [ ] #3 data/registry.json and the code that reads it are removed, or the task notes say why something still needs it
- [ ] #4 DESIGN §3.4 and §4.1, README and the tool descriptions match the new behaviour; tests cover an absent built-in harness not being listed
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Went through the runbook-task-cycle; report spot-checked
- [ ] #2 Gates green: pnpm typecheck && pnpm test
- [ ] #3 DESIGN.md updated if an external contract (DESIGN §3) changed
<!-- DOD:END -->
