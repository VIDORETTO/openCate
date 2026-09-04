# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Before You Code

Read and follow the **karpathy-guidelines** skill
(`.codex/skills/karpathy-guidelines/SKILL.md`) when writing, reviewing, or
refactoring code here — surface assumptions, make surgical changes, keep it
simple, and define verifiable success criteria.

Read the shared [engineering guidelines](docs/ENGINEERING_GUIDELINES.md) and
the relevant [development](docs/DEVELOPMENT.md), [structure](docs/PROJECT_STRUCTURE.md),
and [architecture](docs/ARCHITECTURE.md) sections before changing code.

## Tool Loop Prevention

Every tool call must have a concrete purpose: identify the new information
expected and the decision it can change before invoking the tool. Never repeat
a tool call with identical or semantically equivalent arguments when the prior
result is still valid, the workspace has not changed, and no new failure or
hypothesis requires fresh evidence. Reuse recent results as working context; do
not consult them again merely for confirmation. A second equivalent call is
allowed only for a concrete reason; a third is a strategy error.

Reads must advance a hypothesis. If a file read does not produce enough
context, change strategy instead of rereading the same range: widen or shift
the window, search for the relevant symbol/error/reference, inspect its
implementation, or run the targeted test. After at most three consecutive
read-only actions without new evidence, stop and replan explicitly: identify
what is known, what remains unknown, which single query could resolve it, and
whether an edit or test would be more direct.

Activity is not progress. Optimize for information and validated change per
call, not call count. On detecting a repeated query or stalled investigation,
stop immediately, summarize what is known, isolate the missing evidence, and
switch to a different query, edit, or targeted validation that can resolve it.
"Verify everything" does not authorize unlimited caution: act when existing
evidence supports a safe decision.

Prefer targeted validation before broad gates, in this order: the test covering
the changed behavior, typecheck, lint, module tests, then the wider suite. Do
not treat inspection as validation or describe reads as running gates. Say
accurately whether the current phase is investigation, editing, focused
testing, typecheck/lint, or the full gate.

## Project and release context

The shared engineering document is the source for stack, process boundaries,
canvas, panel, persistence, testing, and release guidance. Keep this file
focused on agent workflow; update the shared document when common project rules
change.
