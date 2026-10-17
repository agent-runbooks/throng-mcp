---
id: decision-11
title: >-
  Structured output comes from the agent's final message, not from an MCP submit
  tool
date: '2026-10-17 10:40'
status: accepted
---
## Context

Since THRONG-6, structured output went through a stdio MCP server `throng_result` that the harness spawned, with one tool `submit_result` whose input schema carried the caller's schema. Under `harness_mode: ask` the harness asks before an MCP tool, so throng answered that request `allow_once` under every setting (DESIGN §5). throng recognised the request by its title, and several harnesses put model-written text there. On Claude, OpenCode and Gemini the shell request title is the command. On Copilot it is a description the model writes. On Codex the command text is on the `tool_call` that throng also consulted. So under `ask` + `deny` or `elicit` a model could get any shell command auto-approved by naming the tool in it (shipped in 0.7.0, found 2026-10-13, THRONG-33). Matching exact per-harness title forms closes the known cases, but it rests on each adapter's presentation. It cannot recognise Gemini CLI 0.62+, whose title has no server name, or custom harnesses. It also needed Copilot-specific launch args (`mcpServerArgs`), since Copilot refuses stdio servers in session requests.

## Decision

Made by the maintainer (nodge), 2026-10-17. throng takes the structured result from the agent's final message. The prompt carries the schema and asks for the final message as one JSON value matching it. throng parses the text after the turn's last tool call (the whole message, else its last fenced code block) and validates it with ajv as before. The corrective prompts that handled a missing or rejected `submit_result` now handle a final message without JSON or with JSON that fails the schema. throng passes no MCP server to the harness and answers no permission request on its own.

## Consequences

- No permission request is approved by throng itself, so the title-spoofing class is gone on every harness, built-in or custom.
- Structured output works the same under every `harness_mode` and `permission_answers`, Gemini CLI 0.62+ included.
- `src/structured/submit-tool.ts`, its build entry, `RunContext.submitTool`, the own-tool recognition in `src/permissions.ts` and `HarnessDefinition.mcpServerArgs` go away.
- The schema is in the prompt again, as before THRONG-6's review moved it into the tool's input schema. A model can no longer fix a rejected result within the same turn: each fix is a corrective prompt, at most 2.
- A model that wraps the JSON in prose without a fence, or writes text after it, costs a corrective turn. If real runs show that often, loosen the parse (e.g. the last top-level JSON value in the message) rather than bring the tool back.
