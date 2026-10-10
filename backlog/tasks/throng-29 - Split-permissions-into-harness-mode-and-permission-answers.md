---
id: THRONG-29
title: Split permissions into harness mode and permission answers
status: Done
assignee:
  - '@fable'
created_date: '2026-10-10 15:24'
updated_date: '2026-10-10 17:44'
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
The `permissions` policy (DESIGN §5) couples two independent things: which mode throng puts the harness in (its own auto-approve mode, or a mode where it asks) and how throng answers `session/request_permission`. Coupled, the useful combination "harness decides on its own, what it still asks goes to the human" is impossible: under `auto` every request is rejected (decision-4), because answering allow would widen auto into allow_all. Splitting them makes every combination available; harness mode auto + answers elicit is the main gain.

Settled with the maintainer on 2026-10-10:
- `harness_mode: auto | ask` (default `auto`) and `permission_answers: auto | allow | deny | elicit` (default `deny`), globally and per harness. The defaults are today's `auto` policy: no behaviour change for existing configs.
- `permission_answers: auto` means "decide for me". Today it elicits when the MCP client supports form elicitation and rejects otherwise (a nested throng, whose client is the harness, rejects). The name stays `auto` so its meaning can evolve.
- The old `permissions` key stays as a shorthand for the four existing combinations: `auto` = auto + deny, `allow_all` = ask + allow, `deny_all` = ask + deny, `elicit` = ask + elicit.
- Harness mode auto + answers allow is effectively bypass: allowed (config only), documented as such.
- The elicitation dialog names the thronglet (its `description`), so dialogs from parallel and background thronglets can be told apart.
- Custom harness blocks `auto_approve` / `ask_approval` (THRONG-20, under `custom_harnesses`) are the two harness modes and are renamed to `auto_mode` / `ask_mode`.

Caveats for the docs: a pending elicitation holds the turn up to `limits.elicitation_s`, and Claude Code does not background a call while one is pending; dialogs can come from background and parallel thronglets.

Release constraint: THRONG-20 introduced `auto_approve` / `ask_approval`; do not merge the Upcoming Release PR between THRONG-20 and this task, so no released version carries those keys.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Config has `harness_mode` (default auto) and `permission_answers` (default deny), globally and per harness (`harnesses` for built-in ones, `custom_harnesses`); a per-harness value overrides the global one key by key
- [x] #2 `permissions` stays as a shorthand for auto+deny / ask+allow / ask+deny / ask+elicit; `permissions` next to `harness_mode` or `permission_answers` at the same level is a config error naming the keys
- [x] #3 harness_mode selects the harness setup: auto → its auto mode as today, ask → its asking mode as today (claude default, codex read-only, opencode permission ask, gemini default); custom harness blocks are `auto_mode` / `ask_mode` and apply the same way
- [x] #4 permission_answers allow / deny / elicit answer request_permission as allow_all / deny_all / elicit do today, under either harness mode; submit_result is still allowed under every setting
- [x] #5 permission_answers auto elicits when the client supports form elicitation and rejects (reject_once, else cancelled) otherwise; explicit elicit without client support still fails with elicitation_unsupported before spawn, the message naming the key to change
- [x] #6 The elicitation message names the thronglet by its description, for new and resumed sessions
- [x] #7 Tests via test/fake-agent cover all 8 combinations, the auto fallback with and without client elicitation, the shorthand and its conflict error, and a custom harness under both modes
- [x] #8 DESIGN §4.1, §5, §8, a backlog decision superseding decision-4, docs/configuration.md, README and the throng skill describe the two options and the shorthand
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Went through the runbook-task-cycle; report spot-checked
- [x] #2 Gates green: pnpm typecheck && pnpm test
- [x] #3 DESIGN.md updated if an external contract (DESIGN §3) changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# THRONG-29 — split `permissions` into `harness_mode` and `permission_answers`

## Goal

