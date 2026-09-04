// =============================================================================
// cateCli (path helper) — resolves where the bundled `opencate` CLI lives on the
// runtime host. The CLI ships INSIDE the runtime tarball (opencate/ next to runtime/
// and pi/), so it is present the moment the daemon is provisioned. The
// env-injection layer prepends cateBinDir() to a terminal/agent shell's PATH so
// `opencate` is callable there.
// =============================================================================

import path from 'path'
import { existsSync } from 'fs'
import { installRoot } from './installRoot'

const CANONICAL_CLI_ROOT = 'opencate'
const LEGACY_CLI_ROOT = 'cate'

/** Directory holding the `opencate` / `opencate.cmd` launcher shims. Prepend
 *  this to a shell's PATH to make `opencate` callable. */
export function cateBinDir(): string {
  return path.join(installRoot(), CANONICAL_CLI_ROOT, 'bin')
}

/** The bundled CLI entry (opencate/dist/cli.cjs) the shims run under bundled node.
 *  Cross-platform JS — no win32 branch. */
export function cateCliPath(): string {
  return path.join(installRoot(), CANONICAL_CLI_ROOT, 'dist', 'cli.cjs')
}

/** Put the bundled `opencate` on a spawn env's PATH so agents and users can run it.
 *  Unconditional (not gated on CATE_API): the endpoint env is the real on/off
 *  switch, and keeping `opencate` on PATH while the endpoint is disabled means
 *  running it prints how to enable the setting (see the EnvError message in
 *  src/cli/cate.ts) instead of a discoverability-killing "command not found".
 *  Runs daemon-side (process.execPath == the tarball node), where cateBinDir()
 *  is correct for local and remote hosts. No-ops when the CLI dir is absent
 *  (dev/direct mode runs the daemon from source, with no extracted tarball).
 *  Finds the PATH key case-insensitively (Windows uses `Path`). */
export function catePathEnv(env: Record<string, string>): Record<string, string> {
  const binDir = presentBinDir()
  if (!binDir) return env
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'
  return { ...env, [key]: binDir + path.delimiter + (env[key] ?? '') }
}

/** cateBinDir() is invariant for the daemon's lifetime (installRoot never
 *  moves), so stat it once and cache the result — spawns are a hot path and
 *  shouldn't re-hit the filesystem. Returns the dir when present, else null. */
let cachedBinDir: string | null | undefined
function presentBinDir(): string | null {
  if (cachedBinDir === undefined) {
    const e2eBinDir = process.env.CATE_E2E === '1'
      ? process.env.CATE_E2E_CATE_BIN
      : undefined
    const candidates = e2eBinDir && existsSync(e2eBinDir)
      ? [e2eBinDir]
      : [cateBinDir(), path.join(installRoot(), LEGACY_CLI_ROOT, 'bin')]
    cachedBinDir = candidates.find((candidate) => existsSync(candidate)) ?? null
  }
  return cachedBinDir
}
