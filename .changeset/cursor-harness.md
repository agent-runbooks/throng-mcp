---
'throng-mcp': minor
---

Cursor CLI as a harness: `cursor/<model>` runs your installed Cursor CLI with its own login, so the models of your Cursor subscription are available, Composer included. Install it with `curl https://cursor.com/install -fsS | bash` and run `agent login` once. After that `list_harnesses` shows its models. Follow-ups work: `send_message` and `steer: true` continue a Cursor session. Note that Cursor applies file edits on its own, whatever `harness_mode` and `permission_answers` say. Those settings cover only what it asks about: shell commands, MCP tools and web search. See [Cursor CLI](https://github.com/agent-runbooks/throng-mcp/blob/main/docs/harnesses.md#cursor-cli).