Today one config value, `permissions: auto | allow_all | deny_all | elicit` (DESIGN §5), decides two independent things: the mode throng puts the harness in (its own auto-approve mode, or its asking mode) and how throng answers `session/request_permission`. Split them into two keys so every combination exists, most importantly "the harness's auto mode decides, and what it still asks goes to the human". The old key stays as a shorthand. Default behaviour does not change. The decision is recorded in `backlog/decisions/decision-9 - Permissions-split-into-harness_mode-and-permission_answers-permissions-stays-as-a-shorthand.md` (read it; it supersedes decision-4).

## Semantics

Two keys, at three places: the config root (global), `harnesses.<built-in id>`, `custom_harnesses.<id>`.

- `harness_mode: auto | ask`, global default `auto`. `auto` = the harness's own auto-approve mode (what policy `auto` selects today); `ask` = its asking mode (what `allow_all` / `deny_all` / `elicit` select today: claude `default`, codex `read-only`, opencode `OPENCODE_CONFIG_CONTENT={"permission":"ask"}`, gemini `default`; gemini keeps `GEMINI_CLI_TRUST_WORKSPACE=true` under both modes).
- `permission_answers: auto | allow | deny | elicit`, global default `deny`.
  - `deny`: as `deny_all` / `auto` today (`reject_once`, else `cancelled`).
  - `allow`: as `allow_all` today (`allow_once`, else `reject_once`, else `cancelled`; never `allow_always`).
  - `elicit`: as `elicit` today; without client form elicitation the call fails before spawn with `elicitation_unsupported`, the message naming the config key the value came from and the values to use instead.
  - `auto`: "decide for me". Elicits when the MCP client supports form elicitation (same check as today: `ctx.elicitation` present), otherwise answers as `deny`. No `elicitation_unsupported`, no warning on the result; one `log.info` line per turn in the server log when it falls back to deny.
- `harness_mode: auto` + `permission_answers: allow` is allowed (effectively bypass; documented as such).
- throng's own `submit_result` is still answered `allow_once` under every setting, before the answers apply (unchanged `allowOwnTool`).
- `permissions` shorthand, at any of the three places: `auto` = auto + deny, `allow_all` = ask + allow, `deny_all` = ask + deny, `elicit` = ask + elicit. `permissions` together with `harness_mode` or `permission_answers` at the same place is a config error naming both keys with their path, e.g. `harnesses.codex: permissions is a shorthand for harness_mode and permission_answers; set either permissions or those two`.
- Resolution for harness `h`: the per-harness entry is the custom entry if one exists, else the built-in override (unchanged rule from `policySource`). Expand `permissions` to the pair at each place, then key by key: entry value ?? global value ?? default. Example: global `permission_answers: elicit`, `harnesses.codex.harness_mode: ask` → codex runs ask + elicit, every other harness auto + elicit.
- Note: the global `permissions` currently has `.default('auto')` in the zod schema; defaults must move to resolution so presence can be detected.

## Contract (from the main session; use verbatim)

`src/config.ts`, next to the existing enum:

```ts
/** The mode throng puts the harness in (DESIGN §5): its own auto-approve mode, or a mode where it asks. */
const harnessMode = z.enum(['auto', 'ask']);
/** How throng answers `session/request_permission` (DESIGN §5). */
const permissionAnswers = z.enum(['auto', 'allow', 'deny', 'elicit']);
/** Shorthand for a harness_mode + permission_answers pair (DESIGN §5). */
const permissionPolicy = z.enum(['auto', 'allow_all', 'deny_all', 'elicit']);

export type HarnessMode = z.infer<typeof harnessMode>;
export type PermissionAnswers = z.infer<typeof permissionAnswers>;
export type PermissionPolicy = z.infer<typeof permissionPolicy>;
```

`src/harnesses/types.ts`, `HarnessDefinition`:

```ts
    /** The native expression of `harness_mode`; the answers to permission requests are not the harness's business. */
    permissionSetup(mode: HarnessMode): PermissionSetup;
```

and the `PermissionSetup.warning` doc: `/** Reported on the call's result: the mode could not be expressed natively (a custom harness without \`auto_mode\`). */`

`src/permissions.ts`: `policySource` is replaced by

