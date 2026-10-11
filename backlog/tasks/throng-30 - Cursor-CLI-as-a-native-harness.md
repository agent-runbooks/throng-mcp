---
id: THRONG-30
title: Cursor CLI as a native harness
status: Done
assignee:
  - '@nodge'
created_date: '2026-10-10 15:32'
updated_date: '2026-10-10 21:44'
labels: []
milestone: m-3
dependencies:
  - THRONG-24
references:
  - 'https://cursor.com/docs/cli/acp'
documentation:
  - docs/DESIGN.md
priority: medium
type: feature
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cursor subscriptions bundle many models plus the Composer models that exist nowhere else, bound to Cursor login; only cursor-agent can spend them. THRONG-24 (spike, 2026-10-10, cursor-agent 2026.10.01-e373342, free account) answered how it behaves over ACP; its notes hold the raw facts. In short: `cursor-agent acp` needs `authenticate {methodId: cursor_login}` after initialize (tokens come from `agent login`, kept in the macOS keychain); the only auto switch is the global flag before the subcommand, `cursor-agent --force acp`, and it covers shell, MCP tools and web search; without it shell, web search/fetch and MCP calls send request_permission, file edits are applied without asking; modes are agent/plan/ask, config options mode and model (effort is part of the model value, e.g. `gpt-5.4-nano[reasoning=medium]`, no thought_level); no session/resume, only session/load, which replays the history as session/update before the next turn (ACP spec behaviour).

