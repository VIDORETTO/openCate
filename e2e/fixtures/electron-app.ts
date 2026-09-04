// E2E fixture: launch the built Electron app with an isolated userData dir.
//
// Each spec calls `launchApp()` in beforeEach. CATE_E2E=1 causes:
//   - main process to point app.setPath('userData', tmpdir)
//   - renderer to install window.__cateE2E (see src/renderer/lib/e2eHarness.ts)

import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { buildSync, stop } from 'esbuild'

export interface LaunchResult {
  electronApp: ElectronApplication
  mainWindow: Page
}

const REPO_ROOT = path.resolve(__dirname, '..', '..')
let cateCliBin: string | null = null

async function currentCateCliBin(): Promise<string> {
  if (cateCliBin) return cateCliBin
  const root = mkdtempSync(path.join(tmpdir(), 'cate-e2e-cli-'))
  const cli = path.join(root, 'cli.cjs')
  try {
    buildSync({
      entryPoints: [path.join(REPO_ROOT, 'src', 'cli', 'cate.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node20',
      outfile: cli,
    })
  } finally {
    // buildSync starts esbuild's persistent service process. The bundle is
    // already on disk, so release it before the Playwright worker can exit.
    await stop()
  }
  const bin = path.join(root, 'bin')
  mkdirSync(bin)
  const launcher = path.join(bin, 'cate')
  writeFileSync(launcher, `#!/bin/sh\nexec "${process.execPath}" "${cli}" "$@"\n`)
  chmodSync(launcher, 0o755)
  writeFileSync(path.join(bin, 'cate.cmd'), `@echo off\r\n"${process.execPath}" "${cli}" %*\r\n`)
  cateCliBin = bin
  return bin
}

async function localRuntimeEnv(): Promise<Record<string, string>> {
  const version = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).version
  const tarballName = `cate-runtime-${version}-${process.platform}-${process.arch}.tgz`
  const roots = [REPO_ROOT, path.resolve(REPO_ROOT, '..', '..', '..')]
  const tarball = roots
    .map((root) => path.join(root, 'dist-runtime', tarballName))
    .find(existsSync)
  const bundle = path.join(REPO_ROOT, 'dist-runtime', 'runtime.cjs')
  return {
    CATE_E2E_CATE_BIN: await currentCateCliBin(),
    ...(tarball ? { CATE_E2E_RUNTIME_TARBALL: tarball } : {}),
    ...(existsSync(bundle) ? { CATE_E2E_RUNTIME_BUNDLE: bundle } : {}),
  }
}

export async function launchApp(opts: {
  perf?: boolean
  env?: Record<string, string>
  userDataDir?: string
} = {}): Promise<LaunchResult> {
  const env = {
    ...process.env,
    CATE_E2E: '1',
    NODE_ENV: 'production',
    ...(await localRuntimeEnv()),
    // Activate the resource profiler (main getAppMetrics sampler + counters,
    // renderer FPS/long-task/render counters, window.__catePerf) for the
    // perf-stress spec. Harmless no-op for other specs that don't set it.
    ...(opts.perf ? { CATE_PERF: '1' } : {}),
    ...(opts.userDataDir ? { CATE_E2E_USER_DATA: opts.userDataDir } : {}),
    ...opts.env,
  }
  // Playwright forces colored reporter output while some hosts also export
  // NO_COLOR. Passing both into a real terminal makes every bundled Node CLI
  // print a warning before its own stdout, which is not a Cate behavior.
  delete env.NO_COLOR
  let electronApp: ElectronApplication | undefined
  try {
    const launchedApp = await electron.launch({
      args: ['.'],
      cwd: REPO_ROOT,
      env,
    })
    electronApp = launchedApp
    const mainWindow = await launchedApp.firstWindow()
    await mainWindow.waitForLoadState('domcontentloaded')
    await mainWindow.waitForFunction(() => window.__cateE2E?.ready === true, { timeout: 15_000 })
    // The harness `ready` flag is set by its own effect the moment e2eHarness
    // installs — independent of App's async init(), which restores/creates the
    // workspace and mounts the Canvas. Wait for the Canvas to actually be in the
    // DOM so specs don't race a not-yet-mounted canvas (activeCanvasPanelId would
    // otherwise transiently return null right after launch).
    await mainWindow.waitForSelector('[data-canvas-panel-id]', { timeout: 15_000 })
    return { electronApp: launchedApp, mainWindow }
  } catch (error) {
    await closeApp(electronApp)
    throw error
  }
}

export async function closeApp(electronApp: ElectronApplication | undefined): Promise<void> {
  if (!electronApp) return
  const child = electronApp.process()
  const waitForExit = (): Promise<void> => {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
    return new Promise((resolve) => child.once('exit', () => resolve()))
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    // ElectronApplication.close() drives Electron's normal app.quit lifecycle
    // and drains Playwright's transport as part of the same operation. Calling
    // it only after app.quit leaves a protocol request pending against an
    // already-exited process, which keeps the Playwright worker alive.
    await Promise.race([
      Promise.all([electronApp.close(), waitForExit()]),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Electron close timed out')), 10_000)
      }),
    ])
  } catch {
    // A wedged runtime/PTY must not hold the entire Playwright worker open after
    // the assertions have completed. This child belongs exclusively to the
    // current isolated E2E app instance.
    await forceKillProcessTree(child)
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Kill the Playwright-launched Electron process and its Windows helper tree.
 * Node's child.kill() only targets the root on Windows, so GPU/renderer
 * children can otherwise keep an isolated E2E user-data directory and process
 * alive after the test worker has reported success. */
async function forceKillProcessTree(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (process.platform !== 'win32' || child.pid == null) {
    try { child.kill('SIGKILL') } catch { /* already exited */ }
    return
  }

  await new Promise<void>((resolve) => {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    killer.once('error', () => {
      try { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL') } catch { /* already exited */ }
      resolve()
    })
    killer.once('close', () => resolve())
  })
}

// -----------------------------------------------------------------------------
// Drag helpers
// -----------------------------------------------------------------------------

export async function dragMouse(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  opts: { steps?: number; holdDownMs?: number; pauseAtEnd?: number } = {},
): Promise<void> {
  const steps = opts.steps ?? 20
  // A hidden Electron window can lag one compositor turn behind Playwright's
  // final native mousemove. Give the renderer a small chance to arm/paint the
  // drag before mouseup; callers can still override this when they need a
  // longer settle for a drop-preview assertion.
  const pauseAtEnd = opts.pauseAtEnd ?? 50
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  if (opts.holdDownMs) await page.waitForTimeout(opts.holdDownMs)
  await page.mouse.move(to.x, to.y, { steps })
  if (pauseAtEnd) await page.waitForTimeout(pauseAtEnd)
  await page.mouse.up()
}

/**
 * Drive an in-window canvas drag without Electron's native hidden-window input
 * round trip. The target is still the element beneath the supplied point, so
 * React's real mousedown handler and the window-level drag runtime both run.
 * Keep this scoped to drag-move's geometry coverage; specs that exercise native
 * window-boundary behavior continue to use `dragMouse` above.
 */
export async function beginCanvasDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 20,
): Promise<void> {
  await page.evaluate(({ from: start, to: end, count }) => {
    const target = document.elementFromPoint(start.x, start.y)
    if (!target) throw new Error(`No drag target at ${start.x},${start.y}`)
    const mouse = (type: string, point: { x: number; y: number }, buttons: number) =>
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons,
        clientX: point.x,
        clientY: point.y,
        screenX: point.x,
        screenY: point.y,
      })
    target.dispatchEvent(mouse('mousedown', start, 1))
    for (let i = 1; i <= count; i++) {
      const progress = i / count
      window.dispatchEvent(mouse('mousemove', {
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress,
      }, 1))
    }
  }, { from, to, count: steps })
}

