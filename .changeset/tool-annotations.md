---
'throng-mcp': minor
---

Every throng tool now declares the MCP tool annotations `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint`. Clients that read them can tell the read-only tools (`list_thronglets`, `wait_thronglet`) from the ones that start or stop an agent (`run_thronglet`, `send_message`, `cancel_thronglet`). For example, a client can skip the confirmation prompt for the read-only tools or run them in parallel. `list_harnesses` is marked as changing state but not destructive: to read the models it opens a session in each harness, and some harnesses, Cursor among them, keep that session on disk. Before, the hints were missing, and by the MCP spec a client had to treat every throng tool as one that can change things.
