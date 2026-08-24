#!/usr/bin/env node
// Cross-platform replacement for patch-electron-name.sh.
//
// 1. Restore exec bit on node-pty's spawn-helper and ripgrep's rg — npm
//    sometimes strips it during extraction, causing posix_spawnp to fail.
//    POSIX-only: Windows ignores the exec bit and uses PATHEXT instead.
// 2. Ensure Electron's binary is present before we try to launch it. pnpm
//    blocks dependency build scripts by default, so a fresh worktree install
//    leaves the `electron` package without its downloaded binary — no dist/
//    or path.txt — and `electron-vite dev` then fails with "Error: Electron
//    uninstall". Materialize it directly via Electron's own installer (the
//    download is cached globally, so this is ~1s after the first
//    machine-wide install). This is a no-op on npm installs where the binary
//    is already in place.
// 3. Patch Electron.app Info.plist so macOS dock shows "Cate" instead of
//    "Electron". Uses /usr/libexec/PlistBuddy (macOS system tool).

import { chmodSync, copyFileSync, existsSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const isPosix = process.platform !== 'win32'
const isMac = process.platform === 'darwin'
const root = process.cwd()

function restoreExecBit(relativeGlobBase, binaryName) {
  if (!isPosix) return // exec bit is meaningless on Windows
  const base = path.join(root, relativeGlobBase)
  if (!existsSync(base)) return
  try {
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const target = path.join(base, entry.name, binaryName)
      try {
        chmodSync(target, 0o755)
      } catch {
        // File may not exist in every platform variant; safe to skip.
      }
    }
  } catch {
    // Directory listing failure is non-fatal.
  }
}

// 1. Restore exec bits on POSIX.
restoreExecBit('node_modules/node-pty/prebuilds', 'spawn-helper')
restoreExecBit('node_modules/@vscode/ripgrep', 'rg')
// @vscode/ripgrep ships per-platform packages too (@vscode/ripgrep-win32-x64 etc).
if (isPosix) {
  try {
    const vscodeDir = path.join(root, 'node_modules', '@vscode')
    const { readdirSync } = await import('node:fs')
    for (const entry of readdirSync(vscodeDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('ripgrep-')) continue
      const rgPath = path.join(vscodeDir, entry.name, 'bin', 'rg')
      try { chmodSync(rgPath, 0o755) } catch { /* absent on this platform */ }
    }
  } catch { /* @vscode dir may not exist */ }
}

// 2. Ensure Electron binary exists.
const electronDist = path.join(root, 'node_modules', 'electron', 'dist')
const electronInstall = path.join(root, 'node_modules', 'electron', 'install.js')
if (!existsSync(electronDist) && existsSync(electronInstall)) {
  console.log('[patch-electron-name] Electron binary missing — installing…')
  execFileSync(process.execPath, [electronInstall], { stdio: 'inherit' })
}

// 3. Patch macOS Info.plist.
if (isMac) {
  const plist = path.join(electronDist, 'Electron.app', 'Contents', 'Info.plist')
  const plistBuddy = '/usr/libexec/PlistBuddy'
  if (existsSync(plist) && existsSync(plistBuddy)) {
    const setKey = (key, value) => {
      try {
        execFileSync(plistBuddy, ['-c', `Set ${key} ${value}`, plist], { stdio: 'pipe' })
      } catch { /* key may not exist yet */ }
    }
    setKey('CFBundleDisplayName', 'Cate')
    setKey('CFBundleName', 'Cate')
    // Also replace the .icns (may not exist before first icon generation).
    const iconSource = path.join(root, 'build', 'icon.icns')
    if (existsSync(iconSource)) {
      try {
        copyFileSync(iconSource, path.join(path.dirname(plist), '..', 'Resources', 'electron.icns'))
      } catch { /* best effort */ }
    }
  }
}
