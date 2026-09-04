import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { clearTimeout, setTimeout } from 'node:timers'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { parse } from 'yaml'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const updateScript = path.join(repoRoot, 'scripts', 'dev-update.mjs')
const updateManifest = path.join(repoRoot, 'dev-app-update.yml')
const version = process.env.CATE_DEV_UPDATE_VERSION || '99.0.0'
const assetName = 'cate-dev-update.zip'
const asset = Buffer.alloc(1024 * 1024, 7)
const sha512 = createHash('sha512').update(asset).digest('base64')
const fetchFn = globalThis.fetch.bind(globalThis)
const AbortControllerCtor = globalThis.AbortController

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('could not allocate an update fixture port')
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return address.port
}

async function exists(file) {
  try {
    await fs.access(file)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function fetchWithTimeout(url) {
  const controller = new AbortControllerCtor()
  const timer = setTimeout(() => controller.abort(), 1000)
  try {
    return await fetchFn(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function waitForFeed(url, child, output) {
  const deadline = Date.now() + 10000
  let lastError = null
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`update fixture exited early: ${output.join('').trim()}`)
    }
    try {
      const response = await fetchWithTimeout(url)
      if (response.ok) return response
      await response.arrayBuffer()
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await delay(50)
  }
  throw new Error(`update fixture did not become ready: ${lastError?.message || 'timeout'}`)
}

async function readResponse(response, label) {
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return
  await Promise.race([once(child, 'exit'), delay(timeoutMs)])
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  await waitForExit(child, 3000)
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await waitForExit(child, 3000)
  }
}

const port = await freePort()
if (await exists(updateManifest)) {
  throw new Error(`${path.basename(updateManifest)} already exists; remove the stale fixture before testing`)
}

const output = []
const child = spawn(process.execPath, [updateScript], {
  cwd: repoRoot,
  env: {
    ...process.env,
    CATE_DEV_UPDATE_NO_LAUNCH: '1',
    CATE_DEV_UPDATE_PORT: String(port),
    CATE_DEV_UPDATE_VERSION: version,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})
child.stdout.on('data', (chunk) => output.push(String(chunk)))
child.stderr.on('data', (chunk) => output.push(String(chunk)))

const baseUrl = `http://127.0.0.1:${port}`
const manifests = ['latest.yml', 'latest-linux.yml', 'latest-mac.yml']
let failure = null
try {
  const ready = await waitForFeed(`${baseUrl}/latest.yml`, child, output)
  await ready.arrayBuffer()

  for (const manifestName of manifests) {
    const response = await fetchWithTimeout(`${baseUrl}/${manifestName}`)
    const metadata = parse((await readResponse(response, manifestName)).toString('utf8'))
    const artifact = metadata?.files?.[0]
    if (metadata?.version !== version) throw new Error(`${manifestName}: wrong version`)
    if (!artifact || artifact.url !== assetName || Number(artifact.size) !== asset.byteLength || artifact.sha512 !== sha512) {
      throw new Error(`${manifestName}: artifact metadata does not match the fixture`)
    }
    if (metadata.path !== assetName || metadata.sha512 !== sha512) {
      throw new Error(`${manifestName}: top-level metadata does not match the fixture`)
    }
  }

  const assetResponse = await fetchWithTimeout(`${baseUrl}/${assetName}`)
  const downloaded = await readResponse(assetResponse, assetName)
  if (downloaded.byteLength !== asset.byteLength || createHash('sha512').update(downloaded).digest('base64') !== sha512) {
    throw new Error(`${assetName}: downloaded bytes do not match the fixture`)
  }

  const missing = await fetchWithTimeout(`${baseUrl}/missing-update.zip`)
  await missing.arrayBuffer()
  if (missing.status !== 404) throw new Error(`missing asset: expected HTTP 404, got ${missing.status}`)

  const updateConfig = await fs.readFile(updateManifest, 'utf8')
  if (!updateConfig.includes(`url: http://127.0.0.1:${port}`) || !updateConfig.includes('provider: generic')) {
    throw new Error('dev-app-update.yml does not point at the isolated fixture')
  }
} catch (error) {
  failure = error
} finally {
  await stop(child)
  await fs.rm(updateManifest, { force: true })
  if (await exists(updateManifest)) {
    failure ??= new Error(`${path.basename(updateManifest)} was not cleaned up`)
  }
}

if (failure) throw failure
process.stdout.write(`update fixture: passed (${manifests.length} manifests, ${asset.byteLength} byte asset, clean teardown)\n`)
