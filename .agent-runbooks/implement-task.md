# Implement task

## Checks

command: pnpm typecheck && pnpm lint && pnpm test

The gates AGENTS.md sets before any commit. Formatting is not part of them: prettier runs in the pre-commit hook, so don't hand-format. The tests are vitest and never call an LLM. Real harnesses run only in `scripts/smoke/`, by hand, and are not part of the checks.

## VCS

status: git status --porcelain -- . ':(exclude)backlog/'

Git. Everything uncommitted is the changes, except `backlog/`: the main session edits the task's backlog file (status, plan) before every run, and `backlog/` is its own, outside what the steps review or change.

## Rules

- Source of truth: `docs/DESIGN.md`. The brief names the sections that matter.
- Runs as `node src/mcp.ts` with no build step: only erasable TypeScript syntax, imports with `.ts`.
- Tests live next to the code (`src/foo.test.ts` for `src/foo.ts`) and go through `test/fake-agent`.
- Nothing outside the project directory is touched: no registering the server in the user-scope Claude config, no edits under `~/.claude/*`.
- Steps don't touch `backlog/` or `.changeset/`: the main session owns them.
- Tool input and output, `ErrorCode` (DESIGN §3), `HarnessDefinition` and the Worker interface are contracts. A change to them outside what the brief asks for is a finding.
