---
id: THRONG-29
title: Split permissions into harness mode and permission answers
status: To Do
assignee: []
created_date: '2026-10-10 15:24'
labels: []
milestone: m-3
dependencies:
  - THRONG-20
priority: high
type: feature
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The `permissions` policy (DESIGN §5) couples two independent things: which mode throng puts the harness in (its own auto-approve mode, or a mode where it asks) and how throng answers `session/request_permission`. Coupled, the useful combination "harness decides on its own, what it still asks goes to the human" is impossible: under `auto` every request is rejected (decision-4), because answering allow would widen auto into allow_all. Splitting them makes all six combinations available; harness mode auto + answers elicit is the main gain, ask + allow/deny/elicit are the current allow_all/deny_all/elicit, auto + deny is the current auto. Agreed with the maintainer on 2026-10-10 after THRONG-20.

Proposed names (confirm with the maintainer before the brief): `harness_mode: auto | ask` (default auto) and `permission_answers: auto | allow | deny | elicit` (default auto = elicit when the MCP client supports elicitation, deny otherwise). User harness blocks `auto_approve` / `ask_approval` (THRONG-20) are exactly the two harness modes and get renamed to match in the same change.

Caveats to settle in the brief: the default answers change behaviour (today the default never asks the human; afterwards dialogs can come from background and parallel thronglets) and the changeset must say so; a pending elicitation holds the turn up to `limits.elicitation_s` and Claude Code does not background a call while one is pending; a nested throng has the harness as its client, so the default falls back to deny there. Harness mode auto + answers allow is effectively bypass: allowed (config only), documented as such.

Release constraint: THRONG-20 introduced `auto_approve` / `ask_approval`; do not merge the Upcoming Release PR between THRONG-20 and this task, so no released version carries the old keys.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Config has `harness_mode` and `permission_answers`, globally and per harness (natives and user harnesses); the old `permissions` key is a config error whose message says how to rewrite it
- [ ] #2 harness_mode selects the native setup: auto → the harness auto mode as today, ask → the asking mode as today (claude default, codex read-only, opencode permission ask, gemini default); user harness setup blocks are renamed to match harness_mode and apply the same way
- [ ] #3 permission_answers allow / deny / elicit answer request_permission as allow_all / deny_all / elicit do today, under either harness mode; submit_result is still allowed under every setting
- [ ] #4 permission_answers auto elicits when the client supports elicitation and rejects (reject_once, else cancelled) otherwise; explicit elicit without client support still fails with elicitation_unsupported before spawn
- [ ] #5 Tests via test/fake-agent cover the six combinations, the auto fallback with and without client elicitation, the old-key config error, and a user harness under both modes
- [ ] #6 DESIGN §4.1, §5, §8, a backlog decision superseding decision-4, docs/configuration.md, README and the throng skill describe the two options; the changeset states the default behaviour change
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Went through the runbook-task-cycle; report spot-checked
- [ ] #2 Gates green: pnpm typecheck && pnpm test
- [ ] #3 DESIGN.md updated if an external contract (DESIGN §3) changed
<!-- DOD:END -->