Decided by nodge (2026-10-10): no throng-owned CURSOR_CONFIG_DIR; edits Cursor applies without asking are fine under every policy (a harness that does not ask is not throng's concern), so allow_all, deny_all and elicit only answer the requests Cursor sends; the free-plan reply "Upgrade your plan to continue" (end_turn, no error) is passed through as text, no special handling. Implementation starts on the maintainer's go, in the worktree .claude/worktrees/cursor-harness. THRONG-20 (generic registry harness) runs in parallel and the registry has an entry with id cursor: the native definition takes precedence over it; expect overlap in harness registration code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Agent strings `cursor/<model>` run through `cursor-agent acp`; list_harnesses shows cursor with the models from the session/new config option of category model; cursor-agent not on PATH → unavailable with an install hint
- [x] #2 A model is accepted as a listed value or as its name before the bracket (e.g. `gpt-5.4-nano`), resolved to the listed value; anything else → model_rejected with the list; an explicit effort gives the standard warning that the harness has no effort knob
- [x] #3 Tests via test/fake-agent cover: authenticate after initialize, `--force` in launch args for auto only, model resolution by name, continuation via session/load with a replayed history that stays out of the result
- [x] #4 After initialize throng calls `authenticate` with `cursor_login` when the agent advertises it (run and list_harnesses probe alike); without `agent login` the call fails with handshake_failed carrying the agent's "run agent login" message
- [x] #5 `harness_mode: auto` launches `cursor-agent acp --force`, `ask` launches without the flag; request_permission is answered per `permission_answers` (DESIGN §5); nothing blocks edits Cursor applies on its own, and DESIGN/README say so
- [x] #6 `send_message` (steer included) continues a Cursor session through session/load in a new adapter process; the replayed history ends up neither in the turn text nor in warnings; the record is resumable, list_thronglets shows accepts_messages true. Gemini stays one-turn (THRONG-31): load continuation is opt-in per harness definition
- [x] #7 scripts/smoke has a cursor case; maintainer smoke on a real Cursor account: under `harness_mode: auto` a shell command outside Cursor's allowlist runs without request_permission, under `ask` + `deny` it is refused, send_message answers from the previous turn
- [x] #8 DESIGN: Cursor facts in §2, the harness id in §3, the handshake (authenticate, session/load) in §4.2, a cursor column in the §4.1 table, `resumable` in §8, Cursor dropped from §11; README lists cursor with the `agent login` step
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Went through the runbook-task-cycle; report spot-checked
- [x] #2 Gates green: pnpm typecheck && pnpm test
- [x] #3 DESIGN.md updated if an external contract (DESIGN §3) changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# THRONG-30: Cursor CLI as a native harness

Repo: the worktree this run gets as `repo` (branch `cursor-harness`, rebased on main after THRONG-20 custom harnesses and THRONG-29 `harness_mode`/`permission_answers`). Source of truth: docs/DESIGN.md. Read §2.3 (Gemini, the closest precedent), §3.1, §3.3 (send_message, resume), §3.7, §4.1, §4.2, §5, §8, §11 before coding, and the THRONG-22 gemini implementation (`src/harnesses/gemini.ts`, `gemini.test.ts`, the gemini fake-agent scenarios) as the pattern to follow.

## Facts about Cursor (spike THRONG-24, cursor-agent 2026.10.01-e373342, free account; no need to re-verify)

- Binary `cursor-agent` (the installer also links `agent`); ACP server: `cursor-agent acp`. Registry id `cursor`, binary distribution, install: `curl https://cursor.com/install -fsS | bash`.
- `initialize` → `agentCapabilities {loadSession: true, sessionCapabilities: {list: {}}, mcpCapabilities: {http, sse}, promptCapabilities: {image}}`, `authMethods: [{id: 'cursor_login', ...}]`. No `sessionCapabilities.resume`.
- `session/new` before `authenticate` → JSON-RPC -32000 "Authentication required. Please run 'agent login' first, then call authenticate() with methodId 'cursor_login'." After `authenticate {methodId: 'cursor_login'}` (result `{}`) session/new works. Login itself is the user's business (`agent login`, tokens in the macOS keychain).
- session/new returns `modes` (agent current, plan, ask), `models` (the unstable field) and `configOptions`: `mode` (category mode) and `model` (category model, values like `default[]` (Auto), `gpt-5.4-nano[reasoning=medium]`, `claude-opus-5-5[context=300k,effort=medium,fast=false]`). No `thought_level`. `session/set_config_option` accepts only exact listed values (`gpt-5.4-nano[reasoning=low]` → -32602).
- Auto approval: the root flag `--force`; `cursor-agent acp --force` is accepted (an unknown flag there fails with "unknown option"), so appending it after `acp` works. With it, shell, MCP tool calls and web search run without request_permission. Without it they send request_permission (kinds execute, other, search, fetch; options allow-once/allow_once, allow-always/allow_always, reject-once/reject_once). File edits never ask in either case.
- MCP stdio servers from session/new work. Our submit tool's request_permission title is `<server>-<tool>: <tool>`, i.e. `throng_result-submit_result: submit_result`, which `isThrongResultCall` already matches.
- `session/load {sessionId, cwd, mcpServers}` in a fresh process continues the session (memory intact). Before answering, the agent replays the history as `session/update` (`user_message_chunk`, `agent_thought_chunk`, `agent_message_chunk`, `available_commands_update`); the load response comes after the replay.
- `cursor/create_plan` arrives only in plan mode; throng never sets plan mode. The SDK default "method not found" for unknown requests is fine; nothing to add.
- On a free plan a non-Auto model replies with the text "Upgrade your plan to continue" and `end_turn`. Passed through as is, no handling.

## Maintainer decisions (2026-10-10)

- No throng-owned `CURSOR_CONFIG_DIR`, no config file written for Cursor.
- Edits Cursor applies without asking are fine under every setting: throng only answers the requests Cursor sends. Document it (README harness block, DESIGN §2 Cursor facts, §5 note).
- "Upgrade your plan" is not detected.
- Gemini keeps its one-turn behaviour in this task (THRONG-31 handles it): load continuation is opt-in per definition.

## Contracts (fixed; the main session owns them; write them exactly)

1. `src/contract.ts`: `export const HARNESS_IDS = ['claude', 'codex', 'opencode', 'gemini', 'cursor'] as const;`
2. `src/harnesses/types.ts`, `HarnessDefinition`, add after `permissionSetup`:
```ts
    /** `authenticate` method sent after `initialize` when the agent lists it in `authMethods` (Cursor: `cursor_login`). */
    authMethodId?: string;
    /** Continue sessions through `session/load` when the agent advertises `loadSession` but not `sessionCapabilities.resume`. */
    continueViaLoad?: boolean;
```
3. `src/acp/types.ts`:
   - `WorkerSpawn` gains `/** Sent as \`authenticate\` after \`initialize\` when the agent lists it in \`authMethods\`; skipped otherwise. */ authMethodId?: string;`
   - `SessionStart` resume variant becomes `{ kind: 'resume'; sessionId: string; cwd: string; mcpServers: McpServer[]; allowLoad?: boolean }`, with the type's doc comment saying: `session/resume` when the agent advertises it; else `session/load` when `allowLoad` and `agentCapabilities.loadSession`; else `session_not_found`. Updates that arrive while `session/load` is pending (the replayed history) are not passed to `onUpdate`.
   - `WorkerHooks.onUpdate` doc: mention the load exception in a few words.
If you believe another contract change is needed, stop and say so in the report instead of making it.

## What to build

1. `src/acp/worker.ts` handshake: after the protocol check, if `spawn.authMethodId` is set and `init.authMethods` contains that id, call `authenticate` (step name `'authenticate'` in `HandshakeStep`; a JSON-RPC error there → `handshake_failed` with the agent's message, like other steps). Resume branch: resume when advertised (unchanged); else when `start.allowLoad && init.agentCapabilities?.loadSession` → `session/load` (step `'session/load'`), drop every `session/update` until it resolves, `buildSession` from its response; an error from session/load → `session_not_found`, as for resume. Neither → the existing `session_not_found`, its text not claiming only resume when load was allowed. Keep the stderr tail in messages as today.
2. `src/run.ts`: pass `def.authMethodId` in the `WorkerSpawn`, `allowLoad: def.continueViaLoad` in the resume start; `resumable` = resume advertised, or `def.continueViaLoad` and `loadSession` advertised. `src/list.ts` probe: pass `authMethodId` too (the probe must authenticate to reach session/new).
3. `src/harnesses/select.ts` `selectModel`: resolve the requested model against the offered values (both the `model` option and `session.models`): an exact match wins; otherwise the single value whose part before the first `[` equals the request; zero or several → `model_rejected` with the existing message. Set the resolved value. Generic, not Cursor-specific. Keep `list_harnesses` showing the full values.
4. `src/harnesses/cursor.ts`, following gemini.ts: `AdapterSpec {id: 'cursor', registryId: 'cursor', adapter: 'cursor-agent', args: ['acp']}`; `mapEffort: () => undefined` (no thought_level; selectEffort already warns); `permissionSetup: mode => (mode === 'auto' ? { args: ['--force'] } : {})` (no modeId: agent is the default mode); `authMethodId: 'cursor_login'`; `continueViaLoad: true`. Register in `HARNESSES` (index.ts). Install hint: add `cursor: 'curl https://cursor.com/install -fsS | bash'` to `BINARY_INSTALL_HINTS` in discovery.ts.
5. `src/mcp/tools/send-message.ts` and anything else that says a session continues only through session/resume: reword to "resume or load" where the statement is general; the one-turn refusal text for `resumable: false` stays valid (gemini).
6. Fake agent (`test/fake-agent/agent.ts`, `index.ts` `FakeScenario`, docs in index.ts): a Cursor-like scenario (or a small set) that: advertises `authMethods [{id:'cursor_login', name:'Cursor Login'}]` and answers session/new with -32000 until `authenticate` was called; has `loadSession: true` and no `sessionCapabilities.resume`; offers a `model` option with bracketed values (e.g. `fake-small[effort=low]`, `fake-big[reasoning=high]`), no thought_level; on `session/load` replays a stored history for that session id as session/update (`user_message_chunk` + `agent_message_chunk` with distinctive text) and only then answers; remembers across processes like the existing `resume-memory` scenario (FAKE_MEMORY_DIR). Log `authenticate`, `session/load` and its argv (to see `--force`) through `FAKE_CALL_LOG`.
7. Tests (vitest, next to the code; no LLM): `src/harnesses/cursor.test.ts` modelled on gemini.test.ts plus worker/run tests where they belong: authenticate after initialize (and its absence for a harness without `authMethodId`); session/new failing without authenticate surfaces as handshake_failed with the agent's message; `--force` in the argv for `harness_mode: auto` only; model resolution by name (exact wins, unique prefix resolves, ambiguous and unknown rejected) including the gemini `session.models` branch; send_message through session/load in a second process answers from memory, with the replayed text absent from `text` and `warnings`; record `resumable: true` and `accepts_messages: true`; a gemini-like agent with `loadSession: true` but no `continueViaLoad` still gets the one-turn refusal; list_harnesses probe of the cursor-like agent shows the bracketed models and empty efforts.
8. Smoke: `scripts/smoke` gets a cursor case like gemini's (`pnpm smoke:cursor` in package.json scripts, default model `default[]`/name `default`, which works on a free plan); docs/development.md smoke section: the commands for the maintainer, including running with `harness_mode: auto` and with `ask` + `deny` through a smoke config as the gemini case does, and a send_message follow-up. The orphan pattern covers `cursor-agent`.
9. Docs: DESIGN §2 (a Cursor subsection with the facts above, short), §3 where harness ids are listed, §3.3 (continuation: resume or load, replay dropped), §3.7 (`accepts_messages`), §4.1 (cursor column: adapter, args, auth, modes, effort, continuation), §4.2 handshake steps (authenticate; load), §5 one line that harnesses which apply edits without asking (Cursor) are not gated, §8 (`resumable` meaning), §11 drop Cursor from the future list. README: cursor among supported harnesses with install, `agent login`, the free-plan Auto note in one line, and that edits are not asked. docs/configuration.md where harness ids/examples are listed. `skills/throng/SKILL.md` only where it lists harnesses.

## Acceptance criteria (the task's)

1. Agent strings `cursor/<model>` run through `cursor-agent acp`; list_harnesses shows cursor with the models from the session/new config option of category model; cursor-agent not on PATH → unavailable with an install hint.
2. A model is accepted as a listed value or as its name before the bracket (e.g. `gpt-5.4-nano`), resolved to the listed value; anything else → model_rejected with the list; an explicit effort gives the standard warning that the harness has no effort knob.
3. Tests via test/fake-agent cover: authenticate after initialize, `--force` in launch args for auto only, model resolution by name, continuation via session/load with a replayed history that stays out of the result.
4. After initialize throng calls `authenticate` with `cursor_login` when the agent advertises it (run and list_harnesses probe alike); without `agent login` the call fails with handshake_failed carrying the agent's "run agent login" message.
5. `harness_mode: auto` launches `cursor-agent acp --force`, `ask` launches without the flag; request_permission is answered per `permission_answers` (DESIGN §5); nothing blocks edits Cursor applies on its own, and DESIGN/README say so.
6. `send_message` (steer included) continues a Cursor session through session/load in a new adapter process; the replayed history ends up neither in the turn text nor in warnings; the record is resumable, list_thronglets shows accepts_messages true. Gemini stays one-turn (THRONG-31): load continuation is opt-in per harness definition.
7. (maintainer, not this run) Real-account smoke; this run only provides the smoke case and commands.
8. DESIGN sections as listed in item 9; README lists cursor with the `agent login` step.

## Do not touch

- `backlog/`, `.changeset/`, `data/registry.json`, the claude/codex/opencode/gemini definitions (gemini.ts stays as is), `package.json` dependencies, the lockfile. Adding a `smoke:cursor` script is fine.
- No `CURSOR_CONFIG_DIR`, no config files written for Cursor, no detection of "Upgrade your plan", no handling of `cursor/*` requests.
- Custom harnesses (`custom.ts`, config schema): no new config keys for auth or load.
- Anything outside the repo.

Gates: `pnpm typecheck && pnpm lint && pnpm test`. Formatting via prettier in the pre-commit hook; don't hand-format. Comment sparingly: purpose above public entities, inside bodies only for non-obvious intent; no restating names or types.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Run .agent-runbooks/runs/20261010-throng-30 ended ready. Contracts by the main session (in the brief, written verbatim by the coder): cursor in HARNESS_IDS, HarnessDefinition.authMethodId and continueViaLoad, WorkerSpawn.authMethodId, SessionStart resume variant with allowLoad. Checked on the real binary before the run (no login): `cursor-agent acp --force` is accepted, an unknown flag after acp fails "unknown option", so PermissionSetup.args appended after `acp` works; whether --force takes effect is for the smoke. Review: Opus 1 finding (a1, fake-agent docs did not say cursor scenarios ignore FAKE_CONFIG_OPTIONS; fixed, comment only), GPT 0. Coder deviations: comment-only rewording of accepts_messages (contract.ts) and resumable (sessions.ts) from "resume" to "continue". Worker detail: after the session/load response the worker waits one setImmediate before clearing the replay flag, because the SDK dispatches notifications a few microtasks after responses. Spot-checked by the main session: worker.ts handshake (authenticate only when advertised, load only with allowLoad, session_not_found on load errors), run.ts canContinue, select.ts resolveModel (exact first, unique bracket prefix, else model_rejected), cursor.ts. Gates in the worktree: typecheck 0, lint 0, vitest 28 files 393 tests; rerun by the main session: cursor/select/worker tests 60/60. AC #7 (real-account smoke) waits on the maintainer: commands in docs/development.md smoke section.

Smoke by the main session on the real Cursor CLI 2026.10.01-e373342 (free account, logged in by nodge, binary unpacked in the scratchpad and put on PATH only for the runs), 2026-10-10. Passed: (1) auto, edit + send_message through session/load answered pong.txt; (3b) auto, `echo pong > pong.txt` ran with no request_permission (--force after acp works); (3) ask + deny, the same shell command got reject-once twice, no file; (2) ask + deny, shell refused, then Cursor wrote the file with its edit tool unasked (expected, documented); (4) --steer after the smoke fix; (5) effort warning; (6) cursor/gpt-5.4-nano resolved to the listed value, free plan answered "Upgrade your plan" (expected). Two smoke-side fixes, no server change: the orphan check waits past throng's whole adapter shutdown (2 × DEFAULT_EXIT_GRACE_MS + 2 s; cursor-agent sometimes outlived 3 s and 7 s windows, the processes were gone right after; 3 runs clean at 12 s), and --steer waits 10 s before steering (Cursor stores a session only after its first turn produced output; the old smoke steered at 4.7 s and session/load answered "Session not found"). Found while checking: Cursor saves the selected model as its ACP default in ~/.cursor/acp-config.json. Cursor facts moved to docs/harnesses.md (THRONG-32). Gates after the fixes: typecheck 0, lint 0, vitest 393/393 three runs in a row (one unexplained failure in an earlier smoke-tests-only run, not reproduced in five later runs).

Code review (xhigh, main session, 2026-10-10), fixed on the branch: an ambiguous model name now says "names several values; pick one: …" instead of "not available"; the one-turn refusal says the harness "can't continue a session" (resume or load); the resume-else-load rule lives once in acp/worker.ts `continuation()`, used by the handshake and by run.ts for `resumable`; the smoke takes `--steer-delay <s>` (default 10) and its fake-agent test passes 0, saving 10 s per pnpm test; docs/harnesses.md: Cursor exit timing as measured (1.8 s idle, < 0.5 s after a turn, 2 of 8 smoke runs unexplained), the model-default note limited to what was seen. Skipped: a Cursor session cancelled before its first output is recorded resumable (Cursor-side, documented); the list_harnesses probe leaves an empty Cursor session in ~/.cursor/acp-sessions on every call (the probe needs session/new to read models). Gates: typecheck 0, lint 0, vitest 394/394 twice.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Cursor CLI is a built-in harness: `cursor/<model>` runs `cursor-agent acp` (`--force` under harness_mode auto), throng authenticates with cursor_login after initialize (run and probe), send_message continues through session/load with the replayed history kept out of the result (opt-in per definition, gemini stays one-turn), models resolve by name before the bracket for every harness. DESIGN §2/§3/§4.1/§4.2/§5/§8/§11, README, configuration, development docs and the skill updated; smoke case `pnpm smoke:cursor`. Verified by tests (fake-agent cursor scenarios: authenticate, --force only for auto, model resolution, load continuation incl. steer, probe, install hint); real-account smoke pending (AC #7).
<!-- SECTION:FINAL_SUMMARY:END -->
