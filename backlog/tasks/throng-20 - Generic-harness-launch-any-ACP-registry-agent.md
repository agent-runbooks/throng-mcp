---
id: THRONG-20
title: User-defined harnesses from config
status: Review
assignee:
  - '@opus'
created_date: '2026-10-02 21:22'
updated_date: '2026-10-10 15:13'
labels: []
milestone: m-3
dependencies: []
priority: high
type: feature
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
throng has four native harnesses (claude, codex, opencode, gemini). The maintainer will not take PRs for niche ACP agents, but a user who wants one should be able to describe it in their own config, with enough flexibility to express everything throng needs from a harness: command, args, env, and how each permission policy is expressed natively.

History. The task started as "launch any ACP registry agent" (registry id as harness, command and auto mode inferred from the registry entry and session/new). Rejected on 2026-10-10 after checking how other ACP clients work (source of Zed, t3code, acpx, agent-shell, Toad, codecompanion.nvim, avante.nvim, Obsidian Agent Client): registry consumers install agents themselves into their own dirs, which decision-3 forbids; the registry carries no bin name for npx packages, so finding the command on PATH means guessing it; and nothing in the ACP spec or registry marks a mode or config option as auto-approve, so picking yolo/auto/bypass is guessing too. Zed and agent-shell do it the same way: the user names the mode per agent. So a harness beyond the natives is defined entirely in config, nothing is inferred, and the registry plays no part. Listing only installed harnesses is THRONG-28.

Config shape agreed with the maintainer:

```yaml
harnesses:
  kimi:                          # any id except the native ones; no "/" or ":"
    command: kimi                # required: a name on PATH or a path
    args: [acp]
    env: { KIMI_X: "1" }
    permissions: allow_all       # the existing per-harness policy override
    auto_approve:                # policy auto: the agent approves on its own
      mode: yolo
      config_options: { permission: bypass }
    ask_approval:                # allow_all / deny_all / elicit: the agent asks throng
      mode: default
```

Both blocks take mode, config_options, args, env. No effort mapping and no pre-turn noise filter (YAGNI).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A `harnesses.<id>` entry whose id is not native (claude, codex, opencode, gemini) defines a user harness with `command` (required; a name on PATH or a path), `args`, `env`, `permissions`, `auto_approve`, `ask_approval`; run_thronglet accepts `<id>/<model>[:<effort>]` and launches `command args` with `env`. An id containing `/` or `:`, a missing `command`, or `auto_approve`/`ask_approval` on a native id is a config error
- [x] #2 A user harness whose command is not found: run_thronglet fails with harness_unavailable before spawn, naming the command and its config key, without an install hint; list_harnesses lists it under unavailable with the same reason. An agent spec whose harness is neither native nor configured fails with harness_unavailable listing the valid harness ids
- [x] #3 Policy auto applies `auto_approve`, the other policies apply `ask_approval`: `mode` via session/set_mode (strict, as for natives), `config_options` via session/set_config_option in order (best effort with warnings, as in THRONG-21), `args` appended to the launch args, `env` merged into the adapter env; applied after session/new and after session/resume. Policy auto without `auto_approve` runs in the agents starting mode and the result carries a warning naming `harnesses.<id>.auto_approve`. Answers to request_permission follow DESIGN §5 unchanged
- [x] #4 Model and effort on a user harness: model through the `model` config option or the session `models` list with session/set_model; a model not offered → model_rejected; effort is set only when the `thought_level` option offers exactly that value, otherwise a warning
- [x] #5 A user harness session works with send_message, wait_thronglet, list_thronglets and cancel_thronglet like a native one; send_message to a session whose harness is no longer configured fails with harness_unavailable before spawn
- [x] #6 Native harnesses behave exactly as before: their config keys, list_harnesses output and existing tests are unchanged
- [x] #7 Tests via test/fake-agent cover: launch with command/args/env from config, auto_approve mode and config options, the missing auto_approve warning, ask_approval under allow_all, model and effort, command not found, unknown harness id, a resumed turn
- [x] #8 DESIGN (§3.1, §3.4, §4.1, §8, §11), docs/configuration.md and README describe user harnesses; a backlog decision records that harnesses beyond the natives come from config only, not from the ACP registry
- [ ] #9 Smoke (maintainer): a user harness entry pointing at an installed adapter runs one real turn under policy auto with auto_approve and one under allow_all
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Went through the runbook-task-cycle; report spot-checked
- [x] #2 Gates green: pnpm typecheck && pnpm test
- [x] #3 DESIGN.md updated if an external contract (DESIGN §3) changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# THRONG-20: user-defined harnesses from config

