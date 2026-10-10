---
id: decision-9
title: >-
  Permissions split into harness_mode and permission_answers; permissions stays
  as a shorthand
date: '2026-10-10 17:20'
status: accepted
---
## Context

The `permissions` policy coupled two things: the mode throng puts the harness in (its own auto-approve mode, or a mode where it asks) and throng's answer to `session/request_permission`. decision-4 made `auto` reject whatever the harness's auto mode does not approve, so `auto` never widens into `allow_all`. Coupled, "the harness decides on its own, and what it still asks goes to the human" could not be expressed. THRONG-20 then gave custom harnesses two setup blocks, one per harness mode, so the mode axis already existed in the config under policy names.

## Decision

Made by the maintainer (nodge), 2026-10-10; supersedes decision-4. Two config keys, globally and per harness, a per-harness value overriding the global one key by key:

- `harness_mode: auto | ask`, default `auto`: the harness's own auto-approve mode, or its asking mode.
- `permission_answers: auto | allow | deny | elicit`, default `deny`: reject, allow once, or ask the human through MCP elicitation. `auto` means "decide for me": today it elicits when the client supports form elicitation and rejects otherwise. The name is kept open so its meaning can evolve. Explicit `elicit` without client support still fails with `elicitation_unsupported` before spawn.

The defaults equal the old `auto` policy. `permissions` stays as a shorthand for the four old policies (`auto` = auto + deny, `allow_all` = ask + allow, `deny_all` = ask + deny, `elicit` = ask + elicit); next to either new key at the same level it is a config error. `harness_mode: auto` with `permission_answers: allow` is effectively bypass; it is allowed, since only the config can set it, and documented as such. decision-4's point stands: the default never widens what the harness's auto mode approves. Custom harness blocks are `auto_mode` / `ask_mode`, after the harness modes. Elicitation dialogs name the thronglet by its description.

## Consequences

- Existing configs keep their behaviour; `harness_mode: auto` + `permission_answers: auto` gives "harness decides, the rest goes to the human".
- With elicitation in play a request may hold the turn up to `limits.elicitation_s`, and Claude Code does not background a call while one is pending; dialogs may come from background and parallel thronglets.
- `HarnessDefinition.permissionSetup` takes the harness mode only; the answers are throng's, not the harness's.