export async function endCanvasDrag(page: Page, point: { x: number; y: number }): Promise<void> {
  await page.evaluate((at) => {
    window.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 0,
      clientX: at.x,
      clientY: at.y,
      screenX: at.x,
      screenY: at.y,
    }))
  }, point)
  await page.waitForTimeout(50)
}

export async function dragCanvas(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 20,
): Promise<void> {
  await beginCanvasDrag(page, from, to, steps)
  await page.waitForTimeout(50)
  await endCanvasDrag(page, to)
}

/**
 * As dragCanvas, but starts from an explicit element rather than compositor
 * hit-testing. Hidden Electron windows do not reliably route native mouse input
 * or document.elementFromPoint, while this still invokes React's real handler
 * and the production window-level drag lifecycle.
 */
export async function beginCanvasDragFrom(
  page: Page,
  sourceSelector: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 20,
): Promise<void> {
  await page.evaluate(({ selector, from: start, to: end, count }) => {
    const target = document.querySelector(selector)
    if (!target) throw new Error(`No drag source for selector: ${selector}`)
    const mouse = (type: string, point: { x: number; y: number }, buttons: number) =>
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons,
        clientX: point.x,
        clientY: point.y,
        screenX: point.x,
        screenY: point.y,
      })
    target.dispatchEvent(mouse('mousedown', start, 1))
    for (let i = 1; i <= count; i++) {
      const progress = i / count
      window.dispatchEvent(mouse('mousemove', {
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress,
      }, 1))
    }
  }, { selector: sourceSelector, from, to, count: steps })
}

