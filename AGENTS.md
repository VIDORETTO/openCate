# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Before You Code

Read and follow the **karpathy-guidelines** skill (`.codex/skills/karpathy-guidelines/SKILL.md`) when writing, reviewing, or refactoring code here — surface assumptions, make surgical changes, keep it simple, and define verifiable success criteria.

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

## Project Overview

Cate is a desktop application that provides an infinite zoomable canvas where editor panels, terminal panels, and browser panels float spatially (similar to Figma/Miro, but for coding). Built with Electron + React + TypeScript, styled with Tailwind CSS.

## Build System

The Electron app lives at the project root. Uses **electron-vite** for bundling.

Local development uses Bun, while CI/release use the committed npm lockfile:

```bash
bun run setup      # install dependencies and build the local runtime
bun run dev        # start dev server with hot reload
bun run build      # production build
bun run test       # run vitest suite
```

Use `npm ci` only when reproducing the CI environment.

Tests use **Vitest** and live alongside the code they cover (`*.test.ts` / `*.test.tsx`). A few git-touching tests assume a clean working repo and may fail when the dev tree has a branch named `main` or local modifications — those failures are environmental, not regressions.

## Release Process

Before creating any beta or stable release, update `CHANGELOG.md` with the
matching version, release date, summary, and categorized user-facing changes.
The changelog entry must be complete before bumping or tagging the release.

## Dependencies

Managed via npm (`package.json`):
- **Electron** — desktop shell (Chromium + Node.js)
- **React 18** + **react-dom** — UI framework
- **xterm.js** (`@xterm/xterm`) — terminal emulator with WebGL addon
- **node-pty** — native PTY for terminal backend
- **Monaco Editor** — code editor (VS Code's editor component)
- **zustand** — lightweight state management
- **chokidar** — filesystem watching
- **simple-git** — git operations
- **@phosphor-icons/react** — icons
- **electron-updater** — auto-update (GitHub Releases)

## Architecture

### Process Model (Electron)

- **Main process** (`src/main/`) — window management, IPC handlers, native APIs
- **Preload** (`src/preload/`) — secure bridge exposing IPC to renderer
- **Renderer** (`src/renderer/`) — React app with canvas UI

IPC channels are defined in `src/shared/ipc-channels.ts`. Type definitions in `src/shared/types.ts`.

### Coordinate System & Canvas

The canvas (`Canvas.tsx`) positions nodes using CSS transforms. Panel positions are stored in **canvas-space** and converted to **view-space** via zoom level and viewport offset. Key conversions in `src/renderer/lib/canvas/coordinates.ts`: `canvasToView()` / `viewToCanvas()`. Zoom range defined by `ZOOM_MIN`/`ZOOM_MAX` in shared types.

### Canvas Interaction

`useCanvasInteraction` hook handles wheel events (Cmd+scroll = zoom, two-finger = pan) and right-click drag panning. Node drag/resize handled by `useCanvasNodeDrag` and `useNodeResize` hooks.

### Panel System

Panel definitions are centralised in `src/shared/panels.ts`. The detachable panel
types (`PanelType` in `src/shared/types.ts`) are: terminal, browser, editor,
canvas, agent, document, extension. Renderer components live in `src/renderer/panels/`:
- **EditorPanel** — Monaco Editor with syntax highlighting
- **TerminalPanel** — xterm.js terminal with WebGL renderer, backed by node-pty
- **BrowserPanel** — embedded webview (file:// allowed for local HTML)
- **CanvasPanel** — nested canvas
- **DocumentPanel** — PDF / docx preview
- **AgentPanel** — Codex agent thread (sidebar + dock)
- **ExtensionPanel** — third-party extension panel (isolated webview served by an extension server)

The file tree (`src/renderer/sidebar/FileExplorer.tsx`) and recent-projects
switcher (`src/renderer/sidebar/ProjectList.tsx`) are **sidebar** components, not
detachable panels.

Each panel can be wrapped in a `CanvasNode` (`src/renderer/canvas/CanvasNode.tsx`) — title bar, drag, resize, close — or live inside a dock zone via `DockTabStack` (`src/renderer/docking/`). All panel records render through the shared `PanelHost` (`src/renderer/panels/PanelHost.tsx`); detached windows are dock windows (`src/renderer/shells/DockWindowShell.tsx`) with local panels state synced back to main for session persistence.

### State Management

Zustand stores in `src/renderer/stores/`:
- **canvasStore** — nodes, regions, zoom, viewport offset, focus state, history; per-canvas instances created via `CanvasStoreContext`. A `focusEpoch` counter lets panels re-run focus side effects when the same node is re-focused.
- **appStore** — workspaces, panels, selected workspace, sidebar
- **dockStore** — dock-zone layout (per window)
- **settingsStore** — user preferences
- **shortcutStore** — keyboard shortcut bindings
- **statusStore** — status bar state
- **uiStore** — transient UI state (command palette, etc.)
- **extensionsStore** — renderer-side mirror of the main process's extension registry (enabled-extension set)

Persisted state is stored as hand-editable JSON files under `userData` (no
electron-store). `settingsFile.ts` owns `settings.json`; `jsonStateFile.ts` is a
reusable factory for that same pattern — it delegates the in-memory-authority
engine to `jsonStateStore.ts` and keeps the filesystem backend (sync load,
debounced atomic write, chokidar external-edit watcher, corrupt-file quarantine).
`workspaceStateStore.ts` uses it for `recent-projects.json`, `sidebar.json`,
`remote-workspaces.json`, and `layouts.json`. Per-project canvas/session state
lives in `<project>/.cate/workspace.json` + `session.json`. AI provider credentials are
global in `userData/pi-agent/auth.json` (+ `models.json`), mirrored into each
workspace's `.cate/pi-agent/`.

### Key Patterns

- **Functional React** with hooks for all logic
- **Zustand** for global state (no Redux/Context boilerplate)
- **Tailwind CSS** for styling
- **IPC** for all main↔renderer communication (filesystem, git, terminal, shell)
- Keyboard shortcuts via `useShortcuts` hook
- File explorer is git-aware (tracks file status)
