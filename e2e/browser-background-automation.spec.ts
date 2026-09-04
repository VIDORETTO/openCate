import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { closeApp, launchApp } from './fixtures/electron-app'

let app: ElectronApplication
let page: Page
let browserFixtureRoot: string | undefined
let browserHttpServer: ReturnType<typeof createServer> | undefined

async function expectSurfaceAligned(panelId: string): Promise<void> {
  await expect.poll(
    () => page.evaluate((id) => {
      const slot = document.querySelector(`[data-browser-surface-slot="${id}"]`)
      const surface = document.querySelector(`[data-browser-surface="${id}"]`)
      if (!(slot instanceof HTMLElement) || !(surface instanceof HTMLElement)) {
        return { aligned: false, visible: surface?.dataset.browserSurfaceVisible ?? 'missing' }
      }
      const slotRect = slot.getBoundingClientRect()
      const surfaceRect = surface.getBoundingClientRect()
      const slotGeometry = { x: slotRect.x, y: slotRect.y, width: slotRect.width, height: slotRect.height }
      const surfaceGeometry = { x: surfaceRect.x, y: surfaceRect.y, width: surfaceRect.width, height: surfaceRect.height }
      const aligned = (['x', 'y', 'width', 'height'] as const)
        .every((key) => Math.abs(slotGeometry[key] - surfaceGeometry[key]) < 1)
      return { aligned, visible: surface.dataset.browserSurfaceVisible, slot: slotGeometry, surface: surfaceGeometry }
    }, panelId),
    { timeout: 5_000 },
  ).toMatchObject({ aligned: true, visible: 'true' })
}

test.beforeEach(async () => {
  ;({ electronApp: app, mainWindow: page } = await launchApp())
})

test.afterEach(async () => {
  if (app) await closeApp(app)
  if (browserFixtureRoot) {
    await rm(browserFixtureRoot, { recursive: true, force: true })
    browserFixtureRoot = undefined
  }
  if (browserHttpServer) {
    const server = browserHttpServer
    browserHttpServer = undefined
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  }
})

test('agent-browser controls a mounted webview while its workspace is inactive', async () => {
  test.setTimeout(60_000)
  const url = `data:text/html,${encodeURIComponent(
    '<title>Background Automation</title><label for="name">Name</label><input id="name"><button id="ready">Ready</button>',
  )}`
  const browser = await page.evaluate((fixtureUrl) => (
    window.__cateE2E!.createBrowser(fixtureUrl, { x: 120, y: 120 })
  ), url)

  await expect.poll(
    () => page.evaluate(({ workspaceId, panelId }) => window.__cateE2E!.browserInvoke(
      workspaceId,
      'readCommand',
      { panelId, command: ['snapshot', '-i'] },
    ), browser),
    { timeout: 15_000 },
  ).toMatchObject({
    ok: true,
    result: { snapshot: expect.stringContaining('button "Ready"') },
  })
  const originalWebContentsId = await expect.poll(
    () => page.evaluate((panelId) => window.__cateE2E!.browserWebContentsId(panelId), browser.panelId),
    { timeout: 15_000 },
  ).not.toBeNull().then(() => page.evaluate(
    (panelId) => window.__cateE2E!.browserWebContentsId(panelId),
    browser.panelId,
  ))
  await expect(page.evaluate(({ workspaceId, panelId }) => window.__cateE2E!.browserInvoke(
    workspaceId,
    'command',
    { panelId, command: ['fill', '#name', 'Before workspace switch'] },
  ), browser)).resolves.toMatchObject({ ok: true })
  await expectSurfaceAligned(browser.panelId)

  const otherWorkspace = await page.evaluate(() => window.__cateE2E!.addWorkspace('Other workspace'))
  await page.evaluate((workspaceId) => window.__cateE2E!.selectWorkspace(workspaceId), otherWorkspace)

  await expect.poll(
    () => page.evaluate(({ workspaceId, panelId }) => window.__cateE2E!.browserInvoke(
      workspaceId,
      'readCommand',
      { panelId, command: ['get', 'url'] },
    ), browser),
    { timeout: 15_000 },
  ).toEqual({ ok: true, result: { url } })

  expect(await page.evaluate(
    (panelId) => window.__cateE2E!.browserWebContentsId(panelId),
    browser.panelId,
  )).toBe(originalWebContentsId)
  await expect(page.evaluate(({ workspaceId, panelId }) => window.__cateE2E!.browserInvoke(
    workspaceId,
    'command',
    { panelId, command: ['fill', '#name', 'Filled from another workspace'] },
  ), browser)).resolves.toMatchObject({ ok: true })

  await page.evaluate((workspaceId) => window.__cateE2E!.selectWorkspace(workspaceId), browser.workspaceId)
  expect(await page.evaluate(
    (panelId) => window.__cateE2E!.browserWebContentsId(panelId),
    browser.panelId,
  )).toBe(originalWebContentsId)
  await expectSurfaceAligned(browser.panelId)
  await expect(page.evaluate(({ workspaceId, panelId }) => window.__cateE2E!.browserInvoke(
    workspaceId,
    'readCommand',
    { panelId, command: ['get', 'value', '#name'] },
  ), browser)).resolves.toEqual({
    ok: true,
    result: { value: 'Filled from another workspace' },
  })
})