Repo: the worktree you were given (branch `throng-20`). Read AGENTS.md "Code rules", then DESIGN.md §3.1, §3.3, §3.4, §4.1 (all of it, including the new "User harnesses" part), §5 and §8, and `backlog/decisions/decision-8 - …md`.

## Goal

Besides the four native harnesses (claude, codex, opencode, gemini: `HarnessDefinition`s in `src/harnesses/`), a user can define a harness entirely in the throng config:

```yaml
harnesses:
  kimi:                          # any id that is not native; no "/" or ":"
    command: kimi                # required: a name looked up on PATH, or a path
    args: [acp]
    env: { KIMI_X: "1" }
    permissions: allow_all       # the existing per-harness policy override
    auto_approve:                # used under policy auto
      mode: yolo
      config_options: { permission: bypass, brave_mode: true }
      args: []
      env: {}
    ask_approval:                # used under allow_all / deny_all / elicit; same four keys
      mode: default
```

`run_thronglet` then accepts `kimi/<model>[:<effort>]`. Nothing is inferred: no ACP registry lookup, no guessing of commands or auto modes.

## Already done by the main session (commit `THRONG-20: contract …` on this branch). Do not change these

- `src/contract.ts`: `HARNESS_IDS`/`HarnessId` stay the native ids (doc comment added); `HarnessInfo.harness` is now `string`.
- `src/harnesses/types.ts`: `HarnessDefinition.id: string`, `registryId?: string` (natives only), `PermissionSetup.warning?: string`.
- `docs/DESIGN.md` §3.1, §3.2 (`harness_unavailable` comment), §3.3, §3.4, §4.1 (interface block, registry paragraph, "User harnesses"), §8 (config example and validation sentence), §11. If the implementation ends up contradicting that text, stop and report it instead of editing either side silently.

## What to implement

1. Config (`src/config.ts`). `harnesses` becomes a map keyed by any id:
   - a native id keeps exactly today's override schema (`command`, `args`, `env`, `permissions`); `auto_approve`/`ask_approval` there is a config error (strict object already rejects unknown keys; make sure the message names the key path);
   - any other id must match `^[A-Za-z0-9][A-Za-z0-9._-]*$` (so no `/`, `:`), and its entry is the user-harness schema: `command` (required, non-empty), `args`, `env`, `permissions`, `auto_approve`, `ask_approval`; each approval block is a strict object `{ mode?: string (non-empty); config_options?: Record<string, string | boolean>; args?: string[]; env?: Record<string, string> }`;
   - errors come out through the existing `loadConfig` path (`invalid config: <path>: <message>`), so `list_harnesses` and `run_thronglet` report them as today.
   - Pick the TypeScript shape that keeps consumers simple: today `config.harnesses[harness]?.permissions` / `.command` / `.args` / `.env` are read for natives (`permissions.ts` `resolvePolicy`, `run.ts` elicitation key, `discovery.ts` `resolveAdapter`); those reads must keep working for both kinds. Keep the null-section preprocessing (`kimi:` with no value is `{}` for natives; for a user harness it then fails on the missing `command`).
2. User harness definition: a new `src/harnesses/user.ts` exporting a factory that builds a `HarnessDefinition` from an id and its config entry (DESIGN §4.1 "User harnesses"):
   - `resolve`: reuse the command lookup of `resolveAdapter` in `discovery.ts` (PATH name vs path, executable check) without duplicating it: factor the lookup out if needed. Reason when missing: `<command> (harnesses.<id>.command) not found on PATH` or `… not found or not executable`, no `; install:` part. Launch `env` = the entry's `env`; no harness-binary env.
   - `permissionSetup(policy)`: `auto` → `auto_approve`, otherwise `ask_approval`; `mode` → `modeId`, `config_options` → `configOptions` (entries in written order), `args`, `env`. An absent block → `{}`, except that an absent `auto_approve` under `auto` returns `{ warning: 'harnesses.<id>.auto_approve is not set: <id> runs in the mode it starts in, and throng refuses every permission request it makes (policy auto)' }` (wording may be tightened, must name the key). A present but empty `auto_approve: {}` gives no warning.
   - `mapEffort`: `options.includes(level) ? level : undefined`.
   - no `newSessionMeta`, no `preTurnNoise`, no `registryId`.
