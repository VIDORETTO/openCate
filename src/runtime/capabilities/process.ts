// =============================================================================
// Process capability — electron-free node-pty wrapper. Owns the PTY map keyed by
// id and streams output via the create-time callbacks; it has NO knowledge of
// windows, buffering, transfer, idle-suspend, or logging — those stay in the
// terminal.ts session layer (electron) which forwards to the owning window.
//
// Shell resolution + env are injected so the SAME code runs locally (Electron's
// resolveShell + login-shell env) and inside the daemon (the remote host's
// shell + env). lsof-based cwd resolution is POSIX-only (null elsewhere).
// =============================================================================

import type { IPty } from 'node-pty'
import os from 'os'
import path from 'path'
import { existsSync, readFileSync } from 'fs'
import childProcess, { execFile, type ChildProcess } from 'child_process'
import type { ProcessHost, PtyCreateOptions, PtyHandle, PtyActivity } from '../../main/runtime/types'
import type { TerminalActivity } from '../../shared/types'
import { matchAgentDef } from '../../shared/agents'
import type { AgentPresenceTracker } from './agentPresence'
import type { AgentHookConfig } from '../../shared/agentHooks'
import type { TerminalDurability } from '../../shared/terminalDurability'
import { catePathEnv } from '../cateCli'
import { assertTmuxSessionName, buildTmuxAttachArgs, buildTmuxKillArgs } from './tmux'
import {
  type ProcTree,
  snapshotProcessTreeProc,
  getCwdProc,
  listeningPortsByPidProc,
} from './procfs'

// ---------------------------------------------------------------------------
// Process-monitor helpers (POSIX). Ported verbatim from the old shell.ts local
// monitor so a LOCAL runtime derives byte-identical activity/ports; a remote
// runtime runs the same scans on the daemon host (`ps`/`lsof` are POSIX there).
//
// On Linux these scans read /proc directly instead of forking ps/lsof — forking
// ~1.6×/sec stalls the Electron main event loop and lags renderer IPC (#246).
// macOS keeps the ps/lsof path; /proc is Linux-only. See procfs.ts.
// ---------------------------------------------------------------------------

const isLinux = process.platform === 'linux'

/** ONE `ps` snapshot of the whole process table, indexed for tree walks. */
function snapshotProcessTreePs(): Promise<ProcTree> {
  return new Promise((resolve) => {
    execFile('ps', ['-axo', 'pid=,ppid=,comm='], {
      encoding: 'utf-8',
      timeout: 3000,
      maxBuffer: 8 * 1024 * 1024,
    }, (err, stdout) => {
      if (err || !stdout) {
        resolve({ nameByPid: new Map(), childrenByPid: new Map() })
        return
      }
      const nameByPid = new Map<number, string>()
      const childrenByPid = new Map<number, number[]>()
      for (const line of stdout.split('\n')) {
        // "<pid> <ppid> <comm>" — comm may contain spaces (keep remainder) and
        // can be a full path on macOS, so take the basename.
        const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*\S)\s*$/)
        if (!m) continue
        const pid = parseInt(m[1], 10)
        const ppid = parseInt(m[2], 10)
        if (isNaN(pid) || isNaN(ppid)) continue
        nameByPid.set(pid, m[3].split('/').pop() ?? m[3])
        const siblings = childrenByPid.get(ppid)
        if (siblings) siblings.push(pid)
        else childrenByPid.set(ppid, [pid])
      }
      resolve({ nameByPid, childrenByPid })
    })
  })
}

/** Process-table snapshot: /proc on Linux (no fork — #246), `ps` elsewhere.
 *  Exported for the agent-presence tracker's registration-time walk. */
export function snapshotProcessTree(): Promise<ProcTree> {
  return isLinux ? snapshotProcessTreeProc() : snapshotProcessTreePs()
}

/** A process's cwd. Linux: readlink /proc/<pid>/cwd (no fork — #246). macOS:
 *  lsof. win32: null. */
