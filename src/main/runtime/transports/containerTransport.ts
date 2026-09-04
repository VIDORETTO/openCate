// =============================================================================
// ContainerTransport — runs the standalone runtime inside a declared Docker or
// Podman image. The host contributes exactly one explicit bind mount and an
// explicit environment allowlist; no host environment or filesystem is passed
// through implicitly.
// =============================================================================

import { execFile, spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from 'child_process'
import path from 'path'
import type { RuntimeChannel, RuntimeTransport } from './transport'

export const CONTAINER_RUNTIME_NODE_PATH = '/opt/cate/runtime/bin/node'
export const CONTAINER_RUNTIME_SCRIPT_PATH = '/opt/cate/runtime/runtime.cjs'

type ContainerEngine = 'docker' | 'podman'
type ContainerNetworkMode = 'none' | 'bridge'

export interface ContainerOptions {
  engine: ContainerEngine
  image: string
  /** Runtime-absolute workspace root inside the container. */
  root: string
  id: string
  /** Host path explicitly granted to the container. */
  workspaceHostPath: string
  /** Container path where the host workspace is mounted. */
  workspaceContainerPath: string
  workspaceReadOnly?: boolean
  networkMode?: ContainerNetworkMode
  /** Names only; values are read from the host environment at launch. */
  envAllowlist?: string[]
  exclusions?: string[]
  idleSuspend?: boolean
  /** Test seam; production uses the system child_process implementations. */
  spawn?: typeof nodeSpawn
  execFile?: typeof execFile
  hostEnv?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
}

function assertImage(image: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/@:-]*$/.test(image)) {
    throw new Error('Container image must be a valid image reference without whitespace')
  }
}

function assertPosixAbsolute(value: string, label: string): void {
  if (!value.startsWith('/') || value.includes('\0')) {
    throw new Error(`${label} must be an absolute POSIX path`)
  }
}

function assertHostPath(value: string, platform: NodeJS.Platform): void {
  const absolute = platform === 'win32' ? path.win32.isAbsolute(value) : path.posix.isAbsolute(value)
  if (!absolute || value.includes('\0') || value.includes(',')) {
    throw new Error('Container workspace host path must be absolute and cannot contain commas')
  }
}

function assertInsideMount(root: string, mount: string): void {
  const normalizedMount = path.posix.normalize(mount).replace(/\/$/, '') || '/'
  const normalizedRoot = path.posix.normalize(root)
  if (normalizedRoot !== normalizedMount && !normalizedRoot.startsWith(`${normalizedMount}/`)) {
    throw new Error('Container runtime root must stay inside the mounted workspace')
  }
}

function assertEnvNames(names: string[]): void {
  for (const name of names) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(`Invalid container environment name: ${name}`)
    }
  }
}

const fiftyChars = 50

function containerName(id: string): string {
  const safe = id.replace(/[^A-Za-z0-9_.-]/g, '-').replace(/^-+|-+$/g, '').slice(-fiftyChars)
  return `cate-runtime-${safe || 'session'}`
}

function mountSpec(options: ContainerOptions): string {
  return `type=bind,source=${options.workspaceHostPath},target=${options.workspaceContainerPath}${options.workspaceReadOnly ? ',readonly' : ''}`
}

function runtimeNodePath(): string {
  return CONTAINER_RUNTIME_NODE_PATH
}

function runtimeScriptPath(): string {
  return CONTAINER_RUNTIME_SCRIPT_PATH
}

export function buildContainerRunArgs(options: ContainerOptions): string[] {
  const platform = options.platform ?? process.platform
  const workspaceContainerPath = path.posix.normalize(options.workspaceContainerPath)
  const root = path.posix.normalize(options.root)
  const envAllowlist = options.envAllowlist ?? []
  assertImage(options.image)
  assertPosixAbsolute(root, 'Container runtime root')
  assertPosixAbsolute(workspaceContainerPath, 'Container workspace mount')
  assertHostPath(options.workspaceHostPath, platform)
  assertInsideMount(root, workspaceContainerPath)
  assertEnvNames(envAllowlist)
  if (options.engine !== 'docker' && options.engine !== 'podman') {
    throw new Error(`Unsupported container engine: ${options.engine}`)
  }
  if (options.networkMode !== undefined && options.networkMode !== 'none' && options.networkMode !== 'bridge') {
    throw new Error(`Unsupported container network mode: ${options.networkMode}`)
  }
  const networkMode = options.networkMode ?? 'none'

  const args = [
    'run',
    '--rm',
    '--init',
    '--interactive',
    '--pull',
    'never',
    '--name',
    containerName(options.id),
    '--mount',
    mountSpec({ ...options, workspaceContainerPath }),
    '--workdir',
    root,
    '--network',
    networkMode,
  ]
  for (const name of envAllowlist) args.push('--env', name)
  args.push(
    '--entrypoint',
    runtimeNodePath(),
    options.image,
    runtimeScriptPath(),
    '--root',
    root,
    '--id',
    options.id,
  )
  if (options.exclusions?.length) args.push('--exclude', options.exclusions.join(','))
  if (options.idleSuspend) args.push('--idle-suspend')
  return args
}