3. Lookup (`src/harnesses/index.ts`): replace `harnessById(id: HarnessId)` with a lookup that takes the config, e.g. `harnessFor(id: string, config: Config): HarnessDefinition | undefined` (natives first), plus a way to list every harness id the config knows (natives, then user ids in config order) for `list_harnesses` and error messages. `HARNESSES` stays for natives (tests spy on `HARNESSES.claude`).
4. Agent spec (`src/agent-spec.ts`): `AgentSpec.harness` becomes `string`. The unknown-harness check moves to where the config is known (`run.ts` request handling, before spawn): unknown → `harness_unavailable` `Unknown harness "<id>" in agent spec "<spec>"; valid harnesses: <natives and configured user ids>`. Keep `parseAgentSpec` pure; keep its other behaviour (effort suffix, empty model → `model_rejected`) and its existing test assertions. A broken config still fails first with `config error:` as today.
5. `src/run.ts`: use the lookup; `setup.warning` → `warn(...)`; everything else (mode strict, config options best effort, args/env merge, model/effort, resume path) already handles any `HarnessDefinition` and should need no change. The session record stores the user harness id.
6. Sessions: `SessionRecord.harness` becomes `string`. `loadSessionRecord` (`sessions.ts`) and `usable` (`list-thronglets.ts`) accept any non-empty string id instead of only `HARNESS_IDS`. `send_message` / `wait_thronglet` / `cancel_thronglet` on a record whose harness is no longer native or configured: `send_message` fails with `harness_unavailable` before spawn (same unknown-harness message, naming the session's harness); `list_thronglets` still lists it; `wait`/`cancel` behave as for any record (they don't spawn).
7. `src/list.ts`: probe natives and every configured user harness (same probe, no policy setup, as for natives); `harness` in the output is the id. On a config error, `unavailable` lists the natives as today (user ids are unknown then).
8. `resolvePolicy(config, harness: string)` in `permissions.ts`.
9. Docs: `docs/configuration.md` (config example with a commented user harness, a "User harnesses" section: what each key does, that auto without `auto_approve` refuses everything, effort exact match, troubleshooting row for `harness_unavailable` on a user harness), `README.md` (one short paragraph under the harness list pointing at configuration.md: any other ACP agent can be described in the config; nothing installed or guessed by throng). Tool descriptions: `src/mcp/tools/run-thronglet.ts` agent field mentions natives only implicitly via list_harnesses, adjust only if it now reads wrong. `skills/throng/SKILL.md`: no change unless a sentence becomes false.

## Tests (vitest, next to the code, fake agent only; `test/fake-harness.ts` builds configs whose harness runs `test/fake-agent`)

Add, don't edit existing assertions:
- config: valid user entry; missing `command`; bad id (`a/b`, `a:b`); `auto_approve` on `claude`; bad approval block key; `kimi:` with no value.
- user definition unit tests: `permissionSetup` for each policy, the warning, empty `auto_approve: {}`, config_options order, `mapEffort`, `resolve` found / not found (name and path).
- runCall on a user harness backed by the fake agent (extend `fakeHarness` with a helper for a user id if useful, e.g. `fakeAs` accepting any id; it writes `command/args/env` already): launch argv/env from config (FAKE_CALL_LOG `start` event), `auto_approve` mode + config options applied in order after session/new (FAKE_CONFIG_OPTIONS to advertise them), the missing-`auto_approve` warning in the result, `ask_approval` mode under `allow_all`, model via option and via the gemini-shaped `models` list, effort exact / not offered → warning, `model_rejected`, command not found → `harness_unavailable` without `install:`, unknown harness id → `harness_unavailable` listing ids, a resumed turn (`send_message`) re-applying the approval setup, `send_message` on a record whose harness was removed from the config → `harness_unavailable`.
- list_harnesses: a configured user harness is probed and listed under its id; one whose command is missing is under `unavailable` with the reason above.

## Acceptance criteria (from the task)