function cwdForPid(pid: number): Promise<string | null> {
  if (process.platform === 'win32') return Promise.resolve(null)
  if (isLinux) return getCwdProc(pid)
  return new Promise((resolve) => {
    execFile('lsof', ['-a', '-d', 'cwd', '-p', `${pid}`, '-Fn'], { encoding: 'utf-8', timeout: 2000 }, (err, stdout) => {
      if (err || !stdout) { return resolve(null) }
      const nameLine = stdout.split('\n').find((l) => l.startsWith('n'))
      resolve(nameLine ? nameLine.slice(1) : null)
    })
  })
}

/** All descendant pids of `pid` (BFS over the snapshot), excluding `pid`. */
function descendantsOf(pid: number, tree: ProcTree): number[] {
  const out: number[] = []
  const stack = [...(tree.childrenByPid.get(pid) ?? [])]
  while (stack.length > 0) {
    const p = stack.pop()!
    out.push(p)
    const kids = tree.childrenByPid.get(p)
    if (kids) stack.push(...kids)
  }
  return out
}

function isShellProcess(name: string): boolean {
  const shells = ['zsh', 'bash', 'fish', 'sh', 'tcsh', 'ksh', 'dash']
  return shells.includes(name.toLowerCase())
}

/** The activity indicator + a hooks-independent "which agent is running here"
 *  signal. A supported agent CLI anywhere in the pty's subtree wins: it may run
 *  under a launcher (grok's npm wrapper execs a versioned binary, etc.), so it
 *  isn't always the direct child. This is the process-scan detection the tab
 *  title and the "hooks off" nudge key on — complementary to the hook-anchored
 *  presence (agentPresence.ts), which still owns running/finished STATE.
 *
 *  BLIND SPOT (deliberate, see #480 / agentPresence.ts header): this is a
 *  DOWNWARD walk of the pty's OWN tree, so it is structurally blind wherever the
 *  agent is detached from that tree — tmux/screen panes hang off the
 *  multiplexer server, setsid/nohup daemonize. That is exactly why presence and
 *  STATE are hook-anchored, not scan-anchored: hooks don't care about topology.
 *  The two features that key on this scan (clean tab title, "hooks off" nudge)
 *  therefore degrade to "no clean name / no nudge" under tmux — never a wrong
 *  state, and the hook path still delivers the tab name + full state there. The
 *  nudge additionally gates on hook-anchored presence so it can't fire when
 *  hooks ARE working (see useMissingAgentHookNotice).
 *
 *  Falls back to the first non-shell direct child for the generic indicator
 *  (dev servers, vim). */
function activityForPid(shellPid: number, tree: ProcTree): TerminalActivity {
  for (const pid of descendantsOf(shellPid, tree)) {
    const name = tree.nameByPid.get(pid)
    if (name && matchAgentDef(name)) return { type: 'running', processName: name }
  }
  for (const childPid of tree.childrenByPid.get(shellPid) ?? []) {
    const name = tree.nameByPid.get(childPid)
    if (name && !isShellProcess(name)) return { type: 'running', processName: name }
  }
  return { type: 'idle' }
}

// node-pty is loaded LAZILY so the daemon still starts (and serves files/git)
// on a host where the native PTY binary isn't available (e.g. a Linux server
// with no node-pty prebuild) — only terminal creation fails there, with a clear
// error, instead of the whole daemon crashing on import.
type PtySpawn = typeof import('node-pty').spawn
let cachedSpawn: PtySpawn | null = null

// node-pty's Windows ConPTY kill path forks a short-lived
// `conpty_console_list_agent` to enumerate the console process tree. The
// library does not expose that child or await it, so a daemon that exits as
// soon as the PTY's onExit fires can orphan the helper. Track only those
// library-owned children so shutdown can finish them before process.exit().
const conptyAgents = new Set<ChildProcess>()
let conptyForkTrackingInstalled = false

function installConptyForkTracking(): void {
  if (process.platform !== 'win32' || conptyForkTrackingInstalled) return
  conptyForkTrackingInstalled = true
  const originalFork = childProcess.fork.bind(childProcess)
  childProcess.fork = ((...args: Parameters<typeof childProcess.fork>) => {
    const child = originalFork(...args)
    const modulePath = String(args[0])
    if (modulePath.includes('conpty_console_list_agent')) {
      conptyAgents.add(child)
      const forget = (): void => { conptyAgents.delete(child) }
      child.once('close', forget)
      child.once('error', forget)
      child.once('exit', forget)
    }
    return child
  }) as typeof childProcess.fork
}

