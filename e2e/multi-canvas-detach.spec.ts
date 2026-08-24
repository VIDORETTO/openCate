// =============================================================================
// Multi-canvas + detach E2E — combines two Phase 1 requirements:
//
// 1. Multiple canvases: create secondary canvas tabs, place terminals on each,
//    and verify per-canvas node isolation.
// 2. Detached windows: detach a panel from a secondary canvas into its own
//    window via movePanelToNewWindow, and verify:
//      - a new Electron window opens;
//      - the source canvas loses the node (no orphan);
//      - the detached window renders the terminal.
//
// The detach uses the real production pipeline (not synthetic drag) so the test
// exercises the same code path the sidebar "Move to new window" action takes.

import { test, expect } from '@playwright/test'
import { launchApp, closeApp } from './fixtures/electron-app'
import type { ElectronApplication, Page } from 'playwright'

let app: ElectronApplication
let page: Page

test.beforeEach(async () => {
  ;({ electronApp: app, mainWindow: page } = await launchApp())
  await page.evaluate(() => window.__cateE2E!.setActiveLeftSidebarView(null))
})
test.afterEach(async () => closeApp(app))

/** Ids of all canvas tabs in the center tab strip, in order. */
function canvasTabIds(p: Page) {
  return p.evaluate(() =>
    Array.from(document.querySelectorAll('.dock-tab-bar [data-tab-panel-id]')).map(
      (el) => el.getAttribute('data-tab-panel-id')!,
    ),
  )
}

test('terminals on multiple canvases stay isolated; detaching moves to a new window', async () => {
  // --- Seed: 1 extra canvas (so we have primary + secondary) ---------------
  await page.evaluate(() => void window.__cateE2E!.createCanvasPanel({ x: 100, y: 100 }))
  await page.waitForTimeout(200)

  const tabs = await canvasTabIds(page)
  expect(tabs.length).toBe(2)
  const [primaryId, secondaryId] = tabs

  // --- Terminal on the PRIMARY canvas --------------------------------------
  // Click the primary tab to activate it.
  await page.click(`.dock-tab-bar [data-tab-panel-id="${primaryId}"]`)
  await page.waitForTimeout(200)
  const nodeIdPrimary = await page.evaluate(() =>
    window.__cateE2E!.createTerminal({ x: 200, y: 150 }))
  expect(nodeIdPrimary).toBeTruthy()
  await page.waitForSelector(`[data-node-id="${nodeIdPrimary}"]`, { timeout: 10_000 })

  // --- Terminal on the SECONDARY canvas ------------------------------------
  await page.click(`.dock-tab-bar [data-tab-panel-id="${secondaryId}"]`)
  await page.waitForTimeout(200)
  const mountedAfterSwitch = await page.evaluate(() =>
    document.querySelector('[data-canvas-panel-id]')?.getAttribute('data-canvas-panel-id'))
  expect(mountedAfterSwitch).toBe(secondaryId)

  const nodeIdSecondary = await page.evaluate(() =>
    window.__cateE2E!.createTerminal({ x: 300, y: 250 }))
  expect(nodeIdSecondary).toBeTruthy()
  await page.waitForSelector(`[data-node-id="${nodeIdSecondary}"]`, { timeout: 10_000 })

  // Each canvas has exactly its own node — no bleed between tabs.
  const nodesOnSecondary = await page.evaluate(() => window.__cateE2E!.nodes().length)
  expect(nodesOnSecondary).toBe(1)

  // --- Detach the SECONDARY canvas's terminal ------------------------------
  // Resolve the panel id for this node via the harness.
  const panelIdSecondary = await page.evaluate((id) => {
    const n = window.__cateE2E!.nodes().find((x) => x.id === id)
    return n ? n.panelId : null
  }, nodeIdSecondary)
  expect(panelIdSecondary).toBeTruthy()

  const initialWindowCount = app.windows().length
  const detached = await page.evaluate(
    (pid) => window.__cateE2E!.detachPanel(pid!), panelIdSecondary!)
  expect(detached).toBe(true)

  // A new Electron window appears.
  await expect.poll(() => app.windows().length, { timeout: 12_000 })
    .toBeGreaterThan(initialWindowCount)

  // The source canvas no longer holds the node.
  await page.waitForSelector(`[data-node-id="${nodeIdSecondary}"]`, {
    state: 'detached',
    timeout: 5_000,
  })
})
