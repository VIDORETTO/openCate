# ADR 0001 — Use Cate as the product foundation

## Status

Accepted — 2026-08-23.

## Context

We evaluated Cate, Paseo, Claude Squad, Nimbalyst, TermCanvas and the original TermCanvas fork. Requirements include an infinite canvas, resizable persistent terminals, multiple AI CLI agents, naming/discovery, shared context, subagent visibility, Git worktrees, durable sessions and future remote access.

The comparison and codebase evidence are recorded in `../../work/research/project-analysis.md`.

## Decision

Use **Cate** as the foundation. Keep its Electron architecture, canvas store, panel system, terminal lifecycle, worktree territories and agent integration contracts intact for the first phases. Build product-specific features as additive modules and tests before changing core behavior.

## Rationale

1. Cate directly implements the hardest core requirement: an infinite zoomable canvas with nested canvases, docks and detached windows.
2. Its MIT license permits a derivative without forcing source disclosure.
3. It already has real PTYs, scrollback restoration, Monaco/browser/document panels, agent status detection, subagents, orchestration modes, SSH/WSL and per-project JSON persistence.
4. Higher-adoption projects are stronger at orchestration/platform or task management, but do not center the free spatial canvas.

## Consequences

- Preserve upstream attribution and MIT licensing.
- Absorb operational UX from TermCanvas, durability from Claude Squad, platform capabilities from Paseo and visual collaboration/task patterns from Nimbalyst.
- Validate Windows first because the current baseline has Windows-only symlink/localStorage test failures.
- Avoid renaming internal identifiers until the first stable vertical slice is protected by tests.
