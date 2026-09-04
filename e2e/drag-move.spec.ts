import { test, expect } from '@playwright/test'
import {
  launchApp,
  closeApp,
  seedTerminal,
  resetViewport,
  setZoom,
  titleBarCentre,
  getNodeRect,
  getNodeOrigin,
  dragSnapshot,
  waitForGhost,
  beginCanvasDragFrom,
  dragCanvasFrom,
  endCanvasDrag,
} from './fixtures/electron-app'
import type { ElectronApplication, Page } from 'playwright'

let app: ElectronApplication
let page: Page

test.beforeEach(async () => {
  ;({ electronApp: app, mainWindow: page } = await launchApp())
  await resetViewport(page)
})
test.afterEach(async () => closeApp(app))

/* Drag-move regression coverage.
 * Reads `before` via the harness immediately before mousedown so any focus-pan
 * has already settled. Asserts canvas-origin delta — invariant under sidebar
 * width and viewport offset.
 */

test('moves a node within the canvas (zoom 1)', async () => {
  const nodeId = await seedTerminal(page, { x: 400, y: 300 })
  const before = await getNodeOrigin(page, nodeId)
  const grab = await titleBarCentre(page, nodeId)
  await dragCanvasFrom(
    page,
    `[data-node-id="${nodeId}"] [data-node-drag-spacer]`,
    grab!,
    { x: grab!.x + 200, y: grab!.y + 150 },
  )
  await page.waitForTimeout(150)
  const after = await getNodeOrigin(page, nodeId)
  expect(after!.x - before!.x).toBeCloseTo(200, -1)
  expect(after!.y - before!.y).toBeCloseTo(150, -1)
})

test('zoom-aware: canvas-space delta == screen-delta ÷ zoom (zoom 0.5)', async () => {
  const nodeId = await seedTerminal(page, { x: 400, y: 300 })
  await setZoom(page, 0.5)
  await page.waitForTimeout(400)
  // After zoom changes, the node visually shrinks — recompute grab.
  const grab2 = await titleBarCentre(page, nodeId)
  const before = await getNodeOrigin(page, nodeId)
  await dragCanvasFrom(
    page,
    `[data-node-id="${nodeId}"] [data-node-drag-spacer]`,
    grab2!,
    { x: grab2!.x + 100, y: grab2!.y + 60 },
  )
  await page.waitForTimeout(150)
  const after = await getNodeOrigin(page, nodeId)
  // Screen delta (100, 60) → canvas-space delta (200, 120) at zoom 0.5.
  expect(after!.x - before!.x).toBeCloseTo(200, -1)
  expect(after!.y - before!.y).toBeCloseTo(120, -1)
})

test('zoom-aware: canvas-space delta == screen-delta ÷ zoom (zoom 2)', async () => {
  const nodeId = await seedTerminal(page, { x: 400, y: 300 })
  await setZoom(page, 2)
  await page.waitForTimeout(400)
  const grab = await titleBarCentre(page, nodeId)
  const before = await getNodeOrigin(page, nodeId)
  const canvas = await page.locator('[data-canvas-container]').boundingBox()
  expect(canvas).not.toBeNull()
  // At 2x the node can extend past the window edge. Pick a known in-window
  // canvas point, then assert against the resulting screen delta ÷ zoom.
  const end = { x: canvas!.x + canvas!.width * 0.2, y: canvas!.y + canvas!.height * 0.5 }
  try {
    await beginCanvasDragFrom(
      page,
      `[data-node-id="${nodeId}"] [data-node-drag-spacer]`,
      grab!,
      end,
    )
    await expect.poll(() => dragSnapshot(page)).toMatchObject({
      isDragging: true,
      sourceKind: 'canvas-node',
      sourceNodeId: nodeId,
      targetKind: 'canvas-reposition',
    })
  } finally {
    await endCanvasDrag(page, end)
  }
  await page.waitForTimeout(150)
  const after = await getNodeOrigin(page, nodeId)
  expect(after!.x - before!.x).toBeCloseTo((end.x - grab!.x) / 2, -1)
  expect(after!.y - before!.y).toBeCloseTo((end.y - grab!.y) / 2, -1)
})