```ts
/** Resolved permission settings of one harness and the config keys they come from (DESIGN §5). */
export interface PermissionSettings {
    mode: HarnessMode;
    answers: PermissionAnswers;
    /** Config key `answers` came from, for error messages: `permission_answers`, `harnesses.codex.permissions`, … */
    answersKey: string;
}
export function resolvePermissions(config: Config, harness: string): PermissionSettings;
```

`deciderFor` takes `PermissionAnswers` instead of `PermissionPolicy`. Shape the rest of `permissions.ts` as you see fit.

## Custom harnesses

`custom_harnesses.<id>.auto_approve` / `ask_approval` (added by THRONG-20, unreleased) are renamed to `auto_mode` / `ask_mode`, same block contents (`mode`, `config_options`, `args`, `env`). `permissionSetup(mode)` takes `auto_mode` under `auto`, `ask_mode` under `ask`. A missing `auto_mode` under harness mode `auto` keeps a warning, reworded to not claim every request is refused (that now depends on the answers), e.g. `custom_harnesses.<id>.auto_mode is not set: <id> runs in the mode it starts in`. A missing `ask_mode` stays an empty setup with no warning. Built-in harness entries (`harnesses.<id>`) get `harness_mode` / `permission_answers` / `permissions`, nothing else new.

## Elicitation names the thronglet

The elicitation `message` first line becomes `[<description>] <tool title>` instead of `[agent] <tool title>`, where `<description>` is the thronglet's description: `request.description` for a new session, the session record's `description` for a resumed one (`src/run.ts` has both; records written without one load with `''`, `src/sessions.ts:77`). Empty description → `agent`, as today. Pass it through `DeciderOptions` (or similar), not via global state. Update the three tests asserting `[agent] write notes.txt` (`src/mcp.test.ts:624`, `src/run.test.ts:564`, `src/permissions.test.ts:242/275`) accordingly and add one for a resumed session.

## Code sites

- `src/config.ts`: schema at the root, `harnessOverride`, `customHarness` (rename blocks); same-place conflict as a zod refinement with a path, so the existing error formatting (`path: message`) applies.
- `src/permissions.ts`: `resolvePermissions`, `deciderFor(answers, …)`, `createPermissionBridge` (its `policy` parameter, if still needed, becomes answers or goes away).
- `src/run.ts` ~186–200 (guard + bridge) and ~264–275 (`def.permissionSetup(mode)`; the `permission: …` progress line goes out when the request is actually routed to elicitation: answers `elicit`, or `auto` with `ctx.elicitation`).
- `src/harnesses/{claude,codex,opencode,gemini,custom}.ts` `permissionSetup(mode)`: `mode === 'auto'` picks what `policy === 'auto'` picks today.
- Anything else that reads `config.permissions` or `PermissionPolicy` (grep).

## Tests (vitest next to the code, through test/fake-agent, no LLM)

- All 8 harness_mode × permission_answers combinations: the native setup chosen (per built-in harness table test in `src/harnesses/index.test.ts`) and the answer given to a `permission` request (fake-agent `FAKE_SCENARIO=permission`).
- `permission_answers: auto` with and without client elicitation (with: the dialog is shown and its answer goes to the agent; without: rejected, no `elicitation_unsupported`, no warning on the result).
- Explicit `elicit` without elicitation: `elicitation_unsupported` before spawn, message naming the right key (global, `harnesses.<id>`, `custom_harnesses.<id>`, and via `permissions` shorthand).
- Config: the four shorthand values expand correctly; key-by-key override (the example above); same-place conflict error at root, under `harnesses.<id>` and `custom_harnesses.<id>`; defaults equal the old `auto` policy; `auto_approve` / `ask_approval` are now unknown keys (config error).
- A custom harness under both modes, with and without each block.
- Existing tests that use `permissions:` keep passing unchanged where they test the shorthand; update the rest.

## Docs

