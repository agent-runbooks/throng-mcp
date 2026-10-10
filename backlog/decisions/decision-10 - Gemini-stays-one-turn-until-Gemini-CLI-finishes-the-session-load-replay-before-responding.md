---
id: decision-10
title: >-
  Gemini stays one-turn until Gemini CLI finishes the session/load replay before
  responding
date: '2026-10-10 21:01'
status: accepted
---
## Context

Gemini CLI has no `session/resume`, so its sessions are one turn (THRONG-22, THRONG-26). THRONG-30 adds continuation through `session/load` for agents with `loadSession` and no resume; it drops every update that arrives before the load response, which assumes the replay precedes the response, as the ACP spec requires ("When all the conversation entries have been streamed to the Client, the Agent MUST respond"). THRONG-31 checked Gemini CLI 0.63.0 and main (9b6e026): `loadSession` starts `streamHistory` without awaiting it, so at most the first replayed update precedes the response and the rest follows it, with no marker where the replay ends. A boundary after the response could only come from timing, or from counting the expected updates out of Gemini's own session files.

## Decision

Made by the maintainer (nodge), 2026-10-10. Gemini sessions stay one turn; throng adds no Gemini-specific replay boundary. The fix goes upstream instead: an issue and a PR to google-gemini/gemini-cli that await the replay before the `session/load` response. Once a Gemini CLI release carries it, gemini opts into THRONG-30's load-based continuation, gated on that version.

## Consequences

- `send_message` and `steer` to a gemini session keep failing with `session_not_found`; `accepts_messages` stays false.
- THRONG-31 waits on the upstream release and on THRONG-30; its remaining work is the opt-in, the version gate, tests and the real-CLI smoke.
- No coupling to Gemini's session file format.

