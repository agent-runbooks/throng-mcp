---
'throng-mcp': patch
---

Security fix for `harness_mode: ask`: a shell command whose permission request named throng's `submit_result` tool, such as `echo throng_result submit_result; <anything>`, was approved even under `permission_answers: deny`. throng now approves only its own tool, recognised by the exact form each harness gives it, and everything else goes to `permission_answers`. Structured output under `ask` still works on Claude, Codex, OpenCode, Cursor and Copilot. On Gemini CLI 0.62 and later, use `harness_mode: auto` when you pass a `schema`. See [Harnesses](https://github.com/agent-runbooks/throng-mcp/blob/main/docs/harnesses.md).