test('ghost follows cursor with the grab offset (zoom 1)', async () => {
  const nodeId = await seedTerminal(page, { x: 400, y: 300 })
  const rect = await getNodeRect(page, nodeId)
  const grabPoint = await titleBarCentre(page, nodeId)
  expect(rect).not.toBeNull()
  expect(grabPoint).not.toBeNull()
  const grabOffset = { x: grabPoint!.x - rect!.x, y: grabPoint!.y - rect!.y }
  try {
    const cursorNow = { x: grabPoint!.x + 250, y: grabPoint!.y + 180 }
    await beginCanvasDragFrom(
      page,
      `[data-node-id="${nodeId}"] [data-node-drag-spacer]`,
      grabPoint!,
      cursorNow,
      15,
    )
    await expect.poll(() => dragSnapshot(page)).toMatchObject({
      isDragging: true,
      sourceKind: 'canvas-node',
      sourceNodeId: nodeId,
    })
    const ghost = await waitForGhost(page)
    expect(ghost).not.toBeNull()
    // Ghost top-left = cursor - grabOffset (at zoom 1). Allow 2px slop for the
    // overlay's borders/padding rounding.
    expect(Math.abs(ghost!.x - (cursorNow.x - grabOffset.x))).toBeLessThan(3)
    expect(Math.abs(ghost!.y - (cursorNow.y - grabOffset.y))).toBeLessThan(3)
  } finally {
    await endCanvasDrag(page, { x: grabPoint!.x + 250, y: grabPoint!.y + 180 })
  }
})

test('source node is hidden while dragging', async () => {
  const nodeId = await seedTerminal(page, { x: 400, y: 300 })
  const grab = await titleBarCentre(page, nodeId)
  const end = { x: grab!.x + 100, y: grab!.y + 80 }
  try {
    await beginCanvasDragFrom(
      page,
      `[data-node-id="${nodeId}"] [data-node-drag-spacer]`,
      grab!,
      end,
      10,
    )
    await expect.poll(() => dragSnapshot(page)).toMatchObject({
      isDragging: true,
      sourceKind: 'canvas-node',
      sourceNodeId: nodeId,
    })
    await expect.poll(async () => parseFloat(await page.evaluate(
      (id) => getComputedStyle(document.querySelector(`[data-node-id="${id}"]`)!).opacity,
      nodeId,
    ))).toBe(0)
  } finally {
    await endCanvasDrag(page, end)
  }
})

test('tiny drag inside dead zone does not move the node', async () => {
  const nodeId = await seedTerminal(page, { x: 400, y: 300 })
  const before = await getNodeOrigin(page, nodeId)
  const grab = await titleBarCentre(page, nodeId)
  await dragCanvasFrom(
    page,
    `[data-node-id="${nodeId}"] [data-node-drag-spacer]`,
    grab!,
    { x: grab!.x + 2, y: grab!.y + 1 },
  )
  await page.waitForTimeout(80)
  const after = await getNodeOrigin(page, nodeId)
  expect(after!.x).toBeCloseTo(before!.x, 1)
  expect(after!.y).toBeCloseTo(before!.y, 1)
})

test('Cmd+Z restores position after a drag', async () => {
  const nodeId = await seedTerminal(page, { x: 400, y: 300 })
  const before = await getNodeOrigin(page, nodeId)
  const grab = await titleBarCentre(page, nodeId)
  await dragCanvasFrom(
    page,
    `[data-node-id="${nodeId}"] [data-node-drag-spacer]`,
    grab!,
    { x: grab!.x + 200, y: grab!.y + 150 },
  )
  await page.waitForTimeout(150)
  const moved = await getNodeOrigin(page, nodeId)
  expect(moved!.x - before!.x).toBeCloseTo(200, -1)
  await page.keyboard.press('Meta+Z')
  await page.waitForTimeout(200)
  const restored = await getNodeOrigin(page, nodeId)
  expect(restored!.x).toBeCloseTo(before!.x, 0)
  expect(restored!.y).toBeCloseTo(before!.y, 0)
})
