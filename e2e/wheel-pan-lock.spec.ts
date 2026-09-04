// =============================================================================
// The wheel-pan is the one gesture lock owner with no button held: it acquires
// on the first wheel tick and releases on a 150ms quiet timer, so its accounting
// is the most fragile. This drives it hard over a terminal with a large
// scrollback — focused (panel scrolls), unfocused (canvas wheel-pans), wheel
// interleaved with a panel drag, and a workspace switch mid-scroll — and asserts
// the lock never strands.
//
// The watchdog's warning is the detector: if it fires, a stranded
// `canvas-interacting` hold just happened and the message names the owner.
// =============================================================================
import { test, expect } from '@playwright/test'
import { launchApp, closeApp, seedTerminal, getNodeRect, resetViewport } from './fixtures/electron-app'
import type { ElectronApplication, Page } from 'playwright'

let app: ElectronApplication
let page: Page
let warnings: string[] = []

test.beforeEach(async () => {
  ;({ electronApp: app, mainWindow: page } = await launchApp())
  warnings = []
  page.on('console', (m) => {
    const t = m.text()
    if (t.includes('gestureLockWatchdog')) warnings.push(t)
  })
})
test.afterEach(async () => closeApp(app))

const lockHeld = (p: Page) =>
  p.evaluate(() => document.body.classList.contains('canvas-interacting'))

/** Dispatch through the page's DOM event path. Native Electron wheel injection
 * waits on the hidden test window's compositor after very large xterm
 * scrollbacks; the DOM path exercises the same xterm/canvas handlers without
 * making this gesture-lock stress test depend on that compositor round-trip. */
async function dispatchWheel(
  p: Page,
  point: { x: number; y: number },
  deltaY: number,
): Promise<void> {
  await p.evaluate(({ x, y, deltaY: dy }) => {
    // The native helper intentionally clicks just beyond the panel in the
    // window chrome to defocus it; that coordinate can be outside the DOM
    // viewport even though Electron accepts the native click. Route that case
    // through the canvas container so the canvas handler still receives the
    // same bubbling event.
    const target = document.elementFromPoint(x, y)
      ?? document.querySelector('[data-canvas-container]')
    if (!target) throw new Error(`wheel target missing at ${x},${y}`)
    target.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      deltaY: dy,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
    }))
  }, { ...point, deltaY })
}

/** Fill the terminal's scrollback with a lot of lines. */
async function flood(p: Page, nodeId: string, lines: number) {
  // Run a real command so the output flows through the PTY at full rate — a
  // direct write() is swallowed by the shell's line discipline.
  const command = process.platform === 'win32'
    ? `for /L %i in (1,1,${lines}) do @echo line %i ${'y'.repeat(150)}\r`
    : `for i in $(seq 1 ${lines}); do printf 'line %s ${'y'.repeat(150)}\\n' "$i"; done\r`
  const ok = await p.evaluate(
    ({ id, n }) =>
      window.__cateE2E!.writeTerminal(
        id,
        n,
      ),
    { id: nodeId, n: command },
  )
  // Wait for the buffer to stop growing.
  let last = -1
  for (let i = 0; i < 40; i++) {
    await p.waitForTimeout(1000)
    const len = await p.evaluate((x) => window.__cateE2E!.terminalText(x)?.length ?? 0, nodeId)
    if (len === last) break
    last = len
  }
  return ok
}

test('scrolling a terminal with a huge scrollback does not strand the gesture lock', async () => {
  const nodeId = await seedTerminal(page, { x: 200, y: 200 })
  await page.waitForTimeout(2500) // let the PTY spawn

  const wrote = await flood(page, nodeId, 8000)
  const len = await page.evaluate((id) => window.__cateE2E!.terminalText(id)?.length ?? 0, nodeId)
  console.log('flood accepted:', wrote, '| buffer chars:', len)

  const r = (await getNodeRect(page, nodeId))!
  const cx = r.x + r.width / 2
  const cy = r.y + r.height / 2

  // --- focused terminal: wheel should scroll the panel, not touch the lock ---
  await page.mouse.click(cx, cy)
  await page.waitForTimeout(300)
  const focusedPoint = { x: cx, y: cy }
  for (let i = 0; i < 60; i++) await dispatchWheel(page, focusedPoint, -240)
  await page.waitForTimeout(200)
  console.log('after focused up-scroll   | lock:', await lockHeld(page))
  for (let i = 0; i < 60; i++) await dispatchWheel(page, focusedPoint, 240)
  await page.waitForTimeout(200)
  console.log('after focused down-scroll | lock:', await lockHeld(page))

  // --- unfocused terminal: wheel drives the canvas wheel-pan (which DOES take
  //     the lock, with a 150ms quiet-timer release) ---
  const unfocusedPoint = { x: 1100, y: 800 }
  await page.mouse.click(unfocusedPoint.x, unfocusedPoint.y) // defocus
  await page.waitForTimeout(300)
  for (let i = 0; i < 60; i++) await dispatchWheel(page, unfocusedPoint, 200)
  await page.waitForTimeout(600)
  console.log('after unfocused scroll    | lock:', await lockHeld(page))
  // The trackpad-shaped synthetic events intentionally stress canvas panning;
  // restore the viewport before the next phase so its drag target remains
  // addressable after the large pan.
  await resetViewport(page)

  // --- rapid alternation: scroll, then immediately grab the panel ---
  let pointer = unfocusedPoint
  for (let round = 0; round < 5; round++) {
    pointer = unfocusedPoint
    for (let i = 0; i < 20; i++) await dispatchWheel(page, pointer, -200)
    // Keep the next drag target addressable. These synthetic events are
    // intentionally trackpad-shaped, so each sweep pans the canvas by 4,000
    // px; the lock assertion does not require retaining that accumulated pan.
    await page.waitForTimeout(100)
    await resetViewport(page)
    await expect.poll(() => getNodeRect(page, nodeId), { timeout: 2_000 }).not.toBeNull()
    const rect = (await getNodeRect(page, nodeId))!
    const dragStart = { x: rect.x + rect.width / 2, y: rect.y + 6 }
    await page.mouse.move(dragStart.x, dragStart.y)
    await page.mouse.down()
    pointer = { x: dragStart.x + 30, y: rect.y + 20 }
    await page.mouse.move(pointer.x, pointer.y, { steps: 3 })
    await dispatchWheel(page, pointer, 200) // wheel DURING the drag
    await page.mouse.up()
    await page.waitForTimeout(150)
  }
  await page.waitForTimeout(600)
  console.log('after scroll+drag rounds  | lock:', await lockHeld(page))

  // --- scroll, then switch workspace mid-flight ---
  const wsB = await page.evaluate(() => window.__cateE2E!.addWorkspace('B'))
  for (let i = 0; i < 20; i++) await dispatchWheel(page, pointer, -200)
  await page.evaluate((id) => window.__cateE2E!.selectWorkspace(id), wsB)
  await page.waitForTimeout(1500)
  console.log('after scroll+ws switch    | lock:', await lockHeld(page))

  await page.waitForTimeout(2000) // give the watchdog room to report a leak
  console.log('watchdog warnings:', warnings.length ? warnings : 'none')
  expect(warnings, `watchdog fired — a leak occurred:\n${warnings.join('\n')}`).toEqual([])
  expect(await lockHeld(page)).toBe(false)
})
