---
'throng-mcp': minor
---

GitHub Copilot CLI as a harness: `copilot/<model>` runs your installed Copilot CLI with its own login, so the models of your Copilot subscription are available. Install it with `npm i -g @github/copilot` and run `copilot login` once. After that `list_harnesses` shows its models. By default Copilot approves its own tool calls. With `harness_mode: ask` it asks before shell commands and file edits, and throng answers as `permission_answers` says. Follow-ups with `send_message` and `steer: true` work, and so does structured output with `schema`. If Copilot is signed in only through the GitHub CLI, it offers no models and every run fails with `model_rejected`, so sign in with `copilot login`. See [GitHub Copilot CLI](https://github.com/agent-runbooks/throng-mcp/blob/main/docs/harnesses.md#github-copilot-cli).
