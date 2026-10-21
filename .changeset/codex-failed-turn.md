---
'throng-mcp': patch
---

A Codex turn that fails on the backend side now fails the call with `agent_error` and the backend's message, for example "agent failed the turn (service): The 'gpt-x' model is not supported…". Before, codex-acp sent such an error as plain agent text, so throng returned it as the agent's answer, and with `schema` it sent a corrective prompt after it. Codex retry notices ("Reconnecting… 2/5") and config warnings now come in `warnings`, one entry per notice with its latest text, instead of being mixed into the answer. When a structured result is missing, the corrective prompt now tells the agent to finish the task first if it hasn't, so it no longer answers with a "failed" result instead of doing the work. See [Codex](https://github.com/agent-runbooks/throng-mcp/blob/main/docs/harnesses.md#codex).
