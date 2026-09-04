// =============================================================================
// A stranded `canvas-interacting` lock used to wedge canvas input for the rest
// of the session — panels stopped scrolling, the canvas stopped panning, and
// click-to-focus stopped working, while edge/dock resize kept working. Only an
// app restart cleared it, because a refcounted lock can only be released by the
// owner that took it, and that owner's release closure was gone.
//
// The watchdog is the recovery net. This drives the real app: strand the lock,
// confirm panel drags are refused while it is held, then confirm the app heals
// itself and drags work again — no restart.
// =============================================================================

import { test, expect } from '@playwright/test'
import {
  launchApp,
  closeApp,
  seedTerminal,
  getNodeRect,
  titleBarCentre,
  beginCanvasDragFrom,
  dragCanvasFrom,
  endCanvasDrag,
} from './fixtures/electron-app'
import type { ElectronApplication, Page } from 'playwright'

let app: ElectronApplication
let page: Page

test.beforeEach(async () => {
  ;({ electronApp: app, mainWindow: page } = await launchApp())
})
test.afterEach(async () => closeApp(app))

const lockHeld = (p: Page) =>
  p.evaluate(() => document.body.classList.contains('canvas-interacting'))

/** Drag the node by its grab strip; returns how far it actually moved. */
async function dragNode(p: Page, nodeId: string, dx: number): Promise<number> {
  const before = await getNodeRect(p, nodeId)
  if (!before) throw new Error('node has no rect')
  const grab = await titleBarCentre(p, nodeId)
  if (!grab) throw new Error('node has no drag spacer')
  await dragCanvasFrom(
    p,
    `[data-node-id="${nodeId}"] [data-node-drag-spacer]`,
    grab,
    { x: grab.x + dx, y: grab.y },
    10,
  )
  await p.waitForTimeout(250)
  const after = await getNodeRect(p, nodeId)
  return after ? after.x - before.x : 0
}

test('a stranded gesture lock recovers without restarting the app', async () => {
  const nodeId = await seedTerminal(page, { x: 200, y: 200 })
  expect(await lockHeld(page)).toBe(false)
  expect(await dragNode(page, nodeId, 100)).toBeGreaterThan(50)

  // Strand the lock the way a leaked gesture owner does.
  await page.evaluate(() => document.body.classList.add('canvas-interacting'))
  expect(await lockHeld(page)).toBe(true)

  // While held, useDragOp refuses to start a drag — this is the wedged state.
  // (Checked immediately, before the watchdog's idle grace elapses.)
  const wedgedBefore = await getNodeRect(page, nodeId)
  const wedgedGrab = await titleBarCentre(page, nodeId)
  const wedgedEnd = { x: wedgedGrab!.x + 100, y: wedgedGrab!.y }
  await beginCanvasDragFrom(
    page,
    `[data-node-id="${nodeId}"] [data-node-drag-spacer]`,
    wedgedGrab!,
    wedgedEnd,
    4,
  )
  const wedgedMid = await getNodeRect(page, nodeId)
  expect(wedgedMid!.x).toBe(wedgedBefore!.x)
  await endCanvasDrag(page, wedgedEnd)

  // The watchdog notices the pointer is idle while the lock is still held.
  await expect.poll(() => lockHeld(page), { timeout: 6000 }).toBe(false)

  // Input is live again — no restart involved.
  expect(await dragNode(page, nodeId, 100)).toBeGreaterThan(50)
})
