---
id: decision-8
title: >-
  Harnesses beyond the built-in ones are defined in the user's config, not
  inferred from the ACP registry
date: '2026-10-10 14:43'
status: accepted
---
## Context

THRONG-20 was planned as a "generic harness": any id from the ACP registry snapshot runs as a harness, the command comes from its distribution, policy `auto` from a session mode advertised under the id `yolo`, `auto` or `bypass` (DESIGN §11 talked of "generic harnesses from the registry").

Checked 2026-10-10 against source code:

- Registry consumers install the agents themselves. Zed runs `npm install` into its own dir and reads `bin` from the installed `package.json`; binary archives are downloaded and checked against sha256. t3code does the same with a managed npm prefix. decision-3 rules that out for throng.
- The registry has no bin name for npx distributions, and it often differs from the package (`@qwen-code/qwen-code` → `qwen`, `@minimax-ai/code` → `mcode`). Finding the command on PATH would mean guessing a name, and a different program under that name (`goose` is also a database migration tool) would be launched with ACP args.
- Neither the ACP spec nor the registry marks a mode or config option as auto-approve: config option categories are for UX only and "MUST NOT be required for correctness". No client picks a permissive mode by its id. Zed and agent-shell take the mode from the user's per-agent settings; acpx, avante, Obsidian and codecompanion auto-answer `request_permission` themselves.
- Clients that don't install (acpx, agent-shell, Toad, avante, Obsidian) keep a per-agent table of commands, overridable by the user.

## Decision

Made by the maintainer (nodge), 2026-10-10.

- Built-in harnesses (claude, codex, opencode, gemini) stay `HarnessDefinition`s in code. Niche agents don't get built-in definitions from outside PRs.
- Any other harness is defined by the user under `custom_harnesses.<id>` in the config, a section apart from the built-in overrides in `harnesses`: `command` (required), `args`, `env`, `permissions`, and per policy group `auto_approve` (policy `auto`) and `ask_approval` (`allow_all`, `deny_all`, `elicit`), each with `mode`, `config_options`, `args`, `env`. Nothing is inferred: no command guessing, no auto mode detection, no registry lookup.
- Policy `auto` without `auto_approve` runs in the agent's starting mode with a warning; throng's answers to permission requests (§5) hold the policy either way.
- A custom id equal to a built-in one wins: an existing config keeps its meaning when throng adds a built-in harness later, and the server logs at start that the built-in one is shadowed. Added 2026-10-10 in review of THRONG-20, when user harnesses still shared `harnesses` with the built-in overrides.
- `list_harnesses` showing only installed harnesses, and with it dropping the registry snapshot, is THRONG-28.

## Consequences

- A niche agent works without code changes, as long as its knobs fit mode, config options, args and env. Anything stranger (extension methods, a pre-turn noise filter, effort value mapping) needs a built-in definition.
- The config gets a `custom_harnesses` section; harness ids in the contract (agent spec, `list_harnesses`, session records) are no longer a closed set.
- DESIGN §11's "generic harnesses from the registry" is dropped.
