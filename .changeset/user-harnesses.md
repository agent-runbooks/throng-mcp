---
'throng-mcp': minor
---

You can now run any ACP agent, not only the built-in Claude Code, Codex, OpenCode and Gemini CLI. Add the agent to your throng config with the command that starts it, and call it like the others: `kimi/<model>`. If the agent has an auto-approve mode, name it in the config too, and throng switches to it under the default `auto` policy. See [User harnesses](https://github.com/agent-runbooks/throng-mcp/blob/main/docs/configuration.md#user-harnesses).
