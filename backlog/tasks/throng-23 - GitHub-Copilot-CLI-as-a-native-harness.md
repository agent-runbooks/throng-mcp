---
id: THRONG-23
title: GitHub Copilot CLI as a native harness
status: Done
assignee:
  - '@nodge'
created_date: '2026-10-02 21:23'
updated_date: '2026-10-13 22:54'
labels: []
milestone: m-3
dependencies:
  - THRONG-21
references:
  - 'https://github.com/github/copilot-cli/issues/4537'
  - 'https://github.com/github/copilot-cli/blob/main/changelog.md'
priority: medium
type: feature
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Copilot subscriptions are common in teams, and the Copilot CLI gives Claude, GPT and Gemini models under that one subscription; the quota is bound to GitHub login, so no other harness can spend it. Registry id github-copilot-cli, launch 'copilot --acp' (npx package @github/copilot). Auto approval in ACP: flag --allow-all-tools (alias --yolo, supported in ACP since 0.0.400) or session/set_config_option allow_all=on (works since 1.0.88). Both knobs need the HarnessDefinition extension task.

Blocked by an upstream regression: since Copilot CLI 1.0.81 the ACP server never sends request_permission at all (github/copilot-cli issue #4537), so deny_all and elicit cannot be implemented honestly; every policy would behave as allow_all. Pick the task up when the issue is closed and a release restores request_permission. Copilot CLI is closed source: the exact mode ids and config option ids must be read from the probe (session/new response), not assumed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Agent strings copilot/<model>[:<effort>] run through Copilot CLI over ACP; list_harnesses shows copilot with models and efforts from the probe
- [x] #2 Harness mode auto turns on allow_all (session/set_config_option allow_all=on); harness mode ask leaves it off and launches with COPILOT_ALLOW_ALL=false, and permission_answers apply to Copilot's request_permission
- [x] #3 copilot not on PATH → not listed by list_harnesses; run_thronglet on copilot fails with harness_unavailable and the install hint `npm i -g @github/copilot`
- [ ] #4 Unit tests via test/fake-agent for the wiring; scripts/smoke has a copilot case; maintainer smoke on the real CLI with harness_mode auto, with ask + deny, and with a schema
- [x] #5 DESIGN §4.1 table and README updated
- [ ] #6 run_thronglet with a schema on copilot returns structured: submit_result reaches Copilot through --additional-mcp-config, and under ask throng still answers its own submit_result allow_once although Copilot's permission request titles it only submit_result
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Went through the runbook-task-cycle; report spot-checked
- [x] #2 Gates green: pnpm typecheck && pnpm test
- [x] #3 DESIGN.md updated if an external contract (DESIGN §3) changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# THRONG-23: GitHub Copilot CLI as a native harness

Add `copilot` as a built-in harness: agent strings `copilot/<model>[:<effort>]`, launched as `copilot --acp` (the CLI speaks ACP itself, like Gemini and Cursor). Read first: AGENTS.md (code rules), docs/DESIGN.md §3.1, §3.3, §3.4, §4.1, §5, §6, docs/harnesses.md (overview table, Cursor section as the model for the new one), and the Cursor harness as the template for the code: `src/harnesses/cursor.ts`, `src/harnesses/cursor.test.ts`, its rows in `scripts/smoke/smoke.ts`, `package.json` scripts, README and docs.

The branch is stacked on THRONG-28 (installed-only `list_harnesses`, `AdapterSpec.installHint`); build on that shape.

## Facts from the spike (Copilot CLI 1.0.96, 2026-10-12, raw ACP client)

Copilot is closed source; these were read from the live CLI and are the ground truth for the code and the docs.

- `initialize`: `agentInfo {name: 'Copilot', version: '1.0.96'}`; `agentCapabilities.loadSession: true`, `sessionCapabilities: {close, list}` — no `resume`; `mcpCapabilities: {http: true, sse: true}`; `authMethods: [{id: 'copilot-login', …, _meta.terminal-auth: {command: <copilot binary>, args: ['login']}}]`. No `authenticate` call is needed: the CLI uses its own login (`copilot login`) or the GitHub CLI's.
- `session/new` returns `modes` (ids are URLs: `https://agentclientprotocol.com/protocol/session-modes#agent` (current), `…#plan`, `…#autopilot`) and two config options: `mode` (category `mode`, same URL values) and `allow_all` (category `permissions`, select `on | off`, default `off`; "Automatically approve all tool, path, and URL requests").
- Models: with a login that comes only from the GitHub CLI, `session/new` has no `model` config option and no `models` field; the session runs on Copilot's own auto pick (the catalog held one model, `mai-code-1.1-flash`). So every copilot run in that state fails `model_rejected` ("harness exposes no model option") and `list_harnesses` shows `models: []`. With a `copilot login` session the shape was not checked (the maintainer's smoke will). The CLI flag `--reasoning-effort` takes `none | minimal | low | medium | high | xhigh | max`. Do not special-case any of this: the generic selection (option category `model`, else the unstable `models` list; effort via category `thought_level`) applies.
- `session/set_config_option` with an unknown `configId` and `session/set_model` with an unknown model both answer success without doing anything.
- `allow_all=on` via `session/set_config_option`: the response shows `currentValue: 'on'`; a shell command then runs without `request_permission`. Launch flags: `--allow-all` / `--yolo` start the option at `on`; `--allow-all-tools` approves tools without the option showing it.
- Asking: with `allow_all` off, a shell command (`kind: 'execute'`, title written by the model, `rawInput.command`) and a file edit (`kind: 'edit'`, title `Create file`, `rawInput.fileName` + `diff`) send `session/request_permission` with options `allow_once | allow_always | reject_once` (option ids equal the kinds). `reject_once` is honoured: the tool call fails "The user rejected this tool call.", nothing is written.
- `COPILOT_ALLOW_ALL=true` in the environment approves everything silently even after `allow_all` is set `off` (the option still reports `off`); `COPILOT_ALLOW_ALL=false` restores asking.
- Continuation: `session/load {sessionId, cwd, mcpServers}` in a fresh process replays the history (`user_message_chunk`, `tool_call`, `tool_call_update`) before it answers, then the next prompt remembers the earlier turns. A session that never ran a turn cannot be loaded: `-32002` "Resource not found: Session <id> not found" (same as an unknown id) — the Cursor caveat.
- Usage: `PromptResponse.usage {inputTokens, outputTokens, …}`; `usage_update {used, size}` without `cost`. No agent message outside a turn was seen (no `preTurnNoise`).
- MCP: Copilot refuses every stdio MCP server an ACP client passes in `session/new` (its log, `~/.copilot/logs/`: `Rejecting non-http/sse MCP server "throng_result" from client`; with or without a `type` field, under `--yolo` too, versions 1.0.80–1.0.96). The launch flag `--additional-mcp-config <json>` works: `{"mcpServers":{"throng_result":{"type":"local","command":<node>,"args":[...],"tools":["*"]}}}` made the tool available, the model called it and submit-tool wrote the result file. Env entries go in as `"env": {NAME: value}`.
- Under `allow_all` off, the permission request for that MCP tool has `toolCall.title: 'submit_result'`, `kind: 'other'`, `rawInput: {result: …}`, while the `tool_call` update that precedes it for the same `toolCallId` has `title: 'throng_result-submit_result'`.
- After stdin closes the process exits in about 0.9 s. Process command line: the npm bin is a node wrapper that runs the native `…/copilot --acp`.

