# Troubleshooting openCate

## The app does not start

For a source checkout, verify the local toolchain and rebuild the runtime:

```bash
bun run setup
bun run typecheck
bun run build
bun run test:smoke:electron
```

If the smoke fails, keep the first error and the platform (Windows, macOS, or
Linux). Native `node-pty` binaries must match the runtime that loads them; do
not copy a binary built for another OS or architecture.

## A terminal opens and exits immediately

Check the configured shell, the workspace path, and whether the path exists on
the selected runtime. On a remote host, verify that the runtime can start the
requested shell and that its `node-pty` binary is available. A missing shell
should produce a fallback notice in the terminal rather than silently changing
the workspace.

## A workspace opens blank or does not restore

1. Confirm that the folder is trusted.
2. Check that `.cate/workspace.json` is valid and that the project was not
   opened read-only.
3. Use the workspace reload action after an external edit.
4. Preserve `.bak` files and the first error before attempting recovery.

`workspace.json` is project layout; `session.json` is machine-local session
state. A daemon restart can restore the latter's scrollback while still losing a
live interactive PTY.

## SSH or WSL keeps disconnecting

Check the host outside openCate first (`ssh host` or the WSL distribution), then
verify the runtime archive and the workspace path on that host. Reconnect is
bounded; after the retry limit, reconnect manually from the runtime controls.
The runtime telemetry history records connection lifecycle events without
capturing terminal output or credentials.

Do not include private keys, bearer tokens, or full environment dumps in a bug
report. Redact hostnames and paths when they identify a private system.

## Extensions or browser panels are blocked

Trust the workspace and enable the extension explicitly. Browser and extension
webviews intentionally reject unsafe navigation, arbitrary preload scripts, and
unapproved popups. A blocked URL is not evidence that sandboxing should be
disabled.

## CLI or SDK cannot connect

The CLI must run in a openCate terminal or receive the endpoint and bearer token
provided by openCate. Check the CLI permission rows for project read/control and
the caller's scope. SDK callers should handle both `CateApiError` (an in-band
API error) and `CateApiTransportError` (connection/timeout failure).

See [CLI_SDK.md](CLI_SDK.md) for bounded commands and examples.

## Running validation locally

Use focused validation first, then the broader gates:

```bash
bun run typecheck
bun run lint
bun run test
bun run build
bun run test:smoke:electron
```

The 50+ PTY and territory measurements are opt-in and hardware-sensitive:

```bash
CATE_PERF=1 CATE_PERF_50=1 bunx playwright test e2e/perf-stress.spec.ts --workers=1
```

Repeat performance measurements on each target OS before treating them as a
release claim.