export async function dragCanvasFrom(
  page: Page,
  sourceSelector: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 20,
): Promise<void> {
  await beginCanvasDragFrom(page, sourceSelector, from, to, steps)
  await page.waitForTimeout(50)
  await endCanvasDrag(page, to)
}

export async function getNodeRect(
  page: Page,
  nodeId: string,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  const handle = await page.$(`[data-node-id="${nodeId}"]`)
  if (!handle) return null
  return handle.boundingBox()
}

export async function getNodeOrigin(
  page: Page,
  nodeId: string,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate((id) => {
    const n = window.__cateE2E?.nodes().find((x) => x.id === id)
    return n ? n.origin : null
  }, nodeId)
}

export async function seedTerminal(
  page: Page,
  point: { x: number; y: number } = { x: 200, y: 200 },
): Promise<string> {
  const hint = await page.evaluate((p) => window.__cateE2E!.createTerminal(p), point)
  // createTerminal returns the node id only if the canvas store has already
  // registered the node synchronously; under CI's throttled rAF that can lag,
  // in which case it returns the panel id instead. Resolve the real node id
  // from the live store (matching either) so we wait on the right selector.
  const nodeId = await page
    .waitForFunction(
      (h) => {
        const n = window.__cateE2E!.nodes().find((x) => x.id === h || x.panelId === h)
        return n ? n.id : null
      },
      hint,
      { timeout: 15_000 },
    )
    .then((handle) => handle.jsonValue() as Promise<string>)
  // Wait for the entering animation to settle so opacity/transform are at
  // their final values before tests interact with the node.
  await page.waitForSelector(`[data-node-id="${nodeId}"]`)
  await page.waitForTimeout(400)
  return nodeId
}

export async function seedCanvasPanel(
  page: Page,
  point: { x: number; y: number } = { x: 200, y: 200 },
): Promise<string> {
  return page.evaluate((p) => window.__cateE2E!.createCanvasPanel(p), point)
}

export async function setZoom(page: Page, zoom: number): Promise<void> {
  await page.evaluate((z) => window.__cateE2E!.setZoom(z), zoom)
  await page.waitForTimeout(80)
}

export async function resetViewport(page: Page): Promise<void> {
  await page.evaluate(() => window.__cateE2E!.resetViewport())
  await page.waitForTimeout(30)
}

export async function dragSnapshot(page: Page) {
  return page.evaluate(() => window.__cateE2E!.dragSnapshot())
}

export async function titleBarCentre(
  page: Page,
  nodeId: string,
): Promise<{ x: number; y: number } | null> {
  // The tab-bar spacer starts a whole-node drag with no panelId, unlike a tab
  // pill which may detach an individual tab from a multi-tab node.
  const spacer = page.locator(`[data-node-id="${nodeId}"] [data-node-drag-spacer]`).first()
  const rect = await spacer.boundingBox()
  if (!rect) return null
  return { x: rect.x + Math.min(50, rect.width / 2), y: rect.y + rect.height / 2 }
}

export async function waitForGhost(
  page: Page,
  timeout = 2000,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  try {
    const handle = await page.waitForSelector('[data-drag-overlay-ghost="true"]', {
      state: 'attached',
      timeout,
    })
    return handle.boundingBox()
  } catch {
    return null
  }
}

/** Pick the first canvas-node currently in the DOM. */
export async function firstNodeInfo(page: Page): Promise<{
  nodeId: string
  rect: { x: number; y: number; width: number; height: number }
  grab: { x: number; y: number }
} | null> {
  const handle = await page.$('[data-node-id]')
  if (!handle) return null
  const nodeId = (await handle.getAttribute('data-node-id')) ?? ''
  const rect = await handle.boundingBox()
  if (!rect) return null
  return {
    nodeId,
    rect,
    grab: { x: rect.x + rect.width / 2, y: rect.y + 14 },
  }
}