## What to build

1. **Harness id.** `'copilot'` joins `HARNESS_IDS` in `src/contract.ts` (after `cursor`) and the `HARNESSES` map in `src/harnesses/index.ts`; the config schema follows from `HARNESS_IDS`.
2. **`src/harnesses/copilot.ts`**, shaped like `cursor.ts`:
   - `AdapterSpec`: `id: 'copilot'`, `installHint: 'npm i -g @github/copilot'`, `adapter: 'copilot'`, `args: ['--acp']`, no `harnessBin` (one binary).
   - `mapEffort`: the level itself when the option offers it, else `undefined` (as `claude.ts`).
   - `permissionSetup`: `auto` → `{ configOptions: [{ id: 'allow_all', value: 'on' }] }`; `ask` → `{ env: { COPILOT_ALLOW_ALL: 'false' } }` (allow_all is already off by default; the env value stops an inherited `COPILOT_ALLOW_ALL=true` from turning ask into a silent bypass). No mode is set under either.
   - `continueViaLoad: true`. No `authMethodId`, no `preTurnNoise`.
   - `mcpServerArgs`: see 3.
3. **`HarnessDefinition.mcpServerArgs`** — already added to `src/harnesses/types.ts` and to the interface in DESIGN §4.1 by the main session; do not change its signature or doc comment. Implement it:
   - Copilot: `servers` → `['--additional-mcp-config', JSON.stringify({ mcpServers: { [name]: { type: 'local', command, args, env: {<name>: <value>…}, tools: ['*'] } } })]`, one flag carrying all servers.
   - `src/run.ts`: when the definition has `mcpServerArgs` and the run has MCP servers (today only throng's `throng_result` with a `schema`), append `def.mcpServerArgs(servers)` to the launch args (after `launch.args` and the permission setup's `args`) and pass `mcpServers: []` in the session request, on new and continued turns alike. Without the hook nothing changes. `list_harnesses` probes have no servers and are unaffected.