function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.off('close', finish)
      child.off('error', finish)
      child.off('exit', finish)
      resolve()
    }
    const timer = setTimeout(finish, timeoutMs)
    child.once('close', finish)
    child.once('error', finish)
    child.once('exit', finish)
  })
}

async function reapConptyAgents(): Promise<void> {
  // A not-yet-ready node-pty queues kill() until its first data turn, so a
  // single snapshot immediately after kill() can miss a helper that is about
  // to be forked. Keep a short polling window open to catch those late forks.
  const deadline = Date.now() + 1_000
  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(50, deadline - Date.now())))
  }
  const lingering = [...conptyAgents].filter((agent) => agent.exitCode === null && agent.signalCode === null)
  for (const agent of lingering) {
    try { agent.kill() } catch { /* already gone */ }
  }
  await Promise.all(lingering.map((agent) => waitForChildExit(agent, 250)))
}

async function getPtySpawn(): Promise<PtySpawn> {
  if (cachedSpawn) return cachedSpawn
  try {
    installConptyForkTracking()
    const mod = await import('node-pty')
    cachedSpawn = mod.spawn
    return cachedSpawn
  } catch (err) {
    throw new Error(
      `Terminals are unavailable on this host: failed to load node-pty (${err instanceof Error ? err.message : String(err)}). ` +
        'A platform-matched node-pty native binary must be staged for this target.',
    )
  }
}

function probeTmux(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('tmux', ['-V'], { encoding: 'utf-8', timeout: 2000 }, (error) => {
      resolve(!error)
    })
  })
}

function terminateTmuxSession(sessionName: string): void {
  try {
    execFile('tmux', buildTmuxKillArgs(sessionName), { timeout: 2000 }, () => {})
  } catch {
    // A session that already disappeared is already in the desired state.
  }
}

/** Resolve a Windows command shim before handing it to node-pty. `CreateProcess`
 * does not apply PATHEXT when the executable is passed directly, so a command
 * such as `codex` can fail even though `codex.cmd` is on PATH. Keep the original
 * spelling when no candidate exists so the native error remains authoritative. */
export function resolveWindowsExecutable(
  executable: string,
  env: Record<string, string>,
  exists: (candidate: string) => boolean = existsSync,
): string {
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH')
  const pathValue = pathKey ? env[pathKey] : ''
  const pathextKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATHEXT')
  const extensions = (pathextKey ? env[pathextKey] : '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((extension) => extension.trim())
    .filter((extension) => /^\.[A-Za-z0-9]+$/.test(extension))
  if (extensions.length === 0) return executable

  const hasDirectory = executable.includes('\\') || executable.includes('/')
  const hasExtension = Boolean(path.extname(executable))
  const directories = hasDirectory ? [''] : pathValue.split(path.delimiter).filter(Boolean)
  for (const directory of directories) {
    const candidates = hasExtension
      ? [executable]
      : extensions.map((extension) => executable + extension)
    for (const candidateName of candidates) {
      const candidate = directory ? path.join(directory, candidateName) : candidateName
      if (exists(candidate)) return candidate
    }
  }
  return executable
}

interface WindowsCommandResolution {
  executable: string
  args: string[]
}

type WindowsShimReader = (filePath: string) => string

/** Split the one command invocation in a simple Windows launcher without
 * asking cmd.exe to reinterpret the caller's arguments. This intentionally
 * accepts only argv-like tokens; wrappers that need arbitrary batch syntax
 * fall back to the original shim and retain its native behavior. */
function parseWindowsShimInvocation(line: string): string[] | null {
  let lastAmpersand = -1
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') quoted = !quoted
    else if (char === '&' && !quoted) lastAmpersand = i
  }
  const command = line.slice(lastAmpersand + 1).replace(/^\s*@?\s*/, '').trim()
  if (!command || /^::|^rem\b/i.test(command)) return null

  const tokens: string[] = []
  let token = ''
  let started = false
  quoted = false
  for (const char of command) {
    if (char === '"') {
      quoted = !quoted
      started = true
    } else if (/\s/.test(char) && !quoted) {
      if (started) {
        tokens.push(token)
        token = ''
        started = false
      }
    } else {
      if (!quoted && /[|<>]/.test(char)) return null
      token += char
      started = true
    }
  }
  if (quoted) return null
  if (started) tokens.push(token)
  if (tokens.at(-1) !== '%*') return null
  if (tokens[0]?.toLowerCase() === 'call') tokens.shift()
  return tokens.length > 1 ? tokens : null
}

