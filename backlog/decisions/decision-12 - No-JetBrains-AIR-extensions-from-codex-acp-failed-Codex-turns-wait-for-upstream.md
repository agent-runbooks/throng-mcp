---
id: decision-12
title: >-
  No JetBrains AIR extensions from codex-acp; failed Codex turns wait for
  upstream
date: '2026-10-21 17:21'
status: accepted
---
## Context

codex-acp 2.2.2 sends a turn's backend error (e.g. "model 'gpt-6.1-sol' is not enabled in rustponsesapi") as plain agent text and ends the turn `end_turn`, so throng returns the error as the agent's answer (THRONG-34, found 2026-10-19 in the coder agent's friction log). Standard ACP v1 has no "turn failed" stop reason; the only standard way is to reject `session/prompt` with a JSON-RPC error, which codex-acp does not do for this. The `session.notices` capability covers warnings, reroutes and compaction, not turn errors. codex-acp reports typed failures only through its JetBrains AIR `sessionFailure` extension (`initialize.clientCapabilities._meta.jetbrains.air`). Its own docs (`docs/air-extensions.md`) mark every AIR extension `Status: Experimental` and keep a "Removed keys" section; stability is promised only to clients that do not declare AIR. Declaring it also switches codex-acp to AIR presentation for every update. A branch of THRONG-34 implemented the opt-in and confirmed it on a live codex-acp 2.2.2.

## Decision

Made by the maintainer (nodge), 2026-10-21. throng does not declare JetBrains AIR extensions to codex-acp (nor to claude-agent-acp, which reads the same capability). A failed Codex turn is fixed upstream: codex-acp should reject `session/prompt` with a JSON-RPC error for a client without AIR, which throng already maps to `agent_error`. That is exactly the proposal of [agentclientprotocol/codex-acp#647](https://github.com/agentclientprotocol/codex-acp/issues/647) (open since 2026-10-20, by leepokai), so throng files no issue of its own. THRONG-34 ships the parts that do not depend on AIR: the missing-JSON corrective prompt asks the agent to finish the task first, and an ACP Authentication required error (-32000) at handshake is `harness_unavailable` with the harness's login command.

## Consequences

- Until codex-acp changes, a Codex backend error without `schema` still comes back as a successful `text`; with `schema` it costs a corrective prompt, which no longer invites a `failed` result without doing the task.
- No dependency on an experimental client-specific contract and no AIR presentation drift in what throng reads.
- If codex-acp adds typed failures through a standard ACP mechanism, or upstream ACP gets one, revisit.