4. **Recognising throng's own `submit_result`** (DESIGN §5: answered `allow_once` under every setting). Today `isThrongResultCall` in `src/permissions.ts` looks only at the permission request's `toolCall.title`. Make it also accept the title the agent gave the same `toolCallId` in an earlier `tool_call` / `tool_call_update` notification of the same worker (run.ts already sees every update in `onUpdate`). Harness-agnostic; the existing title rule (both `throng_result` and `submit_result` in the title) stays exactly as it is, applied to either title. Both uses follow: the bridge's own-tool `allow_once` and run.ts's progress line that skips it. The plumbing is yours (e.g. run.ts keeps a `toolCallId → title` map and passes the known title to the bridge's `answer`), keep it small.
5. **Tests** (vitest next to the code, fake agent only, no LLM):
   - `src/harnesses/copilot.test.ts` in the manner of `cursor.test.ts`: resolution (adapter on PATH, `harnesses.copilot.command`/`args`/`env` overrides, not installed → `notInstalled` with `copilot not found on PATH; install: npm i -g @github/copilot`), `permissionSetup` for both modes, `mapEffort`, `mcpServerArgs` output (JSON shape, env conversion), and end-to-end runs through `runCall` with the fake agent standing in for `copilot`: auto sets `allow_all=on`; ask leaves it and the adapter process sees `COPILOT_ALLOW_ALL=false`; `send_message` continues through `session/load`; a `schema` run returns `structured` with the submit tool delivered via the launch arg and session/new carrying no MCP servers.
   - Teach `test/fake-agent` what it needs for that, opt-in via its existing env/scenario mechanism so other tests are untouched: an `allow_all` select option (category `permissions`), taking MCP servers from `--additional-mcp-config <json>` when given, and a Copilot-like permission request for submit_result (a `tool_call` update titled `throng_result-submit_result`, then `request_permission` titled `submit_result`). Test that under `harness_mode: ask` + `permission_answers: deny` this request is answered `allow_once` and the structured result arrives; and that a request whose own title and earlier tool_call title both lack the markers is still rejected.
   - `src/list.test.ts` / `src/harnesses/index.test.ts`: copilot appears where the other built-ins do (not listed when absent, `harness_unavailable` with the hint from `run_thronglet`) — extend existing table-driven tests rather than adding parallel ones.
6. **Smoke.** `package.json`: `smoke:copilot` = `node scripts/smoke/smoke.ts copilot/auto`, `smoke:copilot-schema` with `--schema`. `scripts/smoke/smoke.ts`: add `copilot.*--acp` to `ADAPTER_PATTERNS`, and a header comment line that Copilot continues through `session/load` like Cursor. Keep `scripts/smoke/smoke.test.ts` green. docs/development.md: a Copilot block in the smoke section like Cursor's: install (`npm i -g @github/copilot`, `copilot login`), then (1) auto, (2) ask + deny with a shell command (`--no-follow-up` and a prompt that runs a shell command; the run succeeds, the command is refused, the log shows `reject_once`), (3) `smoke:copilot-schema` under ask + deny (structured arrives: submit_result allowed), (4) `list_harnesses` shows copilot's models; note that `copilot/auto` assumes the model option lists `auto` and to pick a model from `list_harnesses` otherwise.
7. **Docs** (concise, in the existing voice; facts only from the spike list above):
   - docs/harnesses.md: a `copilot` column in the overview table (adapter `copilot --acp`; install `npm i -g @github/copilot`; harness on PATH: same binary; auth: its own `copilot login` or the GitHub CLI's login, no `authenticate`; model: option category `model` when offered, none with a GitHub-CLI-only login; effort: `thought_level` if present, otherwise warning; auto: option `allow_all=on`; ask: `allow_all` off + `COPILOT_ALLOW_ALL=false`; send_message: `session/load`; usage: tokens). A "GitHub Copilot CLI" section after Cursor, split like Cursor's into "What you notice" (model_rejected with a GitHub-CLI-only login and `copilot login` as the remedy to try; what auto and ask do; send_message works, with the first-turn caveat; no cost; it loads the user's own Copilot config: skills, MCP servers from `~/.copilot`) and "Over ACP" (the facts above, including the stdio MCP refusal and `--additional-mcp-config`, the two titles of submit_result, `COPILOT_ALLOW_ALL`, silent success of unknown config ids/models, exit time). Version line: "Copilot CLI 1.0.96 (`copilot --acp`), checked 2026-10-12 with a raw ACP client and a login from the GitHub CLI only (THRONG-23)". Do not mention 1.0.81–1.0.82 or github/copilot-cli#4537.
   - docs/DESIGN.md: §1 and §3.1 examples, §3.4 harness id comment, §4 file list (`copilot.ts`), §4.1 prose for `mcpServerArgs` after the `permissionSetup` paragraph (what it is for, that session requests then carry no servers), §5 own-tool recognition sentence (title of the request or the earlier `tool_call` title of the same `toolCallId`), §6 first bullet (the stdio server goes into the session request, or into the launch args for a harness with `mcpServerArgs`).
   - README: supported harnesses line; a Copilot `<details>` install block like Cursor's (`npm i -g @github/copilot`, `copilot login`; throng finds `copilot` on PATH); `harness_mode` list ("Copilot `allow_all`"); example agent string list; the auth troubleshooting list (`copilot login`).
   - docs/configuration.md: the harness id list in the example config comment, the two `harness_mode` bullets, the auth troubleshooting row.
   - skills/throng/SKILL.md: only if it lists harness ids.

## Not to touch

- `backlog/`, `.changeset/` (the main session's).
- The `HarnessDefinition` interface in `src/harnesses/types.ts` and DESIGN §4.1's interface block (done; the contract is the main session's).
- The `isThrongResultCall` title rule itself, other harness definitions, permission semantics of DESIGN §5 beyond the recognition sentence.
- Nothing outside the repo; no global installs. Tests never spawn the real `copilot`.

## Acceptance criteria (from the task)

1. Agent strings `copilot/<model>[:<effort>]` run through Copilot CLI over ACP; list_harnesses shows copilot with models and efforts from the probe.
2. Harness mode auto turns on allow_all (session/set_config_option allow_all=on); harness mode ask leaves it off and launches with COPILOT_ALLOW_ALL=false, and permission_answers apply to Copilot's request_permission.
3. copilot not on PATH → not listed by list_harnesses; run_thronglet on copilot fails with harness_unavailable and the install hint `npm i -g @github/copilot`.
4. Unit tests via test/fake-agent for the wiring; scripts/smoke has a copilot case (the maintainer's real-CLI smoke is outside this run).
5. DESIGN §4.1 table and README updated.
6. run_thronglet with a schema on copilot returns structured: submit_result reaches Copilot through --additional-mcp-config, and under ask throng still answers its own submit_result allow_once although Copilot's permission request titles it only submit_result.

Gates: `pnpm typecheck && pnpm lint && pnpm test` green.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Blocked on github/copilot-cli issue #4537 (ACP never sends request_permission since 1.0.81). Re-check the changelog before starting.

2026-10-12, decision by the maintainer (nodge): unblock with a reduced scope. Upstream github/copilot-cli#4537 is still open (latest CLI 1.0.96, changelog re-checked 2026-10-12): since 1.0.81 the ACP server never sends session/request_permission and approves every tool call itself. Since THRONG-29 permissions are harness_mode (auto|ask) + permission_answers (auto|allow|deny|elicit). The default auto+deny means trust the harness's own auto mode and refuse whatever it asks about; Copilot's auto mode (--allow-all-tools or allow_all=on) approves everything anyway, so under the bug harness_mode auto still behaves as documented. Only harness_mode ask is broken: Copilot never asks, so ask would silently run as a full bypass. So Copilot supports harness_mode auto only; a run whose resolved harness_mode for copilot is ask fails before spawn with harness_unavailable naming github/copilot-cli#4537 and telling the user to set harnesses.copilot.harness_mode: auto. Enabling ask behind a CLI version gate once upstream ships a fix is a follow-up, not part of this task.

Supersedes the earlier 'Blocked on github/copilot-cli issue #4537' note: the task is no longer blocked; it proceeds with the reduced scope above (harness_mode auto only, ask refused before spawn).

2026-10-12, spike on Copilot CLI (raw ACP client, builds pinned with --no-auto-update; shell `touch a.txt` answered reject_once): 1.0.80 asks and the file is not created; 1.0.81 and 1.0.82 never send request_permission and the file is created (github/copilot-cli#4537); 1.0.83, 1.0.84, 1.0.85, 1.0.87, 1.0.89 and 1.0.96 ask and the file is not created. On 1.0.96 file edits ask too, and allow_all=on runs without asking. The bug is fixed since 1.0.83 although #4537 is still open.

2026-10-12, decision by the maintainer (nodge), superseding the reduced-scope decision above: full support. harness_mode ask works on copilot like on the other harnesses: no refusal before spawn, no version gate, no docs mention of 1.0.81-1.0.82.

2026-10-12, scope addition approved by the maintainer (nodge): structured output on copilot. Copilot rejects every stdio MCP server an ACP client passes in session/new (log 'Rejecting non-http/sse MCP server', 1.0.80-1.0.96, also under --yolo), so throng's submit_result goes in through the launch flag --additional-mcp-config instead (checked: the tool runs, the result file is written). Under ask, Copilot's request_permission titles it 'submit_result' while the tool_call update for the same toolCallId says 'throng_result-submit_result', so throng recognises its own tool by that earlier title too.

Runbook run 20261012-throng-23 ended ready. Reviews: Opus 2 findings, Codex 1 (duplicate of Opus a1). Fixed: a1, recognition of throng's submit_result is sticky per toolCallId, so a later tool_call_update retitled to the bare 'submit_result' no longer loses it (fake-agent FAKE_TOOL_RETITLE + test); a2, the Copilot smoke step for schema under ask+deny uses --no-follow-up and a prompt that needs no file edit, so its only expected FAIL is pong.txt. Nothing rejected as not worth it. Spot-checked in src/run.ts (toolTitles), src/permissions.ts (isThrongResultCall with knownTitle), src/harnesses/copilot.ts, docs.

Real-CLI evidence from the main session (Copilot 1.0.96, gh-only login): probeHarness on the copilot definition → ok, version 1.0.96, models [], efforts []; with copilot off PATH → notInstalled, 'copilot not found on PATH; install: npm i -g @github/copilot'. A full run through throng was not possible here: with a gh-only login Copilot exposes no model option, so every run is model_rejected (documented). Pending for the maintainer's smoke (docs/development.md, Copilot block) after 'copilot login': models in list_harnesses, auto, ask + deny, schema under ask + deny.

Gates: pnpm typecheck, lint, test green (30 files, 417 tests). Changeset: .changeset/copilot-harness.md (minor). Branch is stacked on throng-28 (PR #21, still open): rebase onto main once it merges.

2026-10-14: status set to Done by the maintainer (nodge) in the PR #22 review. ACs #1, #4 and #6 stay unchecked: their real-CLI smoke evidence is not recorded in this task.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Copilot CLI is a built-in harness: copilot/<model> launches 'copilot --acp'. harness_mode auto sets allow_all=on; ask leaves it off and launches with COPILOT_ALLOW_ALL=false. send_message continues through session/load. Effort maps to thought_level when offered. A spike on the real CLI found that the request_permission regression (github/copilot-cli#4537) is fixed since 1.0.83, so ask has full support (maintainer's call). It also found that Copilot rejects stdio MCP servers in session/new, so HarnessDefinition gained mcpServerArgs and throng's submit_result goes in through --additional-mcp-config. throng now also recognises its own submit_result by the earlier tool_call title of the same toolCallId. Verified with fake-agent unit tests (417 green) and a real probe of Copilot 1.0.96. Waiting on the maintainer's smoke with a copilot login (models, auto, ask+deny, schema).
<!-- SECTION:FINAL_SUMMARY:END -->