1. A `harnesses.<id>` entry whose id is not native defines a user harness with `command` (required), `args`, `env`, `permissions`, `auto_approve`, `ask_approval`; run_thronglet accepts `<id>/<model>[:<effort>]` and launches `command args` with `env`. An id with `/` or `:`, a missing `command`, or `auto_approve`/`ask_approval` on a native id is a config error.
2. Command not found: harness_unavailable before spawn naming the command and its config key, no install hint; list_harnesses lists it under unavailable with the same reason. A harness neither native nor configured → harness_unavailable listing the valid ids.
3. Policy auto applies `auto_approve`, the others `ask_approval` (mode strict, config_options best effort in order, args appended, env merged), after session/new and session/resume. Auto without `auto_approve` → starting mode + warning naming `harnesses.<id>.auto_approve`. request_permission answers per §5 unchanged.
4. Model via `model` option or `models` list + set_model; not offered → model_rejected; effort only on an exact `thought_level` value, else warning.
5. User harness sessions work with send_message, wait_thronglet, list_thronglets, cancel_thronglet; send_message to a session whose harness is no longer configured → harness_unavailable before spawn.
6. Natives unchanged: config keys, list_harnesses output, existing tests.
7. Tests as listed above.
8. Docs: configuration.md and README (DESIGN and the decision are done).
(9, the maintainer's smoke, is outside the run.)

## Do not touch

`backlog/`, `.changeset/`, `src/contract.ts`, `src/harnesses/types.ts`, `docs/DESIGN.md`, `data/registry.json`, the native harness definitions' behaviour, anything outside the worktree. No new dependencies.

## Gates

`pnpm typecheck && pnpm lint && pnpm test` green. Only erasable TS syntax, imports with `.ts`. Comments per the surrounding code: sparse, purpose above public entities.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Run .agent-runbooks/runs/20261010-throng-20 (worktree throng-20) ended ready. Review: Opus 1 finding, GPT (codex/gpt-6.1-sol:high) 2. Fixed: a1 docs/configuration.md sentence about the list_harnesses probe rendered inside the env bullet (blank line added); b2 a bare `auto_approve:` or `ask_approval: null` on a native id loaded silently, now rejected by key presence (Object.hasOwn) with two regression tests. Rejected as not worth it: b1, integer-like config_options ids (and user ids) enumerate numerically, so "written order" does not hold for them; no known ACP agent uses numeric option ids, and keeping order would mean ordered YAML maps or an entry list in the schema.

Deviations: the unknown-harness check moved from parseAgentSpec to run.ts (it needs the config), so two parseAgentSpec assertions (nope/pro, Claude/opus-5-5) moved to run.test.ts; a corrupt-record fixture changed from harness "nope" (now a valid id of a removed user harness, harness_unavailable) to harness 42. Decisions by the coder: one HarnessEntry schema plus a map-level superRefine; a bare `auto_approve:` on a user harness counts as absent (warning), `auto_approve: {}` silences it; unknown harness of a resumed session reads `Unknown harness "<id>" in session <id>`.

Validation: pnpm typecheck, pnpm lint, pnpm test in the worktree: 27 files, 339 tests (baseline 26/303). Token-free real-adapter check: list_harnesses with user entries my-codex (codex-acp), my-opencode (opencode acp) and my-missing: both probed with the same command, version 2.1.1 / 1.18.34, models and efforts as the natives; my-missing under unavailable as "no-such-acp-agent (harnesses.my-missing.command) not found on PATH"; native rows unchanged. AC #9 (a real turn, auto and allow_all) is the maintainer smoke: no install needed, e.g. a `my-codex: { command: codex-acp, auto_approve: { mode: agent }, ask_approval: { mode: read-only } }` entry.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
User harnesses from config (decision-8): a non-native `harnesses.<id>` entry defines a harness with command/args/env/permissions and per-policy auto_approve / ask_approval blocks (mode strict, config_options best effort, args, env). Harness ids are open strings in the agent spec, list_harnesses and session records; an unknown id or a missing command is harness_unavailable before spawn. Natives unchanged. Verified by pnpm typecheck/lint/test (27 files, 339 tests; user.test.ts, config.test.ts, run.test.ts, index.test.ts) and a token-free list_harnesses probe of codex-acp and opencode described as user harnesses. Waits on AC #9, the maintainer smoke of a real turn under auto and allow_all.
<!-- SECTION:FINAL_SUMMARY:END -->
