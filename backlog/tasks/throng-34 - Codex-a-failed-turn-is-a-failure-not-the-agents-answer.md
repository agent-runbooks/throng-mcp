---
id: THRONG-34
title: >-
  Codex failed turns: no AIR opt-in; corrective prompt finishes the task first;
  login errors are harness_unavailable
status: Done
assignee:
  - '@nodge'
created_date: '2026-10-21 09:49'
updated_date: '2026-10-21 17:24'
labels: []
milestone: m-3
dependencies: []
priority: high
type: bug
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
codex-acp 2.2.2 reports a backend error of the turn (e.g. "model 'gpt-6.1-sol' is not enabled in rustponsesapi") as plain agent text and ends the turn with end_turn. On 2026-10-06 a codex run returned the error text as a successful result (stop_reason end_turn, usage {}), and a schema run sent a corrective prompt after it: the backend had recovered by then, and the model answered with a 'failed' result without doing the task. Typed failures exist only in codex-acp's experimental JetBrains AIR sessionFailure extension. A first version of this task opted into it (verified live); the maintainer rejected that (decision-12): the failed-turn signal is to come from codex-acp upstream (reject session/prompt with a JSON-RPC error for a non-AIR client). This task ships what does not depend on AIR. Found while going through the coder agent's friction log (nodge, 2026-10-19).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 throng declares no AIR or other client-specific _meta in initialize; clientCapabilities are unchanged for every harness
- [x] #2 The corrective prompt for a missing structured result tells the agent to finish the task first if it has not, then reply with the JSON
- [x] #3 An Authentication required error (ACP code -32000) at any handshake step fails with harness_unavailable, ahead of the resume/load → session_not_found mapping; for codex the message ends '; log in: codex login'
- [x] #4 Tests cover the above through the fake agent; DESIGN.md (§3.2, §4.2, §6), docs/harnesses.md (codex: failed turns as text, why no AIR), user docs and the skill describe the behaviour; decision-12 records the AIR decision
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Went through the runbook-task-cycle; report spot-checked
- [x] #2 Gates green: pnpm typecheck && pnpm test
- [x] #3 DESIGN.md updated if an external contract (DESIGN §3) changed
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# THRONG-34 — Codex: a failed turn is a failure, not the agent's answer

Repo: the worktree passed as `repo`. Runs as `node src/mcp.ts`, no build: erasable TS only, imports with `.ts`. Tests are vitest next to the code; no LLM calls, everything through `test/fake-agent`. Gates: `pnpm typecheck && pnpm lint && pnpm test`. Don't touch `backlog/` or `.changeset/`.

## Problem
codex-acp 2.2.2 (`~/.global-npm/node_modules/@agentclientprotocol/codex-acp/dist/index.js`) reports a backend error of a turn (e.g. "model 'gpt-6.1-sol' is not enabled in rustponsesapi") as plain `agent_message_chunk` text and ends the turn with `end_turn` (`:31768-31778`), so throng returns the error as the agent's answer, or with a schema sends a corrective prompt after it. When the client declares `initialize.clientCapabilities._meta = {jetbrains: {air: {version: 1, capabilities: ['sessionFailure']}}}` (gate at `:28085-28092`, `:42300`), codex-acp instead:
- ends a failed turn with `PromptResponse { stopReason: 'end_turn', _meta: { quota: …, jetbrains: { air: { version: 1, sessionFailure: F } } } }` (`terminalFailurePromptResponse`, `:45351`), no agent text for the error;
- sends retry warnings, config/deprecation warnings and errors of other turns / after the prompt as `session_info_update` with `_meta.jetbrains.air.sessionFailure = F` (`createSessionFailureUpdate`, `:31871`; `handleSessionScopedNotification`, `:31130`).
`F = { id: string, revision: number, category: string, severity: 'error' | 'warning', title: string, details?: string, actions: string[] }`. One id is reused across revisions (a retry warning "Reconnecting… 1/5", "2/5", … then possibly the terminal error).

## Already done by the main session (contracts; don't change their shape)
- `HarnessDefinition.clientCapabilitiesMeta?` and `HarnessDefinition.loginHint?` (`src/harnesses/types.ts`); codex sets both (`src/harnesses/codex.ts`).
- `WorkerSpawn.clientCapabilitiesMeta?` and `WorkerSpawn.loginHint?` (`src/acp/types.ts`).

