# openCate user guide

openCate turns a folder into a visual workspace for running CLI agents, terminals,
editors, and tools side by side. The canvas stores geometry and panels; the dock
organizes panels into tabs and splits.

## Quick start

1. Install a published build from the releases page.
2. Open a trusted folder as a workspace.
3. Press `Ctrl+K` (Windows/Linux) or `Cmd+K` (macOS) to search commands,
   panels, and files.
4. Create a terminal on the canvas and run your preferred CLI, such as Claude
   Code, Codex, Gemini CLI, OpenCode, Pi, or Aider.
5. Arrange panels on the canvas or in the dock. The layout is saved per project.

The first use of a folder may ask for a trust decision. This is intentional:
project configuration must not start extensions or agents without explicit user
approval.

## Terminals and agents

Each terminal owns a PTY. openCate tracks states such as working, waiting for input,
finished, error, and stalled when the agent provides structured signals or a
supported screen fallback can infer them.

Terminals can have a custom name, star, tags, and color. These metadata, bounded
scrollback, and resume hints belong to the local session. openCate does not copy the
whole scrollback into the context bus or authorship audit.

## Worktrees and parallel missions

Use the worktree mission action to create a worktree, terminal, agent, and
initial task with one confirmation. Each worktree gets its own visual territory.
Review the diff, approve hunks when needed, and use the merge queue before
integrating.

Commits and pull requests are assisted actions: openCate checks the current state,
shows what will happen, and does not publish work without the confirmation
requested by the UI.

## Tasks, context, and memory

Workspace tasks can record an objective, constraints, dependencies, validated
result, short logs, and artifacts. Readiness is derived from completed
dependencies; parallelization is bounded by worktree.

Project memory is user-curated and requires a source citation. Use the context
bus to deliver a specific selection, file, or diff to another terminal. Graph
relations are created only after an explicit delivery.

The relevant `.cate/` files are:

- `workspace.json`: shareable project layout;
- `session.json`: local session state;
- `memory.json`: curated notes;
- `tasks.json`: task contracts;
- `agent-audit.json`: bounded authorship metadata without prompt content.

## Remote access

A workspace can use a local, SSH, or WSL runtime. The remote daemon runs PTYs,
Git, search, and authorized file operations on the remote host; the desktop
keeps the UI, canvas, editor, and browser. The connection uses an authenticated
tunnel and bounded automatic reconnect.

A drop can restore layout and scrollback, but it cannot revive an interactive
process that died with the daemon. See [Troubleshooting](TROUBLESHOOTING.md).

## Privacy and extensions

Usage telemetry and crash events are off by default and are sent only after
opt-in from Welcome or Settings. External feedback sends only a rating and
bounded metadata, never free-form text.

Extensions run in isolated webviews and should be enabled deliberately. Do not
paste tokens into tickets or screenshots. See [SECURITY_AUDIT.md](SECURITY_AUDIT.md)
for known limits and the threat model.

## Current limitations

- Canvas inside canvas is not supported by the current contract; canvases are
  independent panels in the dock or the main canvas.
- Restarting the daemon ends PTYs that are not protected by an external
  durability layer.
- Remote hosts need a compatible runtime and, for PTYs, a compatible `node-pty`
  build.

For automation, see [CLI_SDK.md](CLI_SDK.md).
