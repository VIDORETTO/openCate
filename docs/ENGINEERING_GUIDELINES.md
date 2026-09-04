# Engineering Guidelines

This is the shared engineering reference for contributors and coding agents.
`AGENTS.md` and `CLAUDE.md` contain only assistant-specific entry points; human
contribution rules live in `CONTRIBUTING.md`. When those files mention setup,
architecture, validation, or code style, this document is the common source.

## Read first

- [Development and validation](DEVELOPMENT.md) — Bun/npm policy, scripts, CI,
  smoke tests, and E2E gates.
- [Project structure](PROJECT_STRUCTURE.md) — module ownership and boundaries.
- [Architecture](ARCHITECTURE.md) — process model, IPC, persistence, and
  security constraints.
- [Troubleshooting](TROUBLESHOOTING.md) — known operational failure modes.

## System boundaries

Cate is an Electron application built with React, TypeScript, Tailwind CSS,
Zustand, Monaco, xterm.js, and a headless Node runtime.

- `src/main/` owns windows, native APIs, filesystem, Git, process launch, and
  IPC handlers.
- `src/preload/` exposes the narrow, typed bridge used by the renderer. Do not
  bypass it with Node access from renderer code.
- `src/renderer/` owns React UI, canvas interaction, panel presentation, and
  renderer stores.
- `src/runtime/` owns the standalone daemon and capability boundaries. It must
  remain usable without Electron.
- `src/shared/` owns contracts shared across processes. Public IPC and
  persisted shapes must be changed deliberately and covered by compatibility
  tests.

All main/renderer communication uses IPC. Panel definitions belong in
`src/shared/panels.ts`; panel rendering is dispatched through the shared panel
host and panel registry. Canvas positions are stored in canvas-space and
converted through `src/renderer/lib/canvas/coordinates.ts`.

Persisted JSON is hand-editable and must use the existing atomic-write,
normalization, quarantine, and bounded-history patterns. Project state belongs
under `<project>/.cate/`; global settings and credentials belong under the
Electron `userData` directory. Never persist or transmit terminal scrollback
implicitly; context delivery requires an explicit selection and confirmation.

## Change discipline

- Keep the smallest coherent diff and match surrounding conventions.
- Preserve public IPC, SDK, CLI, persistence, and extension contracts unless a
  change explicitly includes migration and compatibility coverage.
- Keep validation in the owning boundary rather than duplicating business rules
  in UI, preload, and main.
- Prefer typed domain contracts and explicit result/error shapes. Treat `any`
  at browser, extension, or third-party adapter boundaries as a compatibility
  exception that needs a local type or runtime guard before removal.
- Do not add a process, queue, relay, container, or external integration
  without a written contract covering identity, authorization, cleanup,
  reconnect behavior, and tests.
- Avoid drive-by formatting, speculative abstractions, and refactors that do
  not reduce a concrete maintenance or correctness risk.

## Validation

Use the narrowest relevant check first, then widen it:

```bash
bun run typecheck
bun run lint
bun run test
bun run build
bun run test:smoke:electron
```

For a behavior change, add or update the colocated Vitest test. Use the
opt-in live agent and performance suites only when their required binaries or
environment are available. `npm ci` is for reproducing CI/release; local
development uses Bun and both lockfiles must remain synchronized after a
dependency change.

## Release hygiene

Before a beta or stable release, update `CHANGELOG.md` with the version, date,
and categorized user-facing changes before bumping or tagging. Release builds
must use the documented platform matrix and must not imply that manual webview,
remote-host, signing, privacy-policy, or release-candidate checks passed when
they were not performed.
