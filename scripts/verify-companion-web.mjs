import { spawn } from 'node:child_process'
import { webcrypto } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const viteCli = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const viteConfig = fileURLToPath(new URL('../companion-web/vite.config.mjs', import.meta.url))
const companionUrl = process.env.CATE_COMPANION_WEB_URL ?? 'http://127.0.0.1:4173/'
let preview
let browser
try {
  if (!process.env.CATE_COMPANION_WEB_URL) {
    await runProcess(process.execPath, [viteCli, 'build', '--config', viteConfig])
    preview = spawn(process.execPath, [viteCli, 'preview', '--config', viteConfig, '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
      cwd: repoRoot,
      stdio: 'inherit',
      windowsHide: true,
    })
    await waitForPreview(companionUrl, preview)
  }

  const subtle = webcrypto.subtle
  const pair = await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )
  const publicJwk = await subtle.exportKey('jwk', pair.publicKey)
  const invitation = {
    version: 1,
    pairingId: 'pairing-browser-smoke',
    workspaceId: 'workspace-browser-smoke',
    relayUrl: 'https://relay.example.test',
    channelId: 'channel-browser-smoke',
    relayToken: 'relay-token',
    sessionId: 'session-browser-smoke',
    hostPublicKey: `jwk1.${base64Url(JSON.stringify(publicJwk))}`,
    expiresAt: Date.now() + 120_000,
  }

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(companionUrl, { waitUntil: 'networkidle' })
  await page.getByLabel('Invitation URI or JSON').fill(JSON.stringify(invitation))
  await page.getByLabel('Six-digit code').fill('123456')
  await page.getByRole('button', { name: 'Generate pairing proof' }).click()
  await page.getByText('Proof to paste into openCate desktop').waitFor()
  await page.getByText('Identity stored locally').waitFor()
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker?.getRegistration()
    return Boolean(registration?.active && navigator.serviceWorker.controller)
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByText('Identity stored locally').waitFor()
  await page.context().setOffline(true)
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByText('Identity stored locally').waitFor()
  } catch (cause) {
    const diagnostics = await page.evaluate(async () => ({
      readyState: document.readyState,
      bodyText: document.body.innerText.slice(0, 240),
      controller: navigator.serviceWorker?.controller?.scriptURL ?? null,
      registrations: navigator.serviceWorker
        ? (await navigator.serviceWorker.getRegistrations()).map((registration) => ({
          active: registration.active?.scriptURL ?? null,
          scope: registration.scope,
        }))
        : [],
      caches: typeof caches === 'undefined' ? [] : await Promise.all(
        (await caches.keys()).map(async (key) => {
          const cache = await caches.open(key)
          return { key, urls: (await cache.keys()).map((request) => request.url) }
        }),
      ),
    })).catch(() => null)
    throw new Error(`${cause instanceof Error ? cause.message : String(cause)}; offline diagnostics: ${JSON.stringify(diagnostics)}`)
  } finally {
    await page.context().setOffline(false)
  }
  await page.getByRole('button', { name: 'Forget browser identity' }).click()
  await page.getByText('No device identity yet').waitFor()
  console.log('companion-web browser persistence: passed')
} finally {
  if (browser) await browser.close()
  await stopProcess(preview)
}

function runProcess(command, args) {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, args, { cwd: repoRoot, stdio: 'inherit', windowsHide: true })
    child.on('error', rejectProcess)
    child.on('exit', (code, signal) => {
      if (code === 0) resolveProcess()
      else rejectProcess(new Error(`${command} exited with ${signal ? `signal ${signal}` : `code ${code}`}`))
    })
  })
}

async function waitForPreview(url, child) {
  const deadline = Date.now() + 15_000
  let lastError
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`companion preview exited with code ${child.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await delay(100)
  }
  throw new Error(`companion preview did not become ready${lastError instanceof Error ? `: ${lastError.message}` : ''}`)
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolveProcess) => child.once('exit', resolveProcess)),
    delay(2_000),
  ])
  if (child.exitCode === null) child.kill('SIGKILL')
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}

function base64Url(value) {
  return Buffer.from(value, 'utf8').toString('base64url')
}
