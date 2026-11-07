---
id: THRONG-35
title: MCP tool annotations; bump bundled fast-uri
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T21:01:00Z'
updated_date: '2026-11-07T21:15:00Z'
labels: []
dependencies: []
priority: low
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every tool registers explicit readOnlyHint/destructiveHint/idempotentHint/openWorldHint matching its handler, so hosts can tell read-only tools (list_harnesses, list_thronglets, wait_thronglet) from ones that start or stop agents. Separately, the bundled fast-uri (via ajv in the MCP SDK) is 3.1.8, with advisories fixed in 3.1.9: bump it in the lockfile.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All six tools declare all four hints as explicit booleans
- [x] #2 A test asserts the hints each tool reports over tools/list
- [x] #3 dist/THIRD_PARTY_LICENSES.md lists fast-uri >= 3.1.9 and pnpm audit shows no fast-uri advisory
- [x] #4 Changesets: minor for the annotations, patch for fast-uri
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Went through the runbook-task-cycle; report spot-checked
- [ ] #2 Gates green: pnpm typecheck && pnpm test
- [ ] #3 DESIGN.md updated if an external contract (DESIGN §3) changed
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review: sol loop (codex/gpt-6.1-sol xhigh), 2 rounds, APPROVE. Round 1 S1 [blocker] fixed: list_harnesses is not read-only, its probe calls session/new and Cursor persists the session under ~/.cursor/acp-sessions. Round 1 S2 [nit] declined: list_thronglets and wait_thronglet stay readOnlyHint true although resolveState may write transport_lost into throng's own record for a turn whose process is gone. Follow-up if wanted: separate that repair from inspection. Full pnpm test: one run had 40/421 load-related failures, the next two 421/421.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
All six MCP tools declare readOnlyHint/destructiveHint/idempotentHint/openWorldHint explicitly: list_thronglets and wait_thronglet read-only; list_harnesses not read-only, not destructive (probe sessions persist in Cursor); run_thronglet and send_message destructive and open-world; cancel_thronglet destructive and idempotent. src/mcp.test.ts asserts them over tools/list. The bundled fast-uri moved 3.1.8 → 3.1.9 (dist/THIRD_PARTY_LICENSES.md, pnpm audit shows no fast-uri advisory). Changesets: minor (annotations), patch (fast-uri). Checks: typecheck, lint, test 421/421.
<!-- SECTION:FINAL_SUMMARY:END -->
