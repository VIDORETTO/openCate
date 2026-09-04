/* global clearTimeout, console, process, setTimeout */

import { execFile, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const TMUX_TIMEOUT_MS = 5_000
const CLIENT_TIMEOUT_MS = 5_000

if (process.platform === 'win32') {
  console.log('tmux live smoke: skipped (tmux durability is POSIX-only)')
} else {
  await main()
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'cate-tmux-smoke-'))
  const socketPath = join(root, 'tmux.sock')
  const sessionName = `cate-tmux-smoke-${randomBytes(6).toString('hex')}`
  const markerPath = join(root, 'session-marker.txt')
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry) => entry[1] !== undefined),
  )
  let client
  let cleanupError

  try {
    try {
      await runTmux(socketPath, ['-V'])
    } catch (error) {
      if (isCommandMissing(error)) {
        console.log('tmux live smoke: skipped (tmux is unavailable)')
        return
      }
      throw error
    }
    const python = await resolvePython()

    const markerCode = [
      "const fs = require('node:fs')",
      "fs.writeFileSync(process.argv[1], 'ready')",
      'setInterval(() => {}, 1000)',
    ].join(';')
    await runTmux(socketPath, [
      'new-session',
      '-d',
      '-s',
      sessionName,
      '-c',
      root,
      '-x',
      '80',
      '-y',
      '24',
      process.execPath,
      '-e',
      markerCode,
      markerPath,
    ])

    await waitFor('tmux session marker', async () => existsSync(markerPath))
    const panePid = Number((await runTmux(socketPath, [
      'display-message',
      '-p',
      '-t',
      sessionName,
      '#{pane_pid}',
    ])).stdout.trim())
    if (!Number.isInteger(panePid) || panePid <= 0) {
      throw new Error(`tmux returned an invalid pane pid: ${panePid}`)
    }

    client = spawnPtyClient(python, socketPath, sessionName, root, env)
    await waitForClientToDetach(client)

    await runTmux(socketPath, ['has-session', '-t', sessionName])
    const marker = (await readFile(markerPath, 'utf8')).trim()
    if (marker !== 'ready') throw new Error(`unexpected tmux marker: ${marker}`)
    if (!isProcessAlive(panePid)) {
      throw new Error(`tmux pane process ${panePid} did not survive client detach`)
    }

    await runTmux(socketPath, ['kill-session', '-t', sessionName])
    await waitFor('tmux session teardown', async () => {
      try {
        await runTmux(socketPath, ['has-session', '-t', sessionName])
        return false
      } catch {
        return true
      }
    })
    console.log(`tmux live smoke: passed (${sessionName}, pane ${panePid})`)
  } finally {
    try { client?.kill() } catch { /* already exited */ }
    try { await runTmux(socketPath, ['kill-session', '-t', sessionName]) } catch { /* already gone */ }
    try { await runTmux(socketPath, ['kill-server']) } catch { /* already gone */ }
    try {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    } catch (error) {
      cleanupError = error
    }
    if (existsSync(root)) cleanupError = new Error(`temporary tmux directory remains: ${root}`)
  }
  if (cleanupError) throw cleanupError
}

async function runTmux(socketPath, args) {
  return execFileAsync('tmux', ['-S', socketPath, '-f', '/dev/null', ...args], {
    encoding: 'utf8',
    timeout: TMUX_TIMEOUT_MS,
    windowsHide: true,
  })
}

async function waitFor(description, predicate) {
  const deadline = Date.now() + TMUX_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (await predicate()) return
    await delay(50)
  }
  throw new Error(`timed out waiting for ${description}`)
}

function spawnPtyClient(python, socketPath, sessionName, cwd, env) {
  const clientCode = [
    'import os, pty, sys, time',
    'socket_path, session_name = sys.argv[1], sys.argv[2]',
    'pid, fd = pty.fork()',
    'if pid == 0:',
    '    os.execvp("tmux", ["tmux", "-S", socket_path, "-f", "/dev/null", "attach-session", "-t", session_name])',
    'time.sleep(0.5)',
    'try:',
    '    os.write(fd, b"\\x02d")',
    'except OSError:',
    '    pass',
    '_, status = os.waitpid(pid, 0)',
    'sys.exit(os.waitstatus_to_exitcode(status))',
  ].join('\n')
  return spawn(python, ['-c', clientCode, socketPath, sessionName], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
}

function waitForClientToDetach(client) {
  return new Promise((resolve, reject) => {
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      try { client.kill() } catch { /* already exited */ }
      finish(() => reject(new Error('timed out waiting for tmux client detach')))
    }, CLIENT_TIMEOUT_MS)

    const finish = (callback) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      callback()
    }

    client.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    client.once('error', (error) => finish(() => reject(error)))
    client.once('close', (code, signal) => {
      if (code !== 0) {
        const detail = stderr.trim()
        const suffix = detail ? ': ' + detail : ''
        finish(() => reject(new Error('tmux client exited with code ' + String(code ?? signal) + suffix)))
        return
      }
      finish(resolve)
    })
  })
}

async function resolvePython() {
  for (const command of ['python3', 'python']) {
    try {
      await execFileAsync(command, ['--version'], { timeout: TMUX_TIMEOUT_MS, windowsHide: true })
      return command
    } catch { /* try the next executable */ }
  }
  throw new Error('Python 3 is required for the POSIX tmux PTY smoke')
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function isCommandMissing(error) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
