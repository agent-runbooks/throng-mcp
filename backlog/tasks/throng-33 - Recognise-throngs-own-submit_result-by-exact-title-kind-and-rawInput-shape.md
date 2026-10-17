---
id: THRONG-33
title: 'Structured output from the final message, without the throng_result MCP server'
status: Review
assignee:
  - '@nodge'
created_date: '2026-10-14 19:48'
updated_date: '2026-10-17 11:34'
labels: []
milestone: m-3
dependencies: []
priority: high
type: bug
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Structured output (DESIGN §6) went through a stdio MCP server `throng_result` with one tool, `submit_result`, and throng answered its permission request `allow_once` under every setting. Recognising that request had to rely on titles, which several harnesses fill with model-written text: the shell request title is the command on Claude, OpenCode and Gemini, a model-written description on Copilot, and the command text sits on the Codex `tool_call`. Under `harness_mode: ask` + `permission_answers: deny` (or `elicit`) a model could run `echo throng_result submit_result; <anything>` and get it auto-approved (shipped in 0.7.0). The first fix on this branch matched exact per-harness title forms, which still depends on each adapter's presentation, cannot recognise Gemini CLI 0.62+ (no server name in the title), misses custom harnesses and needs Copilot-specific launch args (`mcpServerArgs`). The maintainer (nodge, 2026-10-17) chose to take the result from the agent's final message instead: the prompt carries the schema and asks for the final message as JSON, throng parses and validates it with ajv, and the existing corrective prompts handle a missing or invalid result. No MCP server, no tool, no permission request, so throng auto-approves nothing. Decision record: decision-11.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 With `schema`, the prompt asks for the final message as one JSON value matching the schema and carries the schema verbatim; no MCP server is passed to the harness (session requests carry `mcpServers: []`, no launch args for it)
- [x] #2 The result is taken from the final message of the turn (text after the last tool call): the whole message as JSON, else its last fenced code block; it is validated with ajv as before and returned as `structured` without `text`
- [x] #3 No JSON in the final message → corrective prompt, after 2 `structured_missing`; JSON that fails the schema → corrective prompt with the ajv errors, after 2 `structured_invalid`; both failures carry `text` and `session_id` as before
- [x] #4 throng answers no permission request on its own: every request goes to permission_answers (the submit_result recognition, its title tracking and `HarnessDefinition.mcpServerArgs` are gone)
- [x] #5 submit-tool and its build entry are removed; the package still runs a `schema` run on the fake agent from the unpacked tarball (scripts/pack.test.ts)
- [x] #6 Tests through the fake agent cover: valid JSON, fenced JSON after narration, narration before a tool call ignored, invalid then valid after a corrective prompt, never valid → structured_missing / structured_invalid, under ask + deny with no permission request involved
- [x] #7 DESIGN (§3 empty_result comment, §4.1, §5, §6, §9 layout and build), docs/harnesses.md, docs/configuration.md, docs/development.md (smoke), skills/throng/SKILL.md and README describe the new mechanism
- [ ] #8 Maintainer smoke: run_thronglet with a schema returns structured on claude, codex, opencode, gemini, cursor and copilot, under harness_mode ask + permission_answers deny
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Went through the runbook-task-cycle; report spot-checked
- [x] #2 Gates green: pnpm typecheck && pnpm test
- [x] #3 DESIGN.md updated if an external contract (DESIGN §3) changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# THRONG-33 (rescoped): structured output from the final message, without the throng_result MCP server

## Why

Structured output (DESIGN §6) has gone through a stdio MCP server `throng_result` (`src/structured/submit-tool.ts`) with one tool, `submit_result`. throng answers its permission request `allow_once` under every setting, recognised by the request title (the first commits on this branch match exact per-harness title forms in `src/permissions.ts`). Titles carry model-written text on several harnesses, so that recognition can be spoofed, and it can't cover Gemini CLI 0.62+ or custom harnesses. The maintainer decided (backlog decision-11): take the result from the agent's final message and drop the MCP server entirely. throng then auto-approves no permission request at all.

