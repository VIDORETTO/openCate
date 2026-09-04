# Code hygiene audit — 2026-08-29

This audit closes the low-risk review items in the maintenance backlog. It
records where a refactor is safe and where a seemingly simple cleanup would
change a contract or timing-sensitive behavior.

## Findings

### Shared contracts — high change risk

- `src/shared/types.ts` is 1,792 lines and is consumed by main, preload,
  renderer, runtime, tests, and persisted-state adapters. It is a central
  contract surface, not a safe cosmetic split. Domain extraction remains a
  planned change requiring a consumer map, compatibility tests, and review of
  serialized shapes.
- `src/shared/electron-api.d.ts` is 1,318 lines and describes the ambient
  renderer bridge. Splitting it is possible, but only with a generated or
  checked aggregate that proves `window.electronAPI` has not changed.

### Large responsibility-bearing files — medium/high change risk

The largest relevant implementation files include `BrowserPanel.tsx`,
`cateApiHandlers.ts`, `ChatComposer.tsx`, `TerminalPanel.tsx`, and
`agentHooks.ts`. They combine lifecycle-sensitive UI or public adapter logic.
Their boundaries should be extracted only as isolated seams with focused tests;
this pass did not reformat or move them speculatively.

### `any` usage — compatibility boundaries

The production matches are concentrated in:

- Electron `<webview>` event declarations and portal casts in
  `BrowserPanel.tsx` and `ExtensionPanel.tsx`;
- lazy panel components in `panels/registry.ts`, whose extra props vary by
  panel type;
- the generated Pi hook in `shared/agentHooks.ts`, which implements a
  third-party callback contract outside Cate's type ownership.

The remaining broad matches are test-only provider fixtures or ordinary prose.
Replacing these with `unknown` without local event schemas would either move
the assertion to an unsafe cast or alter the adapter contract. The safe rule is
to introduce narrow event/adapter types at each boundary when that boundary is
next changed, rather than perform a mechanical repository-wide replacement.

### Imports, names, and comments

The inspected files follow the existing module boundaries and lint/typecheck
cleanly. No dead import or obsolete comment was identified whose removal could
be proven behavior-neutral in this pass. No repository-wide formatter was run.

## Safe actions completed

- Added `docs/ENGINEERING_GUIDELINES.md` as the shared source referenced by
  `AGENTS.md`, `CLAUDE.md`, and `CONTRIBUTING.md`.
- Recorded the size/risk matrix above so future refactors start from concrete
  seams instead of file length alone.
- Preserved the existing contracts and validated the resulting documentation
  and wrapper changes with the normal typecheck, lint, and diff checks.

## Deferred work requiring review

- Split shared contracts only after mapping consumers and serialized versions.
- Replace webview and third-party adapter `any` values with local structural
  event types, followed by manual browser/extension validation.
- Extract independent browser/API/agent modules only when a seam has focused
  coverage and its lifecycle behavior is understood.