export function buildContainerCheckArgs(options: ContainerOptions): string[] {
  const args = buildContainerRunArgs({ ...options, exclusions: undefined, idleSuspend: false })
  const entrypointIndex = args.indexOf('--entrypoint')
  const imageIndex = entrypointIndex + 2
  return [
    'run',
    '--rm',
    '--pull',
    'never',
    '--network',
    'none',
    '--mount',
    args[args.indexOf('--mount') + 1],
    '--workdir',
    args[args.indexOf('--workdir') + 1],
    '--entrypoint',
    '/bin/sh',
    args[imageIndex],
    '-c',
    `test -x ${CONTAINER_RUNTIME_NODE_PATH} && test -f ${CONTAINER_RUNTIME_SCRIPT_PATH}`,
  ]
}

function clientEnvironment(hostEnv: NodeJS.ProcessEnv, allowlist: string[], platform: NodeJS.Platform): NodeJS.ProcessEnv {
  const pathKey = platform === 'win32' && hostEnv.Path != null ? 'Path' : 'PATH'
  const env: NodeJS.ProcessEnv = {}
  if (hostEnv[pathKey] != null) env[pathKey] = hostEnv[pathKey]
  for (const name of allowlist) {
    if (hostEnv[name] != null) env[name] = hostEnv[name]
  }
  return env
}

function containerEngineUnavailable(error: unknown): Error | null {
  const details = String((error as { stderr?: unknown }).stderr ?? (error as { message?: unknown }).message ?? error)
  if (/cannot connect|daemon is not running|connection refused|permission denied|failed to connect/i.test(details)) {
    return new Error(`Container engine is unavailable: ${details.trim().replace(/\s+/g, ' ').slice(0, 300)}`)
  }
  return null
}

export class ContainerTransport implements RuntimeTransport {
  readonly kind = 'container'
  private child: ChildProcessWithoutNullStreams | null = null

  constructor(private readonly opts: ContainerOptions) {
    // Validate before any engine process is launched. This also keeps the
    // mount and image policy identical for probe and launch.
    buildContainerRunArgs(opts)
  }

  private get spawn(): typeof nodeSpawn {
    return this.opts.spawn ?? nodeSpawn
  }

  private get exec(): typeof execFile {
    return this.opts.execFile ?? execFile
  }

  private env(): NodeJS.ProcessEnv {
    return clientEnvironment(this.opts.hostEnv ?? process.env, this.opts.envAllowlist ?? [], this.opts.platform ?? process.platform)
  }

  async isInstalled(_version: string): Promise<boolean> {
    try {
      await new Promise<void>((resolve, reject) => {
        this.exec(this.opts.engine, buildContainerCheckArgs(this.opts), {
          env: this.env(),
          encoding: 'utf-8',
          timeout: 10_000,
          maxBuffer: 256 * 1024,
        }, (error) => error ? reject(error) : resolve())
      })
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Container engine "${this.opts.engine}" was not found on this host`)
      }
      const unavailable = containerEngineUnavailable(error)
      if (unavailable) throw unavailable
      return false
    }
  }

  async bootstrap(_version: string): Promise<void> {
    if (!(await this.isInstalled(_version))) {
      throw new Error(
        `Container image "${this.opts.image}" must include ${CONTAINER_RUNTIME_NODE_PATH} and ${CONTAINER_RUNTIME_SCRIPT_PATH}`,
      )
    }
  }

  async launch(): Promise<RuntimeChannel> {
    const child = this.spawn(this.opts.engine, buildContainerRunArgs(this.opts), {
      env: this.env(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    child.stdin?.on('error', () => { /* close is reported through onClose */ })
    this.child = child
    return {
      write: (line) => {
        const stdin = child.stdin
        if (!stdin || stdin.destroyed || stdin.writableEnded || child.exitCode !== null || child.signalCode !== null) {
          throw new Error('Runtime stdin is closed')
        }
        stdin.write(line)
      },
      onData: (cb) => { child.stdout.on('data', cb) },
      onStderr: (cb) => { child.stderr.on('data', cb) },
      onClose: (cb) => { child.on('close', (code) => cb({ code })) },
      kill: () => { child.kill() },
    }
  }

  async dispose(): Promise<void> {
    this.child?.kill()
    this.child = null
  }
}