## What to implement
1. Wiring. `src/run.ts:~269` and `src/list.ts:~41` pass `def.clientCapabilitiesMeta` and `def.loginHint` into the WorkerSpawn the same way they pass `authMethodId`. `src/acp/worker.ts:~215`: `initialize` sends `clientCapabilities: { fs: {…false}, terminal: false, ...(meta ? { _meta: meta } : {}) }` — every harness without the field sends exactly what it sends today.
2. Authentication errors in the handshake. In `#handshakeError` (`src/acp/worker.ts`), a JSON-RPC error with code -32000 (ACP "Authentication required", `RequestError.authRequired`) at any step (`authenticate`, `session/new`, `session/resume`, `session/load`) → `harness_unavailable` with the same `<step> failed: <detail>` text plus `; log in: <loginHint>` when the spawn has a hint. This check goes before the resume/load → `session_not_found` mapping. Other errors keep today's codes. Existing cursor tests expecting `handshake_failed` / `session_not_found` for a -32000 must be updated to `harness_unavailable` (cursor has no loginHint; its own message already says `agent login`). The list_harnesses probe gets the same message through its reason; check `src/list.ts` maps a probe failure without assuming the code.
3. Collector (`src/acp/collector.ts`), harness-agnostic: read `_meta.jetbrains.air.sessionFailure` defensively (unknown/malformed shapes ignored: severity must be 'error'|'warning', title a string).
   - `session_info_update` with a failure, severity `error`, while in a turn → the turn's failure. Severity `warning`, or `error` outside a turn → a warning.
   - `endTurn(response)`: `response._meta` with a failure of severity `error` → the turn's failure; `warning` → a warning.
   - Warning text: `<severity> (<category>): <title>` plus ` — <details>` when present (same style as the `notice` warnings). Keyed by failure `id`: a later revision of the same id replaces the earlier text in place, so retries 1/5…5/5 leave one warning with the latest title. Plain-string warnings keep their dedupe behaviour; the `warnings` getter returns both, no duplicates.
   - `startTurn()` clears the turn failure. Getter `turnFailure: { category?: string; title: string } | undefined`.
4. `src/run.ts`: in `turn()`, right after `collector.endTurn(response)`, when `collector.turnFailure` is set and `response.stopReason !== 'cancelled'` → throw `ThrongError('agent_error', 'agent failed the turn (<category>): <title>')` (category part omitted when absent). This happens before any structured parsing, so no corrective prompt follows; the failure payload keeps `session_id`, `usage`, any partial `text` and warnings as other failures do (via `context()`/`failure()`), and the session record's last result is this error like any other failed turn.
5. `src/prompt.ts` `buildCorrectivePrompt`, kind `missing`: "Your final message was not a JSON value. If you have not finished the task, finish it first. Then end the turn with a final message that is only the JSON value matching the JSON Schema from the task." `invalid` stays as is. Update `src/prompt.test.ts` and any fake-agent/test that matches the old text (grep for "Reply with only the JSON value matching").
6. Fake agent (`test/fake-agent/agent.ts` + scenario list and knob docs in `index.ts`): new scenarios, documented in the index.ts header like the others:
   - `session-failure`: sends a `session_info_update` warning (id `t1:error`, revision 1, category `service`, title `Reconnecting… 1/2`), then revision 2 of the same id (`Reconnecting… 2/2`), then ends the turn `end_turn` with `_meta.jetbrains.air.sessionFailure` = `{ id: 't1:error', revision: 3, category: 'service', severity: 'error', title: "model 'fake-model' is not enabled", actions: ['retry'] }`, and no agent text; and records the `clientCapabilities._meta` it got in `initialize` into FAKE_CALL_LOG (extend the `start`-like logging or add an `initialize` FakeCall event with `clientMeta`).
   - Optionally a variant where the error comes as an in-turn `session_info_update` with severity `error` and some partial agent text before it (or make it a knob), so the in-turn path is covered.
   Keep existing scenarios unchanged.
7. Tests:
   - collector.test.ts: error via PromptResponse._meta → turnFailure; error via in-turn session_info_update → turnFailure; error outside a turn → warning; warnings revisions dedupe by id (one entry, latest title); startTurn clears; malformed meta ignored.
   - worker.test.ts: initialize carries `_meta` only when `clientCapabilitiesMeta` is set (via the call log); -32000 at session/new → `harness_unavailable` with `; log in: <hint>` when a hint is given; cursor's existing auth tests updated.
   - run.test.ts (end to end through runCall with the fake agent): without schema → `agent_error` "agent failed the turn (service): model 'fake-model' is not enabled", warnings contain one `warning (service): Reconnecting… 2/2`; with schema → same error and the fake agent saw exactly one prompt (no corrective prompt; check via FAKE_CALL_LOG).
   - A test that the codex HarnessDefinition declares the capability (cheap, in the existing harness index test or a new codex test).