The branch `throng-33` already holds the exact-title work (commits 37ad5b0..d0c572d). This task removes it along with the submit tool. Don't keep any of it "just in case".

## The new mechanism (DESIGN §6, to be rewritten)

1. **Prompt.** `buildPrompt(task, schema?)` in `src/prompt.ts`: with a schema, after the task append a result-format paragraph and the schema verbatim, pretty-printed (`JSON.stringify(schema, null, 2)`). Wording, roughly:
   "Result format: end the turn with a final message that is only one JSON value matching the JSON Schema below. No text before or after it, though a ```json fence around it is fine. That JSON, not your prose, is returned to the caller."
   Then the schema. Keep `EXECUTOR_PREFIX` as is.
2. **Final message.** The text of the turn after its last `tool_call`. Add this to `Collector` (`src/acp/collector.ts`), e.g. a `finalText` getter: reset on every `tool_call` update inside a turn and on `startTurn`, appended to like `text`. `text` keeps meaning the whole turn's agent text. It is still what failures and non-schema runs return.
3. **Parse** (new function in `src/structured/validate.ts`, unit-tested there):
   - the trimmed final message parses as JSON: that value;
   - otherwise, the content of its **last** fenced code block (```` ``` ```` with any info string, e.g. `json`), if that parses: that value;
   - otherwise: no result.

   Return a discriminated union, e.g. `{ kind: 'ok', result } | { kind: 'missing' } | { kind: 'invalid', errors: string }`. `invalid` means the JSON parsed but ajv rejected it. Reuse the existing ajv compile and dialect logic (`compileSchema`, the error formatting submit-tool used) and keep their tests. Delete what only the tool needed: `toolInputSchema`, `SubmitState`, `$defs` hoisting if nothing else uses it.
4. **Corrective prompts** (`buildCorrectivePrompt` in `src/prompt.ts`), same loop and `MAX_CORRECTIVE_PROMPTS = 2` in `src/run.ts`, same stop reasons:
   - missing: "Your final message was not a JSON value. Reply with only the JSON value matching the JSON Schema from the task."
   - invalid: "Your JSON does not match the schema: <ajv errors>. Reply with only the corrected JSON value."

   After the last corrective turn: `structured_missing` ("agent's final message held no JSON after 2 corrective prompts") or `structured_invalid` ("last result does not match the schema: <errors>"). Both carry `text` and `session_id` exactly as today.
5. **Success:** payload `structured` = the value, no `text`. Today's rule stays: a turn with a valid result is never `empty_result`. A turn with no agent text and a schema is `missing`, so it gets a corrective prompt.
6. Applies to `run_thronglet` and to `send_message` turns with their own `schema`, as today.

## What to remove

- `src/structured/submit-tool.ts` and `submit-tool.test.ts`. `RunContext.submitTool` and its plumbing: `src/mcp.ts`, `src/mcp/tools.ts`, `test/fake-harness.ts`. The second tsdown entry in `tsdown.config.ts` and its comment. `readSubmitState`, the per-run temp dir (`structuredDir`, schema.json, result.json) and its cleanup in `src/run.ts`, unless something else still needs a temp dir (it shouldn't).
- Injecting MCP servers: session requests send `mcpServers: []`.
- `HarnessDefinition.mcpServerArgs` (`src/harnesses/types.ts`), Copilot's implementation (`src/harnesses/copilot.ts`) and the `serverArgs` / `sessionServers` logic in `run.ts`. The Copilot `allow_all` / `COPILOT_ALLOW_ALL` handling stays.
- In `src/permissions.ts`: `THRONG_RESULT_TITLES`, `isThrongResultTitle`, `isSubmitInput`, `isThrongResultCall`, `allowOwnTool`, the warn log, and the `knownTitle` parameter of `PermissionBridge.answer`. The bridge answers every request through `decide`, except the existing aborted → `cancelled` path. In `src/run.ts`: `toolTitles` and its upkeep. The progress line `permission: <title>` is now shown for every request when `toHuman`.
- Fake agent (`test/fake-agent/agent.ts`, `index.ts`): the throng_result MCP client, `submit()`, reading servers from `--additional-mcp-config` (only throng_result used it), and scenarios `submit-*`, `copilot-submit-*`, plus the `FAKE_TOOL_TITLE` / `FAKE_TOOL_RETITLE` knobs if nothing else uses them. Replace them with final-message scenarios, opt-in like the others. Suggested names: `json-valid`, `json-fenced` (narration, then a fenced block), `json-after-tool` (text, a `tool_call`, then the JSON as the final message, so the earlier text must be ignored), `json-invalid-then-valid` (schema-invalid JSON, then valid on the next prompt), `json-missing` (prose only, every turn), `json-invalid-always`. Keep `FAKE_SUBMIT` (renamed if you like) as the override of the valid value, since the smoke-like tests and `scripts/pack.test.ts` use `{file, content}`-shaped values. Update the scenario comment block in `index.ts`. The `FakeCall` log's `mcpServers` field can stay, and tests should assert it is empty for schema runs.

## Tests

vitest, next to the code, no LLMs. Update or replace every test that used the removed scenarios (`src/run.test.ts`, `src/harnesses/copilot.test.ts`, `scripts/pack.test.ts`, `scripts/smoke/smoke.test.ts`, others found by grep). Cover:
- parse: whole-message JSON, fenced, last of several fences, prose without JSON, broken JSON, JSON plus trailing prose (missing), schema errors;
- run level: valid result → `structured` without `text`;
- run level: JSON after a tool call with earlier narration;
- run level: invalid then valid within the corrective budget;
- run level: never valid → `structured_missing` / `structured_invalid` with `text`, `session_id` and usage summed over turns, as the existing tests check;
- run level: schema runs pass no MCP servers;
- a schema run under `ask` + `deny` (e.g. Copilot `deny_all`) returns `structured` with no permission request;
- a permission request titled like the old tool (`mcp__throng_result__submit_result`, kind `other`, rawInput `{result}`) is now rejected under deny: the bridge approves nothing by itself;
- `scripts/pack.test.ts` still runs a `schema` run from the unpacked tarball on the fake agent, and the tarball no longer contains `dist/structured/submit-tool.js`;
- the prompt builder: the schema verbatim in the prompt, the corrective prompt texts.

## Docs

- `docs/DESIGN.md`:
  - §3 `empty_result` comment: "without a structured result" instead of "without submit_result".
  - §4 file list: drop `submit-tool.ts`, describe `prompt.ts` and `validate.ts` truthfully.
  - §4.1: remove `mcpServerArgs` from the `HarnessDefinition` listing and its prose paragraph.
  - §5: replace the `submit_result` recognition paragraph with one sentence: throng approves no request by itself, every request goes to the answers.
  - §6: rewrite to the mechanism above, keeping the ajv dialect paragraph.
  - §9: one tsdown entry, no submit tool path, pack test wording.
  - Fake-agent scenario list at §9.
  - Anything else `grep -n "submit\|throng_result\|mcpServerArgs" docs/DESIGN.md` finds.
- `docs/harnesses.md`:
  - remove the per-harness "permission request for throng's submit tool" lines added on this branch;
  - Copilot: keep the fact that it refuses stdio MCP servers from `session/new` and that `--additional-mcp-config` works, but drop throng's use of it and the "two titles" bullet;
  - Cursor: keep "MCP stdio servers from `session/new` work" without the submit-title clause;
  - Gemini: drop the 0.62+ note about `harness_mode: auto` for schema runs;
  - the trust paragraph's mention of submit_result can go.
- `docs/configuration.md` line ~126: remove the `submit_result` sentence. Optionally say structured output involves no permission request. Line ~137: drop "throng's `submit_result` included".
- `docs/development.md`:
  - build section: one entry, no submit tool path;
  - smoke: orphan list without `submit-tool`;
  - the Copilot ask + deny schema step (~line 140): now expects `structured` with no permission request for it.
- `scripts/smoke/smoke.ts`: drop the submit-tool orphan pattern and its comment. The schema prompt must not tell the agent to "submit". It asks for the result as described by the schema.
- `skills/throng/SKILL.md` "Structured output": the schema goes into the prompt and the agent's final message must be JSON matching it. The prompt still need not repeat the schema. Keep the corrective-prompt and error-code text accurate.
- README: check the structured-output mentions still read right.
- `src/harnesses/gemini.ts` comment about trust mentions submit_result: reword. Trust is still needed for `yolo`.
- Prose style: no semicolons in prose you write (docs, comments, prompts, messages). Use separate sentences.

## Do not touch

- DESIGN §3 tool input/output shapes and `ErrorCode` values. `schema`, `structured`, `structured_missing` and `structured_invalid` stay as they are, only their descriptions change.
- Permission semantics other than removing the own-tool path: `deciderFor`, elicitation, `allow_once`-only, `cancelAll`.
- Harness definitions other than Copilot's `mcpServerArgs` removal.
- `backlog/`, `.changeset/`, `CHANGELOG.md`.

## Acceptance criteria (from the task)

1. With `schema`, the prompt asks for the final message as one JSON value matching the schema and carries the schema verbatim. No MCP server is passed to the harness (session requests carry `mcpServers: []`, and there are no launch args for one).
2. The result is taken from the final message of the turn (text after the last tool call): the whole message as JSON, else its last fenced code block. It is validated with ajv as before and returned as `structured` without `text`.
3. No JSON in the final message → corrective prompt, after 2 `structured_missing`. JSON that fails the schema → corrective prompt with the ajv errors, after 2 `structured_invalid`. Both failures carry `text` and `session_id` as before.
4. throng answers no permission request on its own: every request goes to `permission_answers`. The `submit_result` recognition, its title tracking and `HarnessDefinition.mcpServerArgs` are gone.
5. submit-tool and its build entry are removed. The package still runs a `schema` run on the fake agent from the unpacked tarball (`scripts/pack.test.ts`).
6. Tests through the fake agent cover: valid JSON, fenced JSON after narration, narration before a tool call ignored, invalid then valid after a corrective prompt, never valid → `structured_missing` / `structured_invalid`, and a run under `ask` + `deny` with no permission request involved.
7. DESIGN (§3 `empty_result` comment, §4.1, §5, §6, §9 layout and build), `docs/harnesses.md`, `docs/configuration.md`, `docs/development.md` (smoke), `skills/throng/SKILL.md` and README describe the new mechanism.
8. (Maintainer smoke, outside the run.)

Gates: `pnpm typecheck && pnpm lint && pnpm test`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Runbook run 20261014-throng-33 ended ready: Opus coder, checks green, Opus review 0 findings, Codex review 0 findings, polish (comments/docs wording only). Spot-checked by the main session: src/permissions.ts THRONG_RESULT_TITLES (six exact forms), isSubmitInput (absent/null or keys only `result`), isThrongResultCall (own title exact + kind not execute; known title only when the request has no title or `submit_result`), warn in allowOwnTool; run.ts sticky rule now isThrongResultTitle(known). Tests: it.each over each harness submit shape and spoofs (claude Bash with both words and exact form, opencode external_directory, gemini shell exact form and edit title, cursor shell exact form, copilot shell with known title exact, codex command with command tool_call title), gemini 0.62+ not recognised, warn log; fake-agent submit-ask now codex-acp 2.1.1 shape; copilot e2e spoof under deny_all rejected + warned. Gates re-run by the main session: typecheck 0, lint 0, vitest 438/438. DESIGN §5 sentence and docs/harnesses.md per-harness submit request lines updated. Changeset .changeset/submit-result-exact-titles.md (patch). AC #6 waits on the maintainer smoke: schema under ask + deny on claude, codex, opencode, cursor, copilot.

Code review (xhigh) on the branch, 2026-10-17: fixed the warn text (title, kind or input differ) and added input_keys to it; docs/configuration.md no longer says submit_result is allowed under every setting (names the harnesses, Gemini 0.62+ and custom harnesses go to permission_answers); changeset wording limited to confirmed exposure; copilot spoof test mocks log.warn. Left for the maintainer: an extra key next to `result` makes a real submit unrecognised (schema has no additionalProperties:false); Gemini 0.61 form forgeable through a user MCP tool with a `command` argument; codex standalone approval (two parallel submits) not recognised; codex-acp 1.x request shape unverified. Gates: typecheck 0, lint 0, vitest 438/438.

2026-10-17: moved to Done by the maintainer (nodge). AC #6 (maintainer smoke) left unchecked: no smoke result recorded in this session.

2026-10-17: scope changed by the maintainer (nodge): drop the throng_result MCP server, take the structured result from the final message (decision-11). The exact-title recognition from the first commits on this branch is removed by this work. Reopened In Progress.

Runbook run 20261017-throng-33 ended ready. Opus coder. Reviews: Opus 2 findings, Codex 1. Triage marked 3 to fix: b1 an empty fenced block broke the choice of the last block (regex now lets the closing fence start a line, two literal repro tests), a1 the send_message schema test did not check session/resume (fake agent logs resume servers, test asserts mcpServers: []), a2 DESIGN §4.2 resume params. Round 2 fixed a stale FakeCall comment (v1). Polish touched comments and test titles only. Spot-checked by the main session: run.ts reads parseResult(collector.finalText) per turn, both corrective branches and error texts, mcpServers: [] on new and resume, onPermission without own-tool path. permissions.ts has no own-tool recognition left. submit-tool.ts and its test are deleted, and tsdown has one entry. DESIGN §6 and the skill text match the code. The only remaining throng_result mentions are regression tests that a request shaped like the old tool now goes to the answers. Gates re-run: typecheck 0, lint 0, vitest 416/416. Changeset replaced: .changeset/structured-from-final-message.md (minor). AC #8 waits on the maintainer smoke.

Smoke by the main session, 2026-10-17, on the branch (adapters: claude-agent-acp 0.91.0, codex-acp 2.2.2, opencode 1.19.2). codex/gpt-6-luna --schema under auto: PASS structured {file: pong.txt, content: pong}, PASS pong.txt, PASS send_message, no corrective prompt. codex under deny_all with a prompt that writes no file: PASS structured, no permission request, no corrective prompt (FAIL pong.txt expected). opencode/openrouter/z-ai/glm-5.3-flash: the same two runs, the same results. claude not run: the adapter answered "OAuth token revoked. Please log in again", which needs the maintainer's login. gemini, cursor and copilot are not installed on this machine. AC #8 still open for claude, gemini, cursor and copilot.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Structured output takes the result from the agent's final message (text after the last tool call: the whole message as JSON, else its last fenced block), validated with ajv, with the same two corrective prompts and structured_missing / structured_invalid. The throng_result MCP server, submit-tool, its build entry, RunContext.submitTool, HarnessDefinition.mcpServerArgs and the own-tool permission recognition are gone, so throng approves no permission request by itself (decision-11). This closes the 0.7.0 hole where a shell command naming submit_result was auto-approved under ask + deny, and structured output now works on Gemini 0.62+ and custom harnesses. Verified with unit and fake-agent tests (vitest 416/416, pack test runs a schema run from the tarball), typecheck and lint. Real-harness smoke pending (AC #8).
<!-- SECTION:FINAL_SUMMARY:END -->
