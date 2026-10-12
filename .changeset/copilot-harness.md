---
'throng-mcp': minor
---

GitHub Copilot CLI as a harness: `copilot/<model>` runs your installed Copilot CLI (`copilot --acp`) with its own login, so the models of your Copilot subscription are available. Install it with `npm i -g @github/copilot` and run `copilot login` once; `list_harnesses` then shows its models. Both harness modes work: `auto` (the default) turns on Copilot's `allow_all`, `ask` sends shell commands and file edits to `permission_answers`. `send_message`, `steer: true` and `schema` work as with the other harnesses. With only the GitHub CLI's login, Copilot offers no model choice and every run fails with `model_rejected`. See [GitHub Copilot CLI](https://github.com/agent-runbooks/throng-mcp/blob/main/docs/harnesses.md#github-copilot-cli).