/** Expand the small, path-only variable vocabulary used by npm's generated
 * Windows shims. No general batch expansion is attempted: unknown variables
 * make the wrapper ineligible for direct spawning. */
function expandWindowsShimToken(
  token: string,
  shimDir: string,
  program: string | null,
): string | null {
  const dp0 = `${shimDir}${path.sep}`
  let expanded = token
    .replace(/%~dp0/gi, dp0)
    .replace(/%dp0%/gi, dp0)
  if (/%_prog%/i.test(expanded)) {
    if (!program) return null
    expanded = expanded.replace(/%_prog%/gi, program)
  }
  return /%[^%]+%/.test(expanded) ? null : expanded
}

/** Translate the safe subset of npm-style `.cmd`/`.bat` shims to a direct
 * executable + argv. The important property is that multiline prompts remain
 * one argv element: node-pty can start the real executable directly, whereas
 * `%*` expansion through cmd.exe treats embedded newlines as batch syntax. */
function resolveWindowsShim(
  shimPath: string,
  requestedArgs: string[],
  env: Record<string, string>,
  exists: (candidate: string) => boolean,
  read: WindowsShimReader,
): WindowsCommandResolution | null {
  let source: string
  try {
    source = read(shimPath)
  } catch {
    return null
  }

  const shimDir = path.dirname(shimPath)
  const programs: string[] = []
  for (const line of source.split(/\r?\n/)) {
    const assignment = line.match(/^\s*set\s+"_prog=(.*)"\s*$/i)
    if (!assignment) continue
    const expanded = expandWindowsShimToken(assignment[1], shimDir, null)
    if (expanded) programs.push(expanded)
  }

  const resolveProgram = (): string | null => {
    for (const candidate of programs) {
      const resolved = candidate.includes('\\') || candidate.includes('/')
        ? candidate
        : resolveWindowsExecutable(candidate, env, exists)
      if (exists(resolved)) return resolved
    }
    return programs[0] ?? null
  }

  for (const line of source.split(/\r?\n/)) {
    const tokens = parseWindowsShimInvocation(line)
    if (!tokens) continue
    const program = resolveProgram()
    const expanded = tokens
      .slice(0, -1)
      .map((token) => expandWindowsShimToken(token, shimDir, program))
    if (expanded.some((token) => token === null)) continue
    const resolvedTokens = expanded as string[]
    const executable = resolvedTokens[0]
    if (!executable || executable.toLowerCase() === shimPath.toLowerCase()) continue
    const resolvedExecutable = executable.includes('\\') || executable.includes('/')
      ? executable
      : resolveWindowsExecutable(executable, env, exists)
    if (!exists(resolvedExecutable)) continue
    return { executable: resolvedExecutable, args: [...resolvedTokens.slice(1), ...requestedArgs] }
  }
  return null
}

/** Resolve a Windows command and, when possible, bypass a simple batch shim.
 * `resolveWindowsExecutable` remains the public lookup primitive; this richer
 * result is used only by the PTY launch path because it may need to prepend
 * the shim's static Node/script arguments. */
export function resolveWindowsCommand(
  executable: string,
  args: string[],
  env: Record<string, string>,
  read: WindowsShimReader = (filePath) => readFileSync(filePath, 'utf8'),
  exists: (candidate: string) => boolean = existsSync,
): WindowsCommandResolution {
  const resolvedExecutable = resolveWindowsExecutable(executable, env, exists)
  if (!/\.(?:cmd|bat)$/i.test(resolvedExecutable)) {
    return { executable: resolvedExecutable, args }
  }
  return resolveWindowsShim(resolvedExecutable, args, env, exists, read) ?? {
    executable: resolvedExecutable,
    args,
  }
}

export interface ResolvedProcessShell {
  path: string
  args: string[]
  /** Optional notice to surface in the terminal (shell fallback, etc.). */
  notice?: string
}

