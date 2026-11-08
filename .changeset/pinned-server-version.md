---
'throng-mcp': patch
---

The Claude Code plugin now starts a pinned server version, `npx -y throng-mcp@<version>`, instead of `throng-mcp@latest`, and the plugin manifest carries the same `version`. A new throng release no longer reaches you on the next session start: you update when you choose, with `claude plugin marketplace update throng-mcp` and `claude plugin update throng@throng-mcp`. The `npx` commands in the README for Claude Code, Codex and OpenCode are pinned the same way: to update, put the new version into the command. See [Install](https://github.com/agent-runbooks/throng-mcp/blob/main/README.md#install).
