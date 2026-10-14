---
id: THRONG-33
title: 'Recognise throng''s own submit_result by exact title, kind and rawInput shape'
status: Review
assignee:
  - '@nodge'
created_date: '2026-10-14 19:48'
updated_date: '2026-10-14 20:01'
labels: []
milestone: m-3
dependencies: []
priority: high
type: bug
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
DESIGN §5 answers a request_permission for throng's own submit_result allow_once under every setting. `isThrongResultCall` (src/permissions.ts) recognises it when the request title, or the title an earlier tool_call / tool_call_update gave the same toolCallId (src/run.ts `toolTitles`, added in THRONG-23), contains the substrings `throng_result` and `submit_result`. Several harnesses put model-written text into those titles: the shell request title is the command verbatim on Claude (claude-agent-acp 0.86.0), OpenCode 1.18.34 (also its `external_directory` request, kind other) and Gemini 0.61–0.63 (also its edit/write titles); Copilot 1.0.96 shell titles are written by the model; codex-acp 2.1.1 titles the command tool_call with the command text. So a model under harness_mode ask + permission_answers deny or elicit (e.g. steered by prompt injection in repo content) can run `echo throng_result submit_result; <anything>` and get it auto-approved, with no human asked under elicit. Shipped in 0.7.0. Investigation 2026-10-13 read the adapter sources, no real-harness runs. Facts per harness (submit request title / kind / rawInput): claude `mcp__throng_result__submit_result` / other / {result}; codex 2.1.1 no title / execute / none, earlier tool_call `mcp.throng_result.submit_result`; opencode `throng_result_submit_result` / other / {}; cursor `throng_result-submit_result: submit_result` / other / null; copilot `submit_result` / other / {result}, earlier tool_call `throng_result-submit_result`; gemini 0.61 `submit_result (throng_result MCP Server)` / other / none; gemini 0.62+ `submit_result(result: <full result>)` / other / none (no server name, cannot be told apart from other kind-other tools whose title the model writes, so it stays unrecognised). Shell requests carry kind execute everywhere and rawInput.command where rawInput exists.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A permission request whose title or earlier tool_call title contains `throng_result` and `submit_result` only as part of model-written text (shell command, Copilot shell description, OpenCode external_directory, Gemini edit/write title) is not auto-allowed: it goes to permission_answers
- [x] #2 throng's submit_result is still auto-allowed under every setting for the request shapes of claude, codex 2.1.1, opencode, cursor, copilot and gemini 0.61 listed in the description
- [x] #3 A request that names submit_result but is not recognised is logged as a warning (title, kind), so a changed adapter format is diagnosable; the answer is unchanged
- [x] #4 Unit tests cover each harness's real submit shape and spoof cases per harness (shell with matching title, exact-form shell title, Copilot shell retitled, codex command whose tool_call title names the tool); the fake agent's codex-like submit request follows codex-acp 2.1.1 (tool_call titled `mcp.throng_result.submit_result`, then a request without title, kind execute)
- [x] #5 DESIGN §5 recognition sentence and docs/harnesses.md updated: adapter versions read, submit request shape per harness, Gemini 0.62+ submit not recognised under ask
- [ ] #6 Maintainer smoke: run_thronglet with a schema under harness_mode ask + permission_answers deny returns structured on claude, codex, opencode, cursor and copilot
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Went through the runbook-task-cycle; report spot-checked
- [x] #2 Gates green: pnpm typecheck && pnpm test
- [x] #3 DESIGN.md updated if an external contract (DESIGN §3) changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# THRONG-33: recognise throng's own submit_result by exact title, kind and rawInput shape

## Why

DESIGN §5: a `session/request_permission` for throng's own `submit_result` (§6) is answered `allow_once` under every permission setting, before `permission_answers` apply. Today `isThrongResultCall` in `src/permissions.ts` recognises it when the request's `toolCall.title`, or the title an earlier `tool_call` / `tool_call_update` gave the same `toolCallId` (`toolTitles` in `src/run.ts`, passed as `knownTitle`), contains the substrings `throng_result` and `submit_result`.

Several harnesses put model-written text into those titles, so under `harness_mode: ask` + `permission_answers: deny` (or `elicit`, where the human is skipped) a model can run `echo throng_result submit_result; <anything>` and get it auto-approved. This is a security fix.

## Facts per harness (read from adapter sources on 2026-10-13, no real runs)

Request for throng's submit tool (`title` / `kind` / `rawInput`):

