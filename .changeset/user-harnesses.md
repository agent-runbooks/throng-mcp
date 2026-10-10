---
'throng-mcp': minor
---

User harnesses: any other ACP agent can be described in the config under `harnesses.<id>` with `command`, `args` and `env`. Policy `auto` applies the entry's `auto_approve` (session mode, config options, args, env), and the other policies apply `ask_approval`. After that, `run_thronglet` takes `<id>/<model>[:<effort>]`, and `list_harnesses`, `send_message` and the background tools treat it like a built-in harness. throng installs nothing for it and guesses nothing. Without `auto_approve`, policy `auto` leaves the agent in its starting mode and warns. `list_harnesses` now reports `harness` as a string.
