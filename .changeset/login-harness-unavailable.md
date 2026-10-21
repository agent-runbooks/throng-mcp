---
'throng-mcp': patch
---

A harness that isn't logged in now fails with `harness_unavailable` instead of `handshake_failed` (or `session_not_found` on `send_message`), with the adapter's message. For Codex the message ends with `; log in: codex login`; Cursor's own message already says to run `agent login`. See the [troubleshooting table](https://github.com/agent-runbooks/throng-mcp/blob/main/docs/configuration.md#troubleshooting).