| harness | submit request | earlier `tool_call` title for the same id |
|---|---|---|
| claude (claude-agent-acp 0.86.0) | `mcp__throng_result__submit_result` / `other` / `{result}` | same |
| codex (codex-acp 2.1.1) | **no title** / `execute` / **none** | `mcp.throng_result.submit_result` (kind `execute`, rawInput `{server, tool, arguments}`) |
| opencode (1.18.34) | `throng_result_submit_result` / `other` / `{}` | same |
| cursor (2026.10.01) | `throng_result-submit_result: submit_result` / `other` / `null` | — |
| copilot (1.0.96) | `submit_result` / `other` / `{result}` | `throng_result-submit_result` |
| gemini 0.61 | `submit_result (throng_result MCP Server)` / `other` / none | same |
| gemini 0.62+ | `submit_result(result: <full result text>)` / `other` / none | same |

Requests the model can shape:
- Shell requests have kind `execute` on every harness. Their title is the command verbatim on claude, opencode, gemini (and probably cursor); written by the model on copilot. rawInput carries `command` on claude (`{command, description?, …}`), codex (`{command, cwd}`), opencode (`{command}`), copilot (`{command}`); gemini never sends rawInput; cursor's is not recorded.
- codex: a command approval request has a fixed title (`Run command`, `Read file`, …), but its `tool_call` for the same id is titled with the command text.
- opencode: a command touching directories outside the workspace first sends an `external_directory` request: title = the command, kind `other`, rawInput `{command, directories, patterns}`.
- gemini: edit/write request titles contain model text (path, first 30 chars of old/new strings), kind `edit`, no rawInput.
- gemini 0.62+'s submit title has no server name and embeds the result text; it cannot be told apart from another kind-`other` tool whose title the model writes. It stays unrecognised (decided by the maintainer's session: fails closed; users run schema on gemini under `harness_mode: auto`).

## What to change

1. `src/permissions.ts`: replace the substring rule. A request is throng's submit when all hold:
   - `rawInput` is `undefined`/`null`, or a plain object (not an array) whose keys are all `result` (an empty object passes);
   - and either
     - the request's own `title` is one of the exact forms below and its `kind` is not `execute`; or
     - the request's own `title` is absent or exactly `submit_result`, and `knownTitle` is one of the exact forms (kind not checked on this path: codex sends `execute`).
   - Exact forms, one per harness, each with a short comment naming the harness: `mcp__throng_result__submit_result` (claude), `mcp.throng_result.submit_result` (codex, via the earlier tool_call), `throng_result_submit_result` (opencode), `throng_result-submit_result: submit_result` (cursor), `throng_result-submit_result` (copilot, via the earlier tool_call), `submit_result (throng_result MCP Server)` (gemini ≤ 0.61).
   - Keep `isThrongResultCall(toolCall, knownTitle?)` as the entry point (run.ts uses it for the progress line and the bridge uses it in `allowOwnTool`). The sticky rule in `run.ts` `onUpdate` ("once a title marks the call as ours, later titles don't replace it") must test the known title alone against the exact forms; expose a small helper for that rather than calling `isThrongResultCall` with a fake toolCall if that reads cleaner. Update the doc comments on `toolTitles`, `isThrongResultCall` and anything else that describes the old substring rule.
2. Diagnostics: when a request is not recognised but its own title or `knownTitle` contains `submit_result`, `log.warn` once per request with title, known title and kind (e.g. `'permission request names submit_result but does not match throng_result's known forms; permission_answers decide'`). It changes nothing about the answer. This is the server log (`src/log.ts`), not the run's `warnings`.
3. Tests (vitest, next to the code, no LLMs):
   - `src/permissions.test.ts`: each harness's real submit shape from the table above is recognised (gemini 0.62+ is not); spoof cases are rejected: claude Bash `{title: 'echo throng_result submit_result; rm -rf x', kind: 'execute', rawInput: {command: …}}`, claude Bash whose command is exactly `mcp__throng_result__submit_result`, opencode `external_directory` (kind `other`, title = command containing both words, rawInput `{command, directories, patterns}`), gemini shell with title exactly `submit_result (throng_result MCP Server)` and kind `execute` and no rawInput, gemini edit title containing both words (kind `edit`, no rawInput), cursor shell with title exactly the cursor form and kind `execute`, copilot shell whose request title and known title are model text (kind `execute`, rawInput `{command}`) including known title exactly `throng_result-submit_result`, codex command request (title `Run command`, kind `execute`, rawInput `{command, cwd}`) whose known title is `echo mcp.throng_result.submit_result`. Update the existing substring tests to the new rule. Test the warn log fires for an unrecognised request naming `submit_result` and not for an unrelated one.
   - `test/fake-agent`: the generic (non-copilot) `submit-ask` request follows codex-acp 2.1.1: a `tool_call` for `t3` titled `mcp.throng_result.submit_result`, kind `execute`, rawInput `{server: 'throng_result', tool: 'submit_result', arguments: {…}}`, then `request_permission` for `t3` with `kind: 'execute'`, `status: 'pending'`, no title, no rawInput. Update the comment in `test/fake-agent/index.ts` describing scenarios. Existing tests using `submit-ask` (`src/run.test.ts`, others found by grep) must still pass.
   - One end-to-end spoof through the fake agent under `deny_all` (ask + deny): a shell request whose titles name throng's tool is rejected, e.g. extend the copilot `copilot-permission` scenario with an opt-in env (same mechanism as `FAKE_TOOL_TITLE`) to set its shell `tool_call`/request title, and assert the run sees the rejection. Keep new fake-agent knobs opt-in so other tests are untouched.
