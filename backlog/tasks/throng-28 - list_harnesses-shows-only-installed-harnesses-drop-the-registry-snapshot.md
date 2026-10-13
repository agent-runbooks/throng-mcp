---
id: THRONG-28
title: list_harnesses shows only installed harnesses; drop the registry snapshot
status: Done
assignee:
  - '@claude'
created_date: '2026-10-10 14:38'
updated_date: '2026-10-12 20:45'
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
- [x] #1 list_harnesses omits a built-in harness whose adapter command is not on PATH and has no config override; `unavailable` keeps config errors, a configured command that is not found (built-in override or custom harness), and probe failures
- [x] #2 run_thronglet on a built-in harness whose adapter is missing still fails with harness_unavailable before spawn, and the message names the missing command
- [x] #3 data/registry.json and the code that reads it are removed, or the task notes say why something still needs it
- [x] #4 DESIGN §3.4 and §4.1, README and the tool descriptions match the new behaviour; tests cover an absent built-in harness not being listed
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Went through the runbook-task-cycle; report spot-checked
- [x] #2 Gates green: pnpm typecheck && pnpm test
- [x] #3 DESIGN.md updated if an external contract (DESIGN §3) changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# THRONG-28: list_harnesses shows only installed harnesses; drop the registry snapshot

## Goal

`list_harnesses` stops listing built-in harnesses the user hasn't installed. A calling model can't run them, and each such row costs context on every call. Once those rows are gone, `data/registry.json` only supplies install hints, which become constants in the harness definitions, so the snapshot and the code that reads it go away.

## Contract (decided by the main session; implement exactly)

`src/harnesses/types.ts`:

```ts
export type HarnessResolution =
    | { available: true; launch: HarnessLaunch }
    | { available: false; reason: string; notInstalled?: true };
```

`notInstalled: true` is set only on one branch: a built-in harness with no `harnesses.<id>.command` override whose adapter is not on PATH (the `findOnPath(spec.adapter)` miss in `resolveAdapter`). It is never set for a configured command that is not found (built-in override or custom harness), for config errors, or for probe failures.

`HarnessDefinition`: drop `registryId`; `resolve(config: Config, env?: NodeJS.ProcessEnv): HarnessResolution` (no registry parameter). Drop `RegistrySnapshot` and `RegistryAgent`.

`AdapterSpec` (src/harnesses/discovery.ts): replace `registryId` with `installHint: string`, the full text after `install: `. Values must equal what is produced today:

- claude: `npm i -g @agentclientprotocol/claude-agent-acp`
- codex: `npm i -g @agentclientprotocol/codex-acp`
- opencode: `see https://opencode.ai/docs (binary install)`
- gemini: `npm i -g @google/gemini-cli`
- cursor: `curl https://cursor.com/install -fsS | bash`

Reason strings stay as they are: `<adapter> not found on PATH; install: <hint>` for the PATH miss, and `<value> (harnesses.<id>.command) not found on PATH; install: <hint>` (or `not found or not executable`) for an override that is not found.

## Behaviour

- `listHarnesses` (src/list.ts): a harness whose resolution is `notInstalled` appears in neither `harnesses` nor `unavailable`. Carry the flag through `ProbeResult` (e.g. `{ ok: false; reason: string; notInstalled?: true }`) or resolve before probing; your call, keep it small. Everything else in `unavailable` stays: config-error rows (the `loaded.error` branch is unchanged: it still lists every built-in id with the config error), a configured command not found, probe failures.
- `run_thronglet` / `send_message` on a not-installed built-in harness: unchanged, still `harness_unavailable` before spawn, message `<adapter> not found on PATH; install: <hint>`.
- `ListHarnessesOutput` shape in src/contract.ts does not change.

## Removals

- `data/registry.json` (delete the file; `data/` disappears with it), `loadRegistry`, `installHint(snapshot, id)`, `BINARY_INSTALL_HINTS`, the JSON import, the `registryId` fields in claude.ts, codex.ts, opencode.ts, gemini.ts, cursor.ts, the export in src/harnesses/index.ts, the registry argument everywhere `resolve` is called (src/run.ts, src/list.ts, src/harnesses/custom.ts and tests).
- Check tsdown.config.ts, eslint/prettier configs and package.json for references to `data/` and remove them if present.

## Tests (vitest, next to the code, via test/fake-agent; no LLM)

