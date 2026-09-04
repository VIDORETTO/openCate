import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const executable = process.env.CATE_PACKAGED_APP || (
  process.platform === 'win32'
    ? path.join(repoRoot, 'release', 'win-unpacked', 'openCate.exe')
    : undefined
)

if (!executable) {
  throw new Error('Set CATE_PACKAGED_APP to an unpacked packaged openCate executable')
}
await fs.access(executable)

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cate-packaged-restore-'))
const projectRoot = path.join(tempRoot, 'project')
const userDataDir = path.join(tempRoot, 'user-data')
await fs.mkdir(projectRoot, { recursive: true })

async function launchPackaged() {
  const app = await electron.launch({
    executablePath: executable,
    args: [`--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      CATE_E2E: '1',
      CATE_E2E_USER_DATA: userDataDir,
      NODE_ENV: 'production',
    },
  })
  const diagnostics = []
  app.process().stdout?.on('data', (chunk) => diagnostics.push(`stdout: ${chunk.toString()}`))
  app.process().stderr?.on('data', (chunk) => diagnostics.push(`stderr: ${chunk.toString()}`))
  try {
    const page = await app.firstWindow()
    page.on('console', (message) => diagnostics.push(`console ${message.type()}: ${message.text()}`))
    page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`))
    await page.waitForLoadState('domcontentloaded')
    await page.waitForFunction(() => window.__cateE2E?.ready === true, undefined, { timeout: 15_000 })
    await page.waitForSelector('[data-canvas-panel-id]', { timeout: 15_000 })
    return { app, page }
  } catch (error) {
    const state = await app.firstWindow().evaluate(() => ({
      url: location.href,
      title: document.title,
      body: document.body?.innerText?.slice(0, 500),
      hasElectronApi: typeof window.electronAPI === 'object',
      isE2E: window.electronAPI?.isE2E,
      hasHarness: !!window.__cateE2E,
    })).catch(() => null)
    await closePackaged(app)
    throw new Error(`${error.message}\npackaged bootstrap state: ${JSON.stringify(state)}\n${diagnostics.join('')}`)
  }
}

async function closePackaged(app) {
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
        timer = setTimeout(() => reject(new Error('packaged app close timed out')), 10_000)
      }),
    ])
  } catch {
    await forceKillProcessTree(child)
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Electron's Windows helper processes can outlive a root-only kill. The
 * packaged smoke owns this process tree, so use the native recursive terminator
 * only for that exact root PID; Unix keeps the direct child fallback. */
async function forceKillProcessTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (process.platform !== 'win32' || child.pid == null) {
    try { child.kill() } catch { /* already exited */ }
    return
  }

  await new Promise((resolve) => {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    killer.once('error', () => {
      try { if (child.exitCode === null && child.signalCode === null) child.kill() } catch { /* already exited */ }
      resolve()
    })
    killer.once('close', () => resolve())
  })
}

async function trustAndOpen(page) {
  const opening = page.evaluate((root) => window.__cateE2E.setWorkspaceRoot(root), projectRoot)
  const trust = page.getByRole('button', { name: 'Trust and open' })
  if (await trust.isVisible({ timeout: 5_000 }).catch(() => false)) await trust.click()
  if (!(await opening)) throw new Error('packaged restore smoke could not open the temporary workspace')
}

async function waitForNode(page, hint) {
  const handle = await page.waitForFunction(
    (id) => window.__cateE2E.nodes().find((node) => node.id === id || node.panelId === id)?.id ?? null,
    hint,
    { timeout: 15_000 },
  )
  return handle.jsonValue()
}

async function waitForFile(filePath) {
  const deadline = Date.now() + 15_000
  while (!existsSync(filePath)) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${filePath}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

let firstApp
let secondApp
let savedSize
try {
  const first = await launchPackaged()
  firstApp = first.app
  await trustAndOpen(first.page)
  const hint = await first.page.evaluate(() => window.__cateE2E.createTerminal({ x: 120, y: 80 }))
  const nodeId = await waitForNode(first.page, hint)
  const current = await first.page.evaluate((id) => window.__cateE2E.nodes().find((node) => node.id === id), nodeId)
  if (!current) throw new Error('packaged restore smoke did not create a terminal node')
  savedSize = { width: current.size.width + 37, height: current.size.height + 23 }
  await first.page.evaluate(({ id, size }) => window.__cateE2E.resizeNode(id, size), { id: nodeId, size: savedSize })
  await first.page.evaluate(() => window.__cateE2E.saveSessionNow())

  const workspacePath = path.join(projectRoot, '.cate', 'workspace.json')
  const sessionPath = path.join(projectRoot, '.cate', 'session.json')
  await waitForFile(workspacePath)
  await waitForFile(sessionPath)
  const workspace = JSON.parse(await fs.readFile(workspacePath, 'utf8'))
  const session = JSON.parse(await fs.readFile(sessionPath, 'utf8'))
  if (workspace.version !== 1 || session.version !== 1) {
    throw new Error('packaged restore smoke wrote an unexpected .cate schema version')
  }
  const serializedSizes = Object.values(workspace.canvases ?? {})
    .flatMap((canvas) => Object.values(canvas.canvasNodes ?? {}))
    .map((node) => node.size)
  if (!serializedSizes.some((size) => size?.width === savedSize.width && size?.height === savedSize.height)) {
    throw new Error('resized terminal geometry was not persisted in workspace.json')
  }
  await closePackaged(firstApp)
  firstApp = undefined

  const second = await launchPackaged()
  secondApp = second.app
  await second.page.waitForFunction(
    (size) => window.__cateE2E.nodes().some((node) => node.size.width === size.width && node.size.height === size.height),
    savedSize,
    { timeout: 15_000 },
  )
  await closePackaged(secondApp)
  secondApp = undefined

  if (process.platform === 'win32') {
    const executableRoot = path.dirname(path.resolve(executable))
    const powershellQuote = (value) => `'${value.replaceAll("'", "''")}'`
    const query = [
      `$self = ${process.pid}; $appRoot = ${powershellQuote(executableRoot)}; Get-CimInstance Win32_Process`,
      'Where-Object { $_.ProcessId -ne $self -and $_.Name -in @("openCate.exe", "node.exe") -and $_.CommandLine -and (($_.CommandLine -match [regex]::Escape($appRoot)) -or ($_.CommandLine -match "cate-runtime")) }',
      'Select-Object -ExpandProperty CommandLine',
    ].join(' | ')
    const leftovers = execFileSync('powershell.exe', ['-NoProfile', '-Command', query], { encoding: 'utf8' }).trim()
    if (leftovers) throw new Error(`packaged restore smoke found leftover process(es):\n${leftovers}`)
  }
  console.log(`packaged restore smoke: passed (saved and restored ${savedSize.width}x${savedSize.height})`)
} finally {
  await closePackaged(secondApp)
  await closePackaged(firstApp)
  // Chromium can release DIPS-wal and its other profile handles just after the
  // Electron parent exits on Windows. Keep the cleanup bounded and retry only
  // through Node's native rm retry path instead of turning that transient lock
  // into a failed restore smoke.
  await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
}
