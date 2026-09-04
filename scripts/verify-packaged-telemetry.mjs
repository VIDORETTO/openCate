import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultExecutable = process.platform === 'win32'
  ? path.join(repoRoot, 'release', 'win-unpacked', 'Cate.exe')
  : undefined
const executable = process.env.CATE_PACKAGED_APP || defaultExecutable

if (!executable) {
  throw new Error('Set CATE_PACKAGED_APP to an unpacked packaged Cate executable')
}
await fs.access(executable)

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cate-telemetry-smoke-'))
const requests = []
const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', (chunk) => chunks.push(chunk))
  request.on('end', () => {
    requests.push({
      method: request.method,
      url: request.url,
      body: Buffer.concat(chunks).toString('utf8'),
    })
    response.writeHead(204)
    response.end()
  })
})

await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})

const address = server.address()
if (!address || typeof address === 'string') throw new Error('Telemetry smoke server did not bind')
const endpoint = `http://127.0.0.1:${address.port}/api/app-events`

async function runPackaged(telemetryEnabled) {
  const userData = path.join(tempRoot, telemetryEnabled ? 'enabled' : 'disabled')
  await fs.mkdir(userData, { recursive: true })
  await fs.writeFile(
    path.join(userData, 'settings.json'),
    `${JSON.stringify({ telemetryEnabled })}\n`,
    'utf8',
  )

  const output = []
  await new Promise((resolve, reject) => {
    const child = spawn(executable, [`--user-data-dir=${userData}`], {
      env: {
        ...process.env,
        CATE_SMOKE_TEST: '1',
        CATE_TELEMETRY_SMOKE_ENDPOINT: endpoint,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error(`Packaged telemetry smoke timed out:\n${output.join('')}`))
    }, 30_000)
    child.stdout.on('data', (chunk) => output.push(chunk.toString()))
    child.stderr.on('data', (chunk) => output.push(chunk.toString()))
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('exit', (code) => {
      clearTimeout(timeout)
      if (code === 0) resolve()
      else reject(new Error(`Packaged telemetry smoke exited ${code}:\n${output.join('')}`))
    })
  })
}

function eventsFromRequests() {
  return requests.flatMap(({ body }) => {
    try {
      const payload = JSON.parse(body)
      return Array.isArray(payload.events) ? payload.events : [payload]
    } catch {
      return []
    }
  })
}

async function waitForFeatureEvent(feature) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (eventsFromRequests().some((event) => event?.event_name === 'feature_used' && event?.props?.feature === feature)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for feature_used(${feature})`)
}

async function closeInteractivePackaged(app) {
  if (!app) return
  const child = app.process()
  const waitForExit = () => {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
    return new Promise((resolve) => child.once('exit', () => resolve()))
  }
  let timer
  try {
    await Promise.race([
      Promise.all([app.close(), waitForExit()]),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('packaged telemetry toggle close timed out')), 10_000)
      }),
    ])
  } catch {
    if (child.exitCode === null && child.signalCode === null) child.kill()
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function runInteractiveToggle() {
  const userData = path.join(tempRoot, 'same-session')
  await fs.mkdir(userData, { recursive: true })
  await fs.writeFile(path.join(userData, 'settings.json'), `${JSON.stringify({ telemetryEnabled: false })}\n`, 'utf8')

  const packaged = await electron.launch({
    executablePath: executable,
    args: [`--user-data-dir=${userData}`],
    env: {
      ...process.env,
      CATE_E2E: '1',
      CATE_E2E_USER_DATA: userData,
      CATE_SMOKE_TEST: '0',
      CATE_TELEMETRY_SMOKE: '1',
      CATE_TELEMETRY_SMOKE_ENDPOINT: endpoint,
      NODE_ENV: 'production',
    },
  })

  try {
    const page = await packaged.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForFunction(() => window.__cateE2E?.ready === true, undefined, { timeout: 15_000 })
    await page.waitForFunction(
      () => typeof window.electronAPI?.settingsSet === 'function' && typeof window.electronAPI?.trackFeatureUsed === 'function',
      undefined,
      { timeout: 15_000 },
    )

    await page.evaluate(async () => {
      await window.electronAPI.settingsSet('telemetryEnabled', true)
      window.electronAPI.trackFeatureUsed('packaged_same_session_enabled', { source: 'smoke' })
    })
    await waitForFeatureEvent('packaged_same_session_enabled')

    const requestCountBeforeDisable = requests.length
    await page.evaluate(async () => {
      await window.electronAPI.settingsSet('telemetryEnabled', false)
      window.electronAPI.trackFeatureUsed('packaged_same_session_disabled', { source: 'smoke' })
    })
    await new Promise((resolve) => setTimeout(resolve, 500))

    if (requests.length !== requestCountBeforeDisable) {
      throw new Error('Telemetry disabled in-session but a new request reached the collector')
    }
    if (eventsFromRequests().some((event) => event?.props?.feature === 'packaged_same_session_disabled')) {
      throw new Error('Telemetry disabled in-session but feature_used was emitted')
    }
  } finally {
    await closeInteractivePackaged(packaged)
  }
}

try {
  await runPackaged(false)
  if (requests.length !== 0) {
    throw new Error(`Telemetry disabled but ${requests.length} request(s) reached the collector`)
  }

  await runPackaged(true)
  if (requests.length === 0) {
    throw new Error('Telemetry enabled but no request reached the loopback collector')
  }
  const events = requests.flatMap(({ body }) => {
    try {
      const payload = JSON.parse(body)
      return Array.isArray(payload.events) ? payload.events : [payload]
    } catch {
      return []
    }
  })
  const eventNames = events.map((event) => event?.event_name).filter(Boolean)
  if (!eventNames.includes('app_start')) {
    throw new Error(`Expected app_start, received: ${eventNames.join(', ') || 'no valid events'}`)
  }
  await runInteractiveToggle()
  console.log(`packaged telemetry smoke: passed (disabled=0 requests, enabled=${requests.length} requests, same-session toggle=ok)`)
} finally {
  await new Promise((resolve) => server.close(resolve))
  await fs.rm(tempRoot, { recursive: true, force: true })
}
