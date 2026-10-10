---
'throng-mcp': minor
---

New built-in harness `cursor` (Cursor CLI over ACP, `cursor-agent acp`): `harness_mode: auto` launches it with `--force`; throng calls `authenticate` after `initialize` (run `agent login` once); `send_message` continues a Cursor session through `session/load`, without the replayed history in the result. A model can be named without its bracketed parameters (`cursor/gpt-5.4-nano` picks `gpt-5.4-nano[reasoning=medium]`) for every harness.
