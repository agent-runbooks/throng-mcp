---
'throng-mcp': minor
---

`list_harnesses` now lists only the harnesses you have. A built-in harness whose adapter isn't installed no longer shows up under `unavailable` with an install hint, so the calling agent doesn't spend context on harnesses it can't run. `unavailable` is left for harnesses that are installed or configured but can't run: a config error, a configured `command` that isn't found, a failed probe. To find out what to install for a missing harness, call `run_thronglet` with it: it fails with `harness_unavailable` and the install command, as before. See [Check](https://github.com/agent-runbooks/throng-mcp/blob/main/README.md#check).
