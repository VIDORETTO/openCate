import { spawn } from 'node:child_process'
import process from 'node:process'

const [command, ...commandArgs] = process.argv.slice(2)
if (!command) {
  console.error('usage: node scripts/run-with-xvfb.mjs command [arguments]')
  process.exit(2)
}

if (process.platform !== 'linux') {
  console.error('scripts/run-with-xvfb.mjs is only supported on Linux runners')
  process.exit(2)
}

const display = process.env.DISPLAY || ':99'
const environment = { ...process.env, DISPLAY: display }
const diagnostics = []
const xvfb = spawn('Xvfb', [display, '-screen', '0', '1280x1024x24', '-nolisten', 'tcp'], {
  env: environment,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})
let xvfbError
xvfb.stdout?.on('data', (chunk) => diagnostics.push(`stdout: ${chunk.toString()}`))
xvfb.stderr?.on('data', (chunk) => diagnostics.push(`stderr: ${chunk.toString()}`))
xvfb.once('error', (error) => { xvfbError = error })

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode, error: null })
  }
  return new Promise((resolve) => {
    const finish = (result) => resolve(result)
    child.once('error', (error) => finish({ code: null, signal: null, error }))
    child.once('exit', (code, signal) => finish({ code, signal, error: null }))
  })
}

function probeDisplay() {
  return new Promise((resolve) => {
    const probe = spawn('xdpyinfo', [], {
      env: environment,
      stdio: 'ignore',
      windowsHide: true,
    })
    let settled = false
    const finish = (ready) => {
      if (settled) return
      settled = true
      resolve(ready)
    }
    probe.once('error', () => finish(false))
    probe.once('exit', (code) => finish(code === 0))
  })
}

async function waitForDisplay() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (xvfbError) throw new Error(`Xvfb failed to start: ${xvfbError.message}`)
    if (await probeDisplay()) return
    await wait(1000)
  }
  throw new Error(`Xvfb display ${display} did not become ready\n${diagnostics.join('')}`)
}

let commandProcess
const forwardSignal = (signal) => {
  if (commandProcess?.exitCode === null && commandProcess?.signalCode === null) commandProcess.kill(signal)
}

try {
  await waitForDisplay()
  process.on('SIGINT', () => forwardSignal('SIGINT'))
  process.on('SIGTERM', () => forwardSignal('SIGTERM'))
  commandProcess = spawn(command, commandArgs, {
    env: environment,
    stdio: 'inherit',
    windowsHide: true,
  })
  const result = await waitForExit(commandProcess)
  if (result.error) throw result.error
  process.exitCode = result.signal ? 1 : result.code ?? 1
} catch (error) {
  console.error(`[xvfb] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  process.removeAllListeners('SIGINT')
  process.removeAllListeners('SIGTERM')
  if (xvfb.exitCode === null && xvfb.signalCode === null) xvfb.kill('SIGTERM')
  await Promise.race([waitForExit(xvfb), wait(2000)])
  if (xvfb.exitCode === null && xvfb.signalCode === null) xvfb.kill('SIGKILL')
}