- src/list.test.ts (or wherever list_harnesses is tested now): an absent built-in harness (no adapter on PATH, no override) is in neither list; a built-in with an override command that is not found is in `unavailable` with its reason; a custom harness whose command is missing is in `unavailable`; a config error still lists the built-ins in `unavailable`.
- src/harnesses/index.test.ts: replace the registry tests with checks that each built-in's PATH-miss reason carries its hint and `notInstalled: true`, and that the override-not-found reason has no `notInstalled`.
- run path: an existing test already covers `harness_unavailable` with the install hint for a missing adapter; keep it passing (adjust only if it relied on `unavailable` rows).
- scripts/pack.test.ts: the codex assertion on `unavailable` must change, since codex is no longer listed. Assert it is absent from both lists, and if the packed-bundle test can cheaply call `run_thronglet` on `codex/x`, assert the `harness_unavailable` message carries `install: npm i -g @agentclientprotocol/codex-acp`.
- scripts/smoke/smoke.ts and its test: today `smoke codex/x` without codex-acp prints the `unavailable` row and exits 2 with `harness codex is not available`. Keep exit code 2 and a message naming the harness as not installed/available; if the hint can be shown without much code (e.g. from the `harness_unavailable` error of a `run_thronglet` call, which fails before spawn), show it. Adjust the test accordingly.

## Docs (keep wording plain, match the surrounding style)

- docs/DESIGN.md: §2.3 the ACP registry paragraph (keep it only as background on where adapters come from, or drop it; no snapshot); §3.4 the `unavailable` comment and the paragraph under it (not-installed built-ins are omitted); §4.1 the "Availability" paragraph, the install-hint paragraph (hints are fixed in each definition), the `data/registry.json` paragraph (remove), the `HarnessDefinition` snippet (`registryId` gone, `resolve(config, env?)`, `notInstalled`); the file tree in §4 (`data/registry.json` line, `index.ts discovery.ts` description); §9 the bundle bullet (only `package.json` is a JSON import now).
- docs/development.md lines ~22 and ~41 (registry snapshot), docs/harnesses.md (the "registry id" row of the overview table goes; the install hint row stays).
- README.md ~line 204: `list_harnesses` lists the installed harnesses; a missing one is simply not there, and `run_thronglet` on it says what to install.
- docs/configuration.md troubleshooting rows that mention `unavailable` / the install command: keep accurate.
- src/mcp/tools/list-harnesses.ts description: say it lists installed harnesses (available with models/efforts; `unavailable` = installed or configured but broken: config error, configured command not found, failed probe).
- skills/throng/SKILL.md: check the `harness_unavailable` row and anything about `unavailable`; adjust only if inaccurate.

## Don't touch

backlog/, .changeset/, the run/send paths beyond the `resolve` signature, session records, permissions code, custom harness semantics.

## Acceptance criteria (THRONG-28)

1. list_harnesses omits a built-in harness whose adapter command is not on PATH and has no config override; `unavailable` keeps config errors, a configured command that is not found (built-in override or custom harness), and probe failures.
2. run_thronglet on a built-in harness whose adapter is missing still fails with harness_unavailable before spawn, and the message names the missing command.
3. data/registry.json and the code that reads it are removed.
4. DESIGN §3.4 and §4.1, README and the tool descriptions match the new behaviour; tests cover an absent built-in harness not being listed.

Gates: `pnpm typecheck && pnpm lint && pnpm test`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Run .agent-runbooks/runs/20261012-throng-28 ended ready. Review: Opus 1 finding (a1: the changeset rule in .changeset/config.json, AGENTS.md and docs/development.md still named the removed data/ directory), GPT none; triage rejected a1 for the fix round as outside the coder's reach, the main session fixed all three at finalization. Deviations: the notInstalled flag goes through ProbeResult; DESIGN §2.3 keeps one background sentence about the ACP registry; docs/configuration.md got a troubleshooting row for a built-in harness missing from list_harnesses; smoke on a not-listed harness calls run_thronglet with a nonexistent cwd to print the harness_unavailable message with the install hint (fails before spawn). The config-error branch of list_harnesses still lists every built-in id. Spot-checked discovery.ts, types.ts, list.ts, smoke.ts and the tool description against the brief. Gates in the worktree: pnpm typecheck, pnpm lint, pnpm test green, 29 files, 396 tests.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
list_harnesses omits a built-in harness whose adapter is not on PATH and has no command override (HarnessResolution.notInstalled, set only on that branch of resolveAdapter); unavailable keeps config errors, configured commands not found and failed probes. run_thronglet on a missing adapter still fails harness_unavailable before spawn with '<adapter> not found on PATH; install: <hint>'; hints are constants in each AdapterSpec. data/registry.json, loadRegistry, installHint, registryId and RegistrySnapshot are removed; resolve(config, env?). DESIGN §2.3, §3.4, §4, §4.1, §9, README, docs, tool description updated; data/ dropped from the changeset rule. Evidence: src/list.test.ts (absent built-in in neither list; override-not-found and custom missing command in unavailable; config error), src/harnesses/index.test.ts (each built-in's PATH-miss reason with notInstalled and hint), gemini/cursor tests and scripts/pack.test.ts (run_thronglet on a missing adapter: harness_unavailable with the install command), smoke.test.ts; pnpm typecheck, lint, test green (29 files, 396 tests).
<!-- SECTION:FINAL_SUMMARY:END -->