export interface ProcessDeps {
  resolveShell: (requested?: string) => ResolvedProcessShell
  getEnv: () => Record<string, string>
  /**
   * Idle-suspend (POSIX-only): SIGSTOP a pty that's offscreen and silent past
   * the threshold, SIGCONT on input/visibility. OFF by default — remote daemons
   * don't pass it. The daemon hosting the LOCAL workspace passes it so
   * backgrounded local terminals still suspend.
   */
  idleSuspend?: boolean
  /**
   * Agent hook injection (see agentHooks.ts): plants the per-pty hook env
   * (ingestion endpoint/token + CATE_TERMINAL_ID) and prepares
   * workspace-scoped hook files before the shell spawns. Optional — hosts and
   * tests without hook support spawn plain shells.
   */
  hooks?: {
    envForPty(ptyId: string, env: Record<string, string>): Promise<Record<string, string>>
    prepareWorkspace(cwd: string, config?: AgentHookConfig, baseCwd?: string): Promise<void>
  }
  /**
   * Hook-anchored agent presence (agentPresence.ts): scanActivity reads each
   * pty's agent fields from the tracker's registered-pid liveness instead of
   * scanning children, and pty teardown drops the registration. Optional —
   * without it every pty reports no agent (hosts/tests that don't wire hooks
   * have no way to register one anyway).
   */
  agentPresence?: Pick<AgentPresenceTracker, 'presenceFor' | 'drop'>
  /** Optional test/runtime override for whether tmux is installed on this host. */
  tmuxAvailable?: () => Promise<boolean>
  /** Optional test/runtime override for terminating an opted-in tmux session. */
  killTmuxSession?: (sessionName: string) => void
  /** Host platform, injectable for contract tests and alternate runtime hosts. */
  platform?: NodeJS.Platform
}

/** The capability the daemon holds onto: the ProcessHost plus the concrete
 *  surface the daemon entry needs (group-kill of every live pty's process tree
 *  on shutdown), which isn't part of the portable ProcessHost interface. */
export interface ProcessCapability extends ProcessHost {
  /** Reap every live pty's process group during daemon shutdown, so quitting the
   *  app does not orphan dev servers or Windows ConPTY helper processes. */
  killAllGroups(): Promise<void>
  /** Enable/disable idle-suspend at runtime (mirrors the autoSuspendIdleTerminals
   *  setting). Enabling on a POSIX host starts the scanner; disabling stops it and
   *  SIGCONT-resumes any currently-suspended ptys so none are left frozen. win32 is
   *  a no-op (idle-suspend is POSIX-only). */
  setIdleSuspend(enabled: boolean): void
}

interface IdleState {
  lastOutputAt: number
  visible: boolean
  suspended: boolean
}

const IDLE_SUSPEND_MS = 2 * 60_000
const IDLE_CHECK_INTERVAL_MS = 20_000

