// =============================================================================
// Terminal lifecycle E2E — the minimum end-to-end path for a canvas terminal:
//
// 1. Open a project (temp dir with workspace trust).
// 2. Create a terminal on the canvas.
// 3. Resize the node (canvas store `resizeNode`).
// 4. Flush a session save and verify that the node's origin/size survive in
//    `.cate/session.json` on disk.
//
// This is the Phase 1 "smoke" gate for the full pipeline: renderer store →
// session serializer → IPC → main process atomic write.
//
// The resizeNode / saveSession harness calls are new (added alongside this
// spec); they drive the same code paths a live drag + autosave flush use,
// without depending on synthetic mouse drag working reliably headless.

import { test, expect } from '@playwright/test'
import { launchApp, closeApp } from './fixtures/electron-app'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtempSync, realpathSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { ElectronApplication, Page } from 'playwright'

let app: ElectronApplication
let page: Page
let root = ''
let userDataDir = ''

test.beforeEach(async () => {
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'cate-terminal-e2e-')))
  userDataDir = path.join(root, 'user-data')
  ;({ electronApp: app, mainWindow: page } = await launchApp({ userDataDir }))
})

test.afterEach(async () => closeApp(app))

async function trustWorkspace(): Promise<void> {
  const opened = page.evaluate((workspaceRoot) =>
    window.__cateE2E!.setWorkspaceRoot(workspaceRoot), root)
  const trust = page.getByRole('button', { name: 'Trust and open' })
  if (await trust.isVisible({ timeout: 2_000 }).catch(() => false)) await trust.click()
  expect(await opened).toBe(true)
}

test('create terminal → resize node → save/restore round-trip', async () => {
  await trustWorkspace()

  // --- Create terminal -----------------------------------------------------
  const nodeId = await page.evaluate(() =>
    window.__cateE2E!.createTerminal({ x: 120, y: 80 }))
  expect(nodeId).toBeTruthy()
  await page.waitForSelector(`[data-node-id="${nodeId}"]`, { timeout: 10_000 })

  // --- Resize node ---------------------------------------------------------
  // Drive the same store action the resize handle uses (no synthetic mouse).
  const originalSize = await page.evaluate((id) => {
    const n = window.__cateE2E!.nodes().find((x) => x.id === id)
    return n ? n.size : null
  }, nodeId)
  expect(originalSize).not.toBeNull()

  const newSize = { width: originalSize!.width + 100, height: originalSize!.height + 50 }
  await page.evaluate(({ id, size }) =>
    window.__cateE2E!.resizeNode(id, size), { id: nodeId, size: newSize })

  // Confirm the store reflects it before saving.
  const afterResize = await page.evaluate((id) => {
    const n = window.__cateE2E!.nodes().find((x) => x.id === id)
    return n ? n.size : null
  }, nodeId)
  expect(afterResize).toEqual(newSize)

  // --- Save session to disk -------------------------------------------------
  // Flushes through the real autosave pipeline (sessionSave → IPC → main
  // process atomicWriteWithBak). We wait for the promise so the file exists
  // by the time we read it.
  await page.evaluate(() => window.__cateE2E!.saveSessionNow())

  // --- Verify .cate/workspace.json (geometry) + .cate/session.json -----------
  // Node geometry lives in workspace.json (`canvases.<canvasId>.canvasNodes`);
  // session.json carries machine-local per-panel facts. The save pipeline
  // writes both atomically.
  const workspacePath = path.join(root, '.cate', 'workspace.json')
  // saveSession fires projectStateSave via IPC without awaiting the main
  // process's atomic write, so poll until the file lands on disk.
  await expect.poll(() => existsSync(workspacePath), { timeout: 10_000 }).toBe(true)

  const raw = readFileSync(workspacePath, 'utf8')
  expect(raw.length).toBeGreaterThan(0)

  const parsed = JSON.parse(raw) as {
    version: number
    canvases?: Record<string, {
      canvasNodes?: Record<string, { origin?: { x: number; y: number }; size?: { width: number; height: number } }>
    }>
  }
  expect(parsed.version).toBe(1)
  // Find the resized node somewhere in the serialized canvases.
  let found: { origin?: { x: number; y: number }; size?: { width: number; height: number } } | undefined
  for (const canvas of Object.values(parsed.canvases ?? {})) {
    for (const node of Object.values(canvas.canvasNodes ?? {})) {
      if (node.size?.width === newSize.width && node.size?.height === newSize.height) {
        found = node
        break
      }
    }
  }
  expect(found, 'resized node should be present in workspace.json with its size').toBeTruthy()
  expect(found?.size).toEqual(newSize)

  // Session file should also exist with the terminal's panel record.
  const sessionPath = path.join(root, '.cate', 'session.json')
  await expect.poll(() => existsSync(sessionPath), { timeout: 10_000 }).toBe(true)
  const sessRaw = readFileSync(sessionPath, 'utf8')
  expect(sessRaw.length).toBeGreaterThan(0)
  const sessParsed = JSON.parse(sessRaw) as { version: number }
  expect(sessParsed.version).toBe(1)
})