8. Docs:
   - `docs/DESIGN.md` §3.2 ErrorCode comments: `harness_unavailable` adds "or the adapter answers the handshake with Authentication required (-32000); the message names the login command when the harness has one"; `handshake_failed` stays for other handshake errors; `agent_error` adds "including a turn the adapter marks failed (§4.3)". §4.2 step 2: initialize carries the harness's `clientCapabilities._meta` (codex: AIR `sessionFailure`); an `authenticate` -32000 error → `harness_unavailable` (it says `handshake_failed` today — fix). §4.3: a bullet for `_meta.jetbrains.air.sessionFailure` (PromptResponse or session_info_update): severity error in a turn → the call fails `agent_error`, no corrective prompt; warnings and out-of-turn errors → `warnings`, one per failure id. §6: the new `missing` corrective text.
   - `docs/harnesses.md`, codex section: why the capability is declared (error as text without it), what else it turns on in codex-acp 2.2.2 (AIR presentation: tool calls skip the "standard" field overrides, permission requests for a started command omit kind/status, `item/mcpToolCall/progress` is dropped, agent messages carry `_meta.jetbrains.air.phase`, config/deprecation warnings come as session failures instead of text), and that claude-agent-acp reads the same capability but is deliberately not given it (it changes much more of its output). Keep it short and factual.

## Out of scope
No other harness gets the capability. Don't touch the permission bridge, structured parsing, or the session registry. No README/CHANGELOG edits.

## Acceptance criteria (THRONG-34)
- The codex harness declares the AIR sessionFailure capability in initialize; other built-in and custom harnesses send the same clientCapabilities as before.
- A turn whose PromptResponse._meta or an in-turn session_info_update carries a sessionFailure with severity error fails the call with agent_error naming the failure, with no corrective prompt, whatever the schema.
- A sessionFailure with severity warning, or an error outside a turn, becomes a warning; repeated revisions of one failure id leave one warning with the latest title.
- The corrective prompt for a missing structured result tells the agent to finish the task first if it has not, then reply with the JSON.
- An Authentication required error (ACP code -32000) during the handshake fails with harness_unavailable; for codex the message says to run codex login.
- Tests cover the above through the fake agent; DESIGN.md (§3.2 error codes, §4.2, §4.3) and docs/harnesses.md describe the behaviour.

Revised after review (a1): only PromptResponse._meta with severity error fails the turn; every session_info_update failure is a warning. README.md: Cursor without login → harness_unavailable.

Revised 2026-10-21 (nodge, decision-12): no AIR opt-in. Removed clientCapabilitiesMeta, the sessionFailure parsing in the collector, the agent_error throw and their tests/docs. Kept the corrective prompt and the -32000 → harness_unavailable mapping with loginHint.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review triage a1 (2026-10-21, main session): codex-acp 2.2.2 sends a severity-error session_info_update only for another turn or after the prompt; the current turn's failure comes only in PromptResponse._meta. Narrowed AC2: only PromptResponse._meta fails the turn, session_info_update failures are warnings.

Run 20261021-throng-34 (runbook-task-cycle): ready. Reviews: Opus 3 findings, Codex 0. Triage: a2 fixed (docs/configuration.md, docs/development.md troubleshooting rows), a1 applied by the main session after the run (narrowed rule), a3 refuted. Live check against real codex-acp 2.2.2 (CODEX_CONFIG model=no-such-model-throng-34, AIR capability declared): PromptResponse stop_reason end_turn, _meta.jetbrains.air.sessionFailure {severity: error, category: service, title: "The 'no-such-model-throng-34' model is not supported when using Codex with a ChatGPT account."}, no agent text; collector.turnFailure set; the model-metadata notice came as a session_info_update warning. Gates: typecheck, lint, test (31 files, 430 tests) green.

Upstream: agentclientprotocol/codex-acp#647 (open, 2026-10-20) already proposes failing session/prompt with internalError for non-AIR clients on terminal turn errors — the fix this task waits for. No new issue filed.

AIR removed (decision-12, nodge 2026-10-21): clientCapabilities back to main for every harness; collector, fake agent and run tests for sessionFailure reverted. Gates: typecheck, lint, test (31 files, 421 tests) green.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Ships the parts of the Codex failed-turn fix that do not depend on codex-acp's experimental JetBrains AIR extension (decision-12; an AIR opt-in was built, verified live and dropped). The missing-JSON corrective prompt now asks the agent to finish the task first, then reply with the JSON. An ACP Authentication required error (-32000) at any handshake step is harness_unavailable, ahead of the resume/load → session_not_found mapping, with '; log in: codex login' for codex (HarnessDefinition.loginHint). The failed-turn-as-text bug itself waits for agentclientprotocol/codex-acp#647. Verified: worker tests for -32000 on session/new and session/load, codex/cursor harness tests, prompt test; gates green (421 tests).
<!-- SECTION:FINAL_SUMMARY:END -->
