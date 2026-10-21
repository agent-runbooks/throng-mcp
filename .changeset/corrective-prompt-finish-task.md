---
'throng-mcp': patch
---

When a structured result is missing, the corrective prompt now tells the agent to finish the task first if it hasn't, and only then reply with the JSON. Before, an agent whose turn had broken off (for example on a Codex backend error) answered the bare "reply with only the JSON" with a "failed" result instead of doing the work. See [Structured output](https://github.com/agent-runbooks/throng-mcp/blob/main/skills/throng/SKILL.md#structured-output).