export function createProcessCapability(deps: ProcessDeps): ProcessCapability {
  const ptys = new Map<string, IPty>()
  const durableSessions = new Map<string, TerminalDurability>()
  const platform = deps.platform ?? process.platform
  const hasTmux = deps.tmuxAvailable ?? probeTmux
  const stopTmuxSession = deps.killTmuxSession ?? terminateTmuxSession
  let tmuxProbe: Promise<boolean> | null = null
  let seq = 0

  // Idle-suspend state (only populated when idleEnabled && POSIX). Tracks per-pty
  // last output, visibility, and whether we've SIGSTOP'd it. `idleEnabled` is
  // mutable so the setting can be toggled live (setIdleSuspend); always false on
  // win32 (idle-suspend is POSIX-only).
  let idleEnabled = deps.idleSuspend === true && process.platform !== 'win32'
  const idle = new Map<string, IdleState>()
  let scanner: ReturnType<typeof setInterval> | null = null

  const suspend = (id: string): void => {
    const pid = ptys.get(id)?.pid
    const state = idle.get(id)
    if (!pid || !state || state.suspended) return
    try { process.kill(-pid, 'SIGSTOP') } catch { /* gone */ }
    state.suspended = true
  }

  const resume = (id: string): void => {
    const pid = ptys.get(id)?.pid
    const state = idle.get(id)
    if (!pid || !state || !state.suspended) return
    try { process.kill(-pid, 'SIGCONT') } catch { /* gone */ }
    state.suspended = false
    state.lastOutputAt = Date.now()
  }

  const scan = (): void => {
    const now = Date.now()
    for (const [id, state] of idle) {
      if (state.visible || state.suspended) continue
      if (now - state.lastOutputAt < IDLE_SUSPEND_MS) continue
      suspend(id)
    }
  }

  const ensureScanner = (): void => {
    if (!idleEnabled || scanner) return
    scanner = setInterval(scan, IDLE_CHECK_INTERVAL_MS)
  }

  const stopScanner = (): void => {
    if (scanner) { clearInterval(scanner); scanner = null }
  }

  return {
    async create(
      opts: PtyCreateOptions,
      onData: (id: string, data: string) => void,
      onExit: (id: string, exitCode: number) => void,
    ): Promise<PtyHandle> {
      const id = opts.id ?? `pty-${Date.now()}-${Math.round(seq++ + Math.random() * 1e6).toString(36)}`
      const durability = opts.durability
      if (durability) {
        if (durability.mode !== 'tmux') {
          throw new Error(`Unsupported terminal durability mode: ${durability.mode}`)
        }
        if (platform === 'win32') {
          throw new Error('tmux terminal durability is available only on POSIX runtime hosts')
        }
        assertTmuxSessionName(durability.sessionName)
        tmuxProbe ??= hasTmux()
        if (!(await tmuxProbe)) {
          throw new Error('tmux terminal durability was requested, but tmux is unavailable on this runtime host')
        }
      }
      const ptySpawn = await getPtySpawn()
      const shell = deps.resolveShell(opts.shell)
      const requestedExecutable = opts.command?.executable ?? shell.path
      const args = opts.command?.args ?? shell.args
      const cwd = opts.cwd || os.homedir()
      // Merge caller env over the host env; when a CLI endpoint was injected
      // (CATE_API), also put the bundled `cate` on PATH so agents can run it.
      let env = catePathEnv({ ...deps.getEnv(), ...(opts.env ?? {}) })
      // Agent hook injection (opt-in per pty via opts.agentHooks): hook env
      // (endpoint/token/CATE_TERMINAL_ID) on the pty, workspace
      // hook files in its cwd. Failure degrades to a plain shell — a terminal
      // must never fail to open over hooks.
      if (deps.hooks && opts.agentHooks) {
        try {
          env = await deps.hooks.envForPty(id, env)
          await deps.hooks.prepareWorkspace(cwd, opts.agentHookConfig, opts.workspaceBaseCwd)
        } catch { /* hook injection unavailable */ }
      }
      const windowsCommand = platform === 'win32'
        ? resolveWindowsCommand(requestedExecutable, args, env)
        : { executable: requestedExecutable, args }
      const executable = windowsCommand.executable
      const launchArgs = windowsCommand.args
      const pty = ptySpawn(
        durability ? 'tmux' : executable,
        durability ? buildTmuxAttachArgs({
          sessionName: durability.sessionName,
          cwd,
          cols: opts.cols,
          rows: opts.rows,
          executable,
          args: launchArgs,
        }) : launchArgs,
        {
        name: 'xterm-256color',
        cols: opts.cols,
        rows: opts.rows,
        // Empty cwd → the host's home dir (resolved on whichever host this
        // capability runs on: the local machine or the remote daemon).
        cwd,
        env,
        },
      )
      ptys.set(id, pty)
      if (durability) durableSessions.set(id, durability)
      if (idleEnabled) {
        idle.set(id, { lastOutputAt: Date.now(), visible: true, suspended: false })
        ensureScanner()
      }
      pty.onData((data) => {
        const state = idle.get(id)
        if (state) state.lastOutputAt = Date.now()
        onData(id, data)
      })
      pty.onExit(({ exitCode }) => {
        ptys.delete(id)
        durableSessions.delete(id)
        idle.delete(id)
        deps.agentPresence?.drop(id)
        onExit(id, exitCode)
      })
      return {
        id,
        pid: pty.pid,
        notice: opts.command ? undefined : shell.notice,
        shell: executable,
        durability,
      }
    },

    write(id: string, data: string): void {
      const pty = ptys.get(id)
      if (!pty) return
      if (idle.get(id)?.suspended) resume(id)
      try { pty.write(data) } catch { /* fd closed between exit and write */ }
    },

    resize(id: string, cols: number, rows: number): void {
      try { ptys.get(id)?.resize(cols, rows) } catch { /* pty gone */ }
    },

    kill(id: string): void {
      const pty = ptys.get(id)
      if (!pty) return
      if (idle.get(id)?.suspended) resume(id)
      const durability = durableSessions.get(id)
      if (durability) {
        // User-initiated close owns the durable session as well as its client.
        stopTmuxSession(durability.sessionName)
      }
      // Kill the whole process GROUP so children (dev servers) don't linger,
      // then still call node-pty's own kill. POSIX-only (negative-pid group
      // signalling); on win32 keep node-pty's plain kill. Killing an already-
      // gone group is a caught no-op, so this stays idempotent.
      if (!durability && platform !== 'win32') {
        try { process.kill(-pty.pid, 'SIGTERM') } catch { /* group already gone */ }
      }
      try { pty.kill() } catch { /* already dead */ }
      ptys.delete(id)
      durableSessions.delete(id)
      idle.delete(id)
      deps.agentPresence?.drop(id)
    },

    async getCwd(id: string): Promise<string | null> {
      const pty = ptys.get(id)
      if (!pty) return null
      return cwdForPid(pty.pid)
    },

    setVisibility(id: string, visible: boolean): void {
      // With idle-suspend off this stays a no-op (the in-process local host runs
      // its OWN idle-suspend layer). On: track visibility + SIGCONT-resume a
      // suspended pty as it becomes visible again.
      const state = idle.get(id)
      if (!state) return
      state.visible = visible
      if (visible && state.suspended) resume(id)
    },

    async scanActivity(ids: string[]): Promise<Record<string, PtyActivity>> {
      const owned = ids
        // A suspended pty's process tree is frozen (SIGSTOP) — skip it so we
        // don't scan a stale snapshot of a stopped tree.
        .filter((id) => idle.get(id)?.suspended !== true)
        .map((id) => ({ id, pid: ptys.get(id)?.pid }))
        .filter((e): e is { id: string; pid: number } => e.pid != null)
      if (owned.length === 0 || process.platform === 'win32') return {}
      const tree = await snapshotProcessTree()
      const out: Record<string, PtyActivity> = {}
      for (const { id, pid } of owned) {
        // Agent fields come from the hook-registered pid's liveness against
        // this same snapshot — same 1 Hz authority for "agent gone" as
        // before, but anchored to a pid the agent itself proved, not to a
        // position in the pty's tree.
        const presence = deps.agentPresence?.presenceFor(id, tree) ?? { agentName: null, agentPresent: false }
        out[id] = { activity: activityForPid(pid, tree), ...presence }
      }
      return out
    },

    async scanPorts(ids: string[]): Promise<Record<string, number[]>> {
      const owned = ids
        .map((id) => ({ id, pid: ptys.get(id)?.pid }))
        .filter((e): e is { id: string; pid: number } => e.pid != null)
      if (owned.length === 0 || process.platform === 'win32') return {}
      const tree = await snapshotProcessTree()

      // Map every pid in each pty's subtree back to its pty id.
      const pidToPty = new Map<number, string>()
      for (const { id, pid } of owned) {
        pidToPty.set(pid, id)
        for (const child of descendantsOf(pid, tree)) pidToPty.set(child, id)
      }
      const pids = Array.from(pidToPty.keys())
      if (pids.length === 0) return {}

      // Linux: cross /proc/net/tcp{,6} with each pid's socket fds (no fork — #246).
      if (isLinux) {
        const byPid = await listeningPortsByPidProc(pids)
        const result: Record<string, number[]> = {}
        for (const [pid, ports] of byPid) {
          const id = pidToPty.get(pid)
          if (!id) continue
          const acc = result[id] ?? (result[id] = [])
          for (const port of ports) if (!acc.includes(port)) acc.push(port)
        }
        return result
      }

      return new Promise((resolve) => {
        // `-a` ANDs the network filter with `-p <pids>` so lsof inspects ONLY
        // these process trees (without it lsof ORs the filters → whole system).
        execFile('lsof', ['-iTCP', '-sTCP:LISTEN', '-P', '-n', '-a', '-p', pids.join(','), '-F', 'pn'], {
          timeout: 5000,
        }, (err, stdout) => {
          const result: Record<string, number[]> = {}
          // Parse regardless of exit status: lsof exits 1 when some requested
          // pids have no listeners but still emits records for those that do.
          if (!stdout) { resolve(result); return }
          let currentPid: number | null = null
          for (const line of stdout.split('\n')) {
            if (line.startsWith('p')) {
              currentPid = parseInt(line.slice(1), 10)
            } else if (line.startsWith('n') && currentPid != null) {
              const id = pidToPty.get(currentPid)
              if (!id) continue
              const match = line.match(/:(\d+)$/)
              if (!match) continue
              const port = parseInt(match[1], 10)
              const ports = result[id] ?? (result[id] = [])
              if (!ports.includes(port)) ports.push(port)
            }
          }
          resolve(result)
        })
      })
    },

    setIdleSuspend(enabled: boolean): void {
      // POSIX-only; win32 stays a no-op (idleEnabled is already false there).
      if (process.platform === 'win32') return
      if (enabled === idleEnabled) return
      idleEnabled = enabled
      if (enabled) {
        // Start tracking every live pty (none have idle state if we were off at
        // create time), then start the scanner.
        const now = Date.now()
        for (const id of ptys.keys()) {
          if (!idle.has(id)) idle.set(id, { lastOutputAt: now, visible: true, suspended: false })
        }
        ensureScanner()
      } else {
        // Stop the scanner and SIGCONT-resume anything we'd suspended, so no pty
        // is left frozen, then drop the tracking state entirely.
        stopScanner()
        for (const id of [...idle.keys()]) resume(id)
        idle.clear()
      }
    },

    async killAllGroups(): Promise<void> {
      stopScanner()
      // node-pty tears down the Windows ConPTY helper from its asynchronous
      // `onExit` callback. Collect those completions before signalling anything:
      // a daemon-level process.exit() immediately after pty.kill() otherwise
      // cuts the callback off and leaves conpty_console_list_agent orphaned.
      // The waits are concurrent and bounded, so a broken PTY never wedges a
      // host shutdown indefinitely.
      const ptyExit = (pty: IPty, timeoutMs = 1_000): Promise<void> =>
      new Promise((resolve) => {
          let done = false
          const finish = (): void => {
            if (done) return
            done = true
            subscription.dispose()
            clearTimeout(timer)
            resolve()
          }
          const subscription = pty.onExit(finish)
          const timer = setTimeout(finish, timeoutMs)
          if (timer.unref) timer.unref()
        })
      const livePtys = [...ptys.values()]
      const reaped = livePtys.map((pty) => ptyExit(pty))
      if (platform === 'win32') {
        for (const pty of livePtys) { try { pty.kill() } catch { /* gone */ } }
        ptys.clear()
        durableSessions.clear()
        idle.clear()
        // Start the helper cleanup after kill() has synchronously requested all
        // console lists, while waiting for PTY exits in parallel. A bounded
        // helper wait prevents both leaks and a wedged native PTY from blocking
        // daemon shutdown indefinitely.
        await Promise.all([Promise.all(reaped), reapConptyAgents()])
        return
      }
      // SIGKILL each live pty's whole process group so dev-server children die
      // with the daemon. A durable pty is only the tmux client: close that
      // client so the tmux server and its pane survive daemon shutdown.
      for (const [id, pty] of ptys) {
        if (durableSessions.has(id)) {
          try { pty.kill() } catch { /* gone */ }
          continue
        }
        // SIGCONT first so a SIGSTOP-suspended group can receive the kill (a
        // stopped process won't act on a pending SIGKILL until resumed).
        try { process.kill(-pty.pid, 'SIGCONT') } catch { /* gone */ }
        try { process.kill(-pty.pid, 'SIGKILL') } catch { /* already gone */ }
      }
      ptys.clear()
      durableSessions.clear()
      idle.clear()
      await Promise.all(reaped)
    },
  }
}