4. Docs:
   - `docs/DESIGN.md` §5: the recognition sentence ("It is recognised by its title, or by the title an earlier …") becomes the new rule in one or two sentences: exact per-harness forms of the request title (kind not `execute`) or, for a request without a title or titled only `submit_result`, of the earlier `tool_call` title; rawInput absent or only `result`; anything else goes to `permission_answers` and is logged.
   - `docs/harnesses.md`: per harness section, one line with the permission request shape of throng's submit tool from the table (Copilot and Cursor already have one; check and align). Note in the Gemini section that from 0.62 the submit request title is `submit_result(result: …)` with no server name, so under `harness_mode: ask` throng does not recognise it and `permission_answers` decide; use `harness_mode: auto` for runs with a schema. Where a section names an adapter version that is older than the one these facts were read from (claude-agent-acp 0.86.0, codex-acp 2.1.1), say the submit-request facts were read from that version's source on 2026-10-13; don't restate other facts.

## Do not touch

- DESIGN §3 contracts (tool input/output, `ErrorCode`), `HarnessDefinition`, the Worker interface, harness definitions in `src/harnesses/*.ts`.
- Permission semantics beyond recognition: `deciderFor`, elicitation, `allow_once`-only, `cancelAll`.
- `backlog/`, `.changeset/`, README.

## Acceptance criteria (from the task)

1. A permission request whose title or earlier tool_call title contains `throng_result` and `submit_result` only as part of model-written text (shell command, Copilot shell description, OpenCode external_directory, Gemini edit/write title) is not auto-allowed: it goes to permission_answers.
2. throng's submit_result is still auto-allowed under every setting for the request shapes of claude, codex 2.1.1, opencode, cursor, copilot and gemini 0.61 listed above.
3. A request that names submit_result but is not recognised is logged as a warning (title, kind); the answer is unchanged.
4. Unit tests cover each harness's real submit shape and the spoof cases; the fake agent's codex-like submit request follows codex-acp 2.1.1.
5. DESIGN §5 recognition sentence and docs/harnesses.md updated.
6. (Maintainer smoke, outside the run.)

Gates: `pnpm typecheck && pnpm lint && pnpm test`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Runbook run 20261014-throng-33 ended ready: Opus coder, checks green, Opus review 0 findings, Codex review 0 findings, polish (comments/docs wording only). Spot-checked by the main session: src/permissions.ts THRONG_RESULT_TITLES (six exact forms), isSubmitInput (absent/null or keys only `result`), isThrongResultCall (own title exact + kind not execute; known title only when the request has no title or `submit_result`), warn in allowOwnTool; run.ts sticky rule now isThrongResultTitle(known). Tests: it.each over each harness submit shape and spoofs (claude Bash with both words and exact form, opencode external_directory, gemini shell exact form and edit title, cursor shell exact form, copilot shell with known title exact, codex command with command tool_call title), gemini 0.62+ not recognised, warn log; fake-agent submit-ask now codex-acp 2.1.1 shape; copilot e2e spoof under deny_all rejected + warned. Gates re-run by the main session: typecheck 0, lint 0, vitest 438/438. DESIGN §5 sentence and docs/harnesses.md per-harness submit request lines updated. Changeset .changeset/submit-result-exact-titles.md (patch). AC #6 waits on the maintainer smoke: schema under ask + deny on claude, codex, opencode, cursor, copilot.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
throng recognises its own submit_result permission request by exact per-harness titles (own title with kind other than execute, or the earlier tool_call title for a request without a title or titled submit_result) and rawInput absent or only `result`, instead of two substrings anywhere in the title. Closes the auto-approval of model-written shell/edit requests under harness_mode ask (claude, codex, opencode, gemini, cursor, copilot); unrecognised requests naming submit_result are logged. Gemini 0.62+ submit stays unrecognised under ask (documented). Verified with unit and fake-agent tests (vitest 438/438), typecheck and lint; real-harness smoke pending (AC #6).
<!-- SECTION:FINAL_SUMMARY:END -->