test('BrowserPanel follows an HTTP loopback page through its real guest and CDP bridge', async () => {
  test.setTimeout(60_000)
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end('<!doctype html><title>HTTP Browser Fixture</title><button id="ready">HTTP Ready</button>')
  })
  browserHttpServer = server
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('HTTP fixture did not expose a port')
  const url = `http://127.0.0.1:${address.port}/`
  const browser = await page.evaluate((fixtureUrl) => (
    window.__cateE2E!.createBrowser(fixtureUrl, { x: 120, y: 120 })
  ), url)

  await expect.poll(
    () => page.evaluate(({ workspaceId, panelId }) => window.__cateE2E!.browserInvoke(
      workspaceId,
      'readCommand',
      { panelId, command: ['snapshot', '-i'] },
    ), browser),
    { timeout: 15_000 },
  ).toMatchObject({
    ok: true,
    result: { snapshot: expect.stringContaining('HTTP Ready') },
  })
  await expect(page.evaluate(({ workspaceId, panelId }) => window.__cateE2E!.browserInvoke(
    workspaceId,
    'readCommand',
    { panelId, command: ['get', 'url'] },
  ), browser)).resolves.toEqual({ ok: true, result: { url } })
})

test('BrowserPanel opens an OAuth-like HTTP popup in a real Electron window', async () => {
  test.setTimeout(60_000)
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    if (requestUrl.pathname === '/oauth') {
      response.end('<!doctype html><title>OAuth Popup</title><main>OAuth Ready</main>')
      return
    }
    response.end('<!doctype html><title>OAuth Start</title><a id="oauth" href="/oauth" target="_blank">Continue</a>')
  })
  browserHttpServer = server
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('OAuth fixture did not expose a port')
  const url = `http://127.0.0.1:${address.port}/`
  const popupUrl = `http://127.0.0.1:${address.port}/oauth`
  const browser = await page.evaluate((fixtureUrl) => (
    window.__cateE2E!.createBrowser(fixtureUrl, { x: 120, y: 120 })
  ), url)

  await expect.poll(
    () => page.evaluate(({ workspaceId, panelId }) => window.__cateE2E!.browserInvoke(
      workspaceId,
      'readCommand',
      { panelId, command: ['snapshot', '-i'] },
    ), browser),
    { timeout: 15_000 },
  ).toMatchObject({
    ok: true,
    result: { snapshot: expect.stringContaining('Continue') },
  })

  const popupPromise = app.waitForEvent('window')
  await expect(page.evaluate(({ workspaceId, panelId }) => window.__cateE2E!.browserInvoke(
    workspaceId,
    'command',
    { panelId, command: ['click', '#oauth'] },
  ), browser)).resolves.toMatchObject({ ok: true })
  const popup = await popupPromise
  await popup.waitForLoadState('domcontentloaded')
  await expect(popup).toHaveURL(popupUrl)
  await expect(popup.locator('body')).toContainText('OAuth Ready')
  await popup.close()
})

test('BrowserPanel loads a local file through its real guest and CDP bridge', async () => {
  test.setTimeout(60_000)
  browserFixtureRoot = await mkdtemp(join(tmpdir(), 'cate-browser-file-'))
  const fixturePath = join(browserFixtureRoot, 'index.html')
  await writeFile(
    fixturePath,
    '<!doctype html><title>Local Browser Fixture</title><button id="ready">Local Ready</button>',
    'utf8',
  )
  const url = pathToFileURL(fixturePath).href
  const browser = await page.evaluate((fixtureUrl) => (
    window.__cateE2E!.createBrowser(fixtureUrl, { x: 120, y: 120 })
  ), url)

  await expect.poll(
    () => page.evaluate(({ workspaceId, panelId }) => window.__cateE2E!.browserInvoke(
      workspaceId,
      'readCommand',
      { panelId, command: ['snapshot', '-i'] },
    ), browser),
    { timeout: 15_000 },
  ).toMatchObject({
    ok: true,
    result: { snapshot: expect.stringContaining('Local Ready') },
  })
  await expect.poll(
    () => page.evaluate((panelId) => window.__cateE2E!.browserWebContentsId(panelId), browser.panelId),
    { timeout: 15_000 },
  ).not.toBeNull()
  await expect(page.evaluate(({ workspaceId, panelId }) => window.__cateE2E!.browserInvoke(
    workspaceId,
    'readCommand',
    { panelId, command: ['get', 'url'] },
  ), browser)).resolves.toEqual({ ok: true, result: { url } })
})