- `docs/DESIGN.md`: §4 module list line for permissions.ts (~269); §4.1 harness table (~299–302, header rows are policies today → harness modes) and the custom harness `permissionSetup` paragraph (~337); §5 rewritten around the two keys (table: harness_mode → native mode; permission_answers → answer), the shorthand, the bypass note, the `auto` answers fallback, elicitation section keeps its details plus the description in the message; replace decision-4 references with decision-9; §8 config example (both keys globally, a per-harness override, a custom harness with `auto_mode` / `ask_mode`, the shorthand mentioned); §9 test bullet (~462) "all 4 policies" → the combinations.
- `docs/configuration.md`: config example and the Permissions section: the two keys with defaults, the four answers, the shorthand table, bypass warning for auto + allow, caveats (a pending dialog holds the turn up to `limits.elicitation_s`, Claude Code does not move a call to the background while one is pending, dialogs may come from background and parallel thronglets, a nested throng has no elicitation so `auto` answers deny there and explicit `elicit` fails); custom harness section with `auto_mode` / `ask_mode`.
- `README.md` "Permissions and safety" (~238): short, the two keys and the shorthand, link to configuration.md.
- `skills/throng/SKILL.md` "Permissions" (~46–48): same facts for the calling model, same tone and length as now.
- `docs/development.md` smoke lines use `permissions: auto` / `deny_all`: they stay valid as shorthand; leave them.

## Do not touch

- `backlog/` and `.changeset/` (the main session handles both).
- The MCP tool contracts (DESIGN §3): no new tool parameters; permissions stay config-only.
- `list_harnesses` output.

## Acceptance criteria

1. Config has `harness_mode` (default auto) and `permission_answers` (default deny), globally and per harness (`harnesses` for built-in ones, `custom_harnesses`); a per-harness value overrides the global one key by key.
2. `permissions` stays as a shorthand for auto+deny / ask+allow / ask+deny / ask+elicit; `permissions` next to `harness_mode` or `permission_answers` at the same level is a config error naming the keys.
3. harness_mode selects the harness setup: auto → its auto mode as today, ask → its asking mode as today; custom harness blocks are `auto_mode` / `ask_mode` and apply the same way.
4. permission_answers allow / deny / elicit answer request_permission as allow_all / deny_all / elicit do today, under either harness mode; submit_result is still allowed under every setting.
5. permission_answers auto elicits when the client supports form elicitation and rejects (reject_once, else cancelled) otherwise; explicit elicit without client support still fails with elicitation_unsupported before spawn, the message naming the key to change.
6. The elicitation message names the thronglet by its description, for new and resumed sessions.
7. Tests via test/fake-agent cover all 8 combinations, the auto fallback with and without client elicitation, the shorthand and its conflict error, and a custom harness under both modes.
8. DESIGN §4.1, §5, §8, docs/configuration.md, README and the throng skill describe the two options and the shorthand.

Gates: `pnpm typecheck && pnpm lint && pnpm test`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Run .agent-runbooks/runs/20261010-throng-29 ended ready. Review B (codex/gpt-6.1-sol) found nothing; review A found one garbled sentence in docs/configuration.md (nested-throng caveat), fixed and verified. No findings rejected. Main-session spot check: resolvePermissions (src/permissions.ts) expands the shorthand per place, then entry ?? global ?? default key by key; run.ts routes the progress line by elicits(); permission_answers auto without elicitation logs one info line and gives no result warning (deliberate, see description). Gates: pnpm typecheck, lint, test — 27 files, 366 tests passed. Contract edits (config enums, HarnessDefinition.permissionSetup(mode)) were specified verbatim in the brief instead of pre-applied, since the runbook needs green checks at start. THRONG-20's changeset reworded to harness_mode: auto.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
permissions split into harness_mode (auto|ask, default auto) and permission_answers (auto|allow|deny|elicit, default deny), globally and per harness; permissions kept as a shorthand, conflict at one place is a config error; custom harness blocks renamed auto_mode/ask_mode; permission_answers auto elicits when the client can, else rejects; elicitation message names the thronglet by description (new and resumed). decision-9 supersedes decision-4; DESIGN §4.1/§5/§8/§9, configuration.md, README, throng skill updated; minor changeset. Verified by vitest through test/fake-agent: the 8-combination matrix, auto with/without elicitation, elicitation_unsupported key naming, shorthand expansion and conflicts, custom harness under both modes, resumed-session description; typecheck, lint, 366 tests green.
<!-- SECTION:FINAL_SUMMARY:END -->
