---
name: cate-cli
description: Drive openCate browser, terminal, editor, panel, and coding-agent orchestration surfaces from a openCate terminal. Browser page automation uses native agent-browser command syntax.
user-invocable: true
---

# openCate CLI

`opencate` is available inside openCate terminals and agent shells. It talks to the
current workspace and requires the relevant Settings → CLI permission.

Start by listing panels:

```bash
opencate panel list
```

When working repeatedly with one panel, select it for the current agent or
terminal session:

```bash
opencate panel set 1a2b3c4d
opencate panel current
```

The selection is isolated by a per-terminal CLI session, so other agents and
terminals keep their own targets. Short ids from `panel list`
are accepted. Use `--panel <id>` only as a one-command override. Clear the
selection to return to openCate's automatic focused/grouped resolution:

```bash
opencate panel clear
```

Selections can point to any native panel. Browser and terminal commands reject
a selected panel of the wrong type instead of silently controlling another
panel. If a selected panel was closed, select another panel before continuing.

## Browser workflow

Inspect, act, wait, then inspect again:

```bash
opencate panel set 1a2b3c4d
opencate browser open https://example.com
opencate browser snapshot -i
opencate browser fill @s1e2 user@example.com
opencate browser click @s1e3
opencate browser wait --url '**/dashboard'
opencate browser snapshot -i
```

Page commands after `opencate browser` use agent-browser's native argv directly:

```bash
opencate browser snapshot -i --compact
opencate browser get text @s1e4
opencate browser find role button click
opencate browser fill '#email' user@example.com
opencate browser press Enter
opencate browser scroll down 600
opencate browser screenshot --full
opencate browser console
opencate browser errors
```

Do not use agent-browser's `open` semantics by assumption: openCate defines
`browser open` as opening a new tab. Use `navigate` only when replacing the
active tab is intentional:

```bash
opencate browser open https://second.example
opencate browser navigate https://replacement.example
opencate browser new-panel https://separate.example
```

openCate owns browser identity and presentation. Native session/CDP switching,
native tab management, upload/download paths, batch, setup, servers, and browser
startup flags are unavailable. Use openCate's lifecycle commands:

```bash
opencate browser tabs
opencate browser new-tab [url]
opencate browser select-tab <id>
opencate browser close-tab <id>
opencate browser viewport desktop
opencate browser viewport mobile
opencate browser viewport 1024 768
opencate browser viewport compact
opencate browser resize 640 480
```

The default compact viewport renders at 75% scale. Responsive viewport size and
canvas panel size are independent. `resize` applies only to canvas panels and
has a 400×300 minimum.

Snapshots come from agent-browser's accessibility tree. openCate wraps engine refs
with an observation revision, for example `@s1e4`. A new snapshot invalidates
older refs; take a fresh snapshot instead of retrying `stale-ref`.

Agent actions display a persistent cursor/highlight in the browser panel. User
input immediately takes control back. Screenshots are saved to a openCate-managed
temporary path and the CLI prints that path.

## Project data

The CLI endpoint is scoped to the workspace that created the terminal. Use the
project/task/context/result commands to inspect and update the durable records
under `.cate/`; these commands never copy terminal scrollback implicitly:

```bash
opencate project get
opencate task list
opencate task create "Document the release decision"
opencate task update <task-id> --data '{"status":"completed","validatedResult":"Verified"}'
opencate context list
opencate context create "Release decision" "Keep the rollout staged"
opencate result list
opencate result get <task-id>
```

`--data` accepts one JSON object for complete task/context drafts or partial
updates. Task and context writes have their own Settings → CLI **Project data →
Control** permission; reads use the **Read** cell. Result records are a
read-only projection of task state, and the API returns `{ items, total }` for
all list commands.

## TypeScript integrations

Node/Bun integrations can import the same typed client from `cate/sdk` after
the SDK artifact has been built:

```ts
import { createCateApiClient } from 'cate/sdk'

const opencate = createCateApiClient({
  baseUrl: process.env.CATE_API!,
  token: process.env.CATE_TOKEN!,
})

const project = await cate.project.get()
const tasks = await cate.tasks.list()
```

The client uses the workspace bearer token and is intentionally free of
Electron dependencies. Keep the token in the process environment and do not
log it; it grants the same first-party capabilities as the calling terminal.

## Other surfaces

```bash
opencate editor open src/app.tsx:42
opencate panel create terminal
opencate panel create canvas
opencate panel set <id>
opencate panel current
opencate panel clear
opencate panel close <id>
```

Read a terminal before sending input. `type` does not append Enter:

```bash
opencate panel set 1a2b3c4d
opencate terminal read
opencate terminal type npm test
opencate terminal press enter
```

Terminal input goes to whatever currently owns that PTY, including foreground
TUIs. Never send keys until the panel id and current screen are verified.

## Agent orchestration

Use `opencate agent` when a task benefits from visible, persistent delegation:
independent parallel work, cross-provider review, or isolated implementation in
a openCate worktree. Keep small, tightly coupled edits in the current agent.

Discover registered runs before acting on an older mission or after context
compaction:

```bash
opencate agent list
```

Create a worker with a bounded, self-contained prompt and concrete success
criteria. openCate chooses the first hook-ready registered agent when `--agent` is
omitted:

```bash
opencate agent create "Inspect the API boundary and report risks" --title "API scout"
opencate agent create "Implement the parser and run its focused tests" \
  --agent codex --title "Parser" --new-worktree agent/parser
opencate agent create "Review the current worktree changes" --worktree <worktree-id>
```

Workers may recursively create and supervise their own workers with the same
commands. This naturally forms an agent tree: each terminal owns the workers it
creates, and each parent normally communicates with its direct children. Use
recursion when another level of decomposition is genuinely useful, not merely
to relay a simple instruction.

Supervise workers through the agent lifecycle rather than typing into their
terminals:

```bash
opencate agent wait <run-id> [<run-id>...] --wait-timeout 10000
opencate agent inspect <run-id>
opencate agent send <run-id> "Please add the missing regression test"
opencate agent review <run-id>
opencate agent apply <run-id>
opencate agent keep <run-id>
opencate agent discard <run-id>
opencate agent stop <run-id>
```

Run ids may be the unique short ids printed by `opencate agent list`. `wait` accepts
5000–60000 milliseconds and may be called with no ids to monitor all live
direct children. Call it again while workers remain active. `inspect` includes
recent terminal output; use `opencate terminal read --panel <panel-id>` only as a
lower-level diagnostic fallback.

Prefer `send` for follow-up work on the same responsibility. If
`followUpSupported` is false, create a fresh worker instead. When a worker fails,
inspect `failureReason`; a provider-specific authentication, quota, or service
failure can justify retrying with a different registered `--agent`.

For an isolated worker, ask it to run relevant checks and commit completed work,
then use `review` before choosing `apply`, `keep`, or `discard`. Apply rechecks
that the worktree is clean and mergeable. Discard permanently removes a
worker-owned worktree and its branch, including uncommitted changes, without an
interactive confirmation. Keep records that the worktree should remain for
later. Review is read-only: a finished process or successful review does not
mean its branch has been integrated. The parent remains responsible for
verification and for reporting any uncommitted or unintegrated work.
