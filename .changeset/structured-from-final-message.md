---
'throng-mcp': minor
---

Structured output no longer goes through an MCP tool. With `schema`, throng adds the schema to the prompt and takes the result from the agent's final message, which must be only a JSON value matching it (a ```json fence is fine). A missing or invalid result still gets up to two corrective prompts, then `structured_missing` or `structured_invalid`. throng now approves no permission request on its own. This closes a hole in 0.7.0: under `harness_mode: ask`, a shell command that named throng's old `submit_result` tool was approved even with `permission_answers: deny`. Structured output now works the same on every harness and under every permission setting, including Gemini CLI 0.62+ and custom harnesses. See [Structured output](https://github.com/agent-runbooks/throng-mcp/blob/main/skills/throng/SKILL.md#structured-output).
