import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, test, vi } from 'vitest'
import { createCompanionIdentity, deriveCompanionKey } from '../../shared/companionCrypto'
import type { CompanionPairingInvitation } from '../../shared/companionProtocol'
import { CompanionClient } from '../../sdk/companionClient'
import { CompanionGateway } from './companionGateway'
import { CompanionRelayServer } from './relayServer'
import { CompanionRelayResponder } from './relayResponder'

const execFileAsync = promisify(execFile)

test.skipIf(process.env.CATE_COMPANION_PROXY !== '1')('round-trips through an authenticated TLS proxy across token rotation and restart', async () => {
  await assertCaddyAvailable()

  const tempRoot = await mkdtemp(join(tmpdir(), 'cate-companion-proxy-'))
  const storageRoot = join(tempRoot, 'caddy-data')
  const configPath = join(tempRoot, 'Caddyfile')
  await mkdir(storageRoot, { recursive: true })

  let relay: CompanionRelayServer | undefined
  let responder: CompanionRelayResponder | undefined
  let caddy: CaddyHandle | undefined
  try {
    relay = new CompanionRelayServer()
    const relayAddress = await relay.listen()
    const relayBaseUrl = `http://${relayAddress.host}:${relayAddress.port}`
    const channelResponse = await fetch(`${relayBaseUrl}/v1/channels`, { method: 'POST' })
    expect(channelResponse.status).toBe(201)
    const channel = await channelResponse.json() as { channelId: string; token: string; expiresAt: number }

    const proxyPort = await pickPort()
    const adminPort = await pickPort()
    const initialProxyToken = randomBytes(24).toString('hex')
    let proxyToken = initialProxyToken
    const proxyUrl = `https://localhost:${proxyPort}`
    await writeFile(configPath, caddyfile({
      adminPort,
      proxyPort,
      proxyToken,
      relayPort: relayAddress.port,
      storageRoot,
    }))
    caddy = startCaddy(configPath)

    const rootCertificatePath = join(storageRoot, 'pki', 'authorities', 'local', 'root.crt')
    await waitFor('Caddy local root certificate', () => existsSync(rootCertificatePath), 20_000, caddy)
    const ca = await readFile(rootCertificatePath)
    const proxyFetch = createProxyFetch(ca, () => proxyToken)
    await waitFor('authenticated Caddy proxy', async () => {
      const response = await proxyFetch(`${proxyUrl}/health`)
      await response.arrayBuffer()
      return response.status === 200
    }, 20_000, caddy)

    const unauthenticatedFetch = createProxyFetch(ca, () => 'wrong-proxy-token')
    const unauthorized = await unauthenticatedFetch(`${proxyUrl}/health`)
    expect(unauthorized.status).toBe(401)

    const gateway = new CompanionGateway({
      forward: vi.fn(),
      dispatch: vi.fn(async (scope, method, args) => ({
        workspaceId: scope.workspaceId,
        method,
        args,
      })),
    })
    const session = gateway.issueSession('workspace-proxy', true)
    const host = await createCompanionIdentity()
    const companion = await createCompanionIdentity()
    const hostKey = await deriveCompanionKey(host, companion.publicKey, 'proxy-pairing')
    const invitation: CompanionPairingInvitation = {
      version: 1,
      pairingId: 'proxy-pairing',
      workspaceId: 'workspace-proxy',
      relayUrl: proxyUrl,
      channelId: channel.channelId,
      relayToken: channel.token,
      sessionId: session.sessionId,
      hostPublicKey: host.publicKey,
      expiresAt: Date.now() + 120_000,
    }
    const client = await CompanionClient.fromInvitation(invitation, companion, {
      fetch: proxyFetch,
      pollIntervalMs: 25,
      timeoutMs: 5_000,
    })
    responder = new CompanionRelayResponder({
      connection: { relayUrl: proxyUrl, channelId: channel.channelId, relayToken: channel.token },
      sessionId: session.sessionId,
      sessionToken: session.token,
      key: hostKey,
      gateway,
      fetch: proxyFetch,
      pollIntervalMs: 25,
    })
    responder.start()

    await expect(client.read('cate.workspace.get')).resolves.toMatchObject({
      workspaceId: 'workspace-proxy',
      method: 'cate.workspace.get',
    })

    const rotatedProxyToken = randomBytes(24).toString('hex')
    await writeFile(configPath, caddyfile({
      adminPort,
      proxyPort,
      proxyToken: rotatedProxyToken,
      relayPort: relayAddress.port,
      storageRoot,
    }))
    await reloadCaddy(configPath, adminPort)
    proxyToken = rotatedProxyToken
    await waitFor('reloaded Caddy proxy', async () => {
      const response = await proxyFetch(`${proxyUrl}/health`)
      await response.arrayBuffer()
      return response.status === 200
    }, 20_000, caddy)
    const oldTokenResponse = await createProxyFetch(ca, () => initialProxyToken)(`${proxyUrl}/health`)
    expect(oldTokenResponse.status).toBe(401)
    await expect(client.read('cate.workspace.get')).resolves.toMatchObject({ method: 'cate.workspace.get' })

    await stopCaddy(caddy)
    caddy = startCaddy(configPath)
    await waitFor('restarted Caddy proxy', async () => {
      const response = await proxyFetch(`${proxyUrl}/health`)
      await response.arrayBuffer()
      return response.status === 200
    }, 20_000, caddy)
    await expect(client.read('cate.workspace.get')).resolves.toMatchObject({
      workspaceId: 'workspace-proxy',
      method: 'cate.workspace.get',
    })
  } finally {
    responder?.stop()
    await relay?.close()
    await stopCaddy(caddy)
    await rm(tempRoot, { recursive: true, force: true })
  }
}, 120_000)

interface CaddyfileOptions {
  adminPort: number
  proxyPort: number
  proxyToken: string
  relayPort: number
  storageRoot: string
}

interface CaddyHandle {
  child: ChildProcess
  logs: string[]
}

function caddyfile(options: CaddyfileOptions): string {
  const storagePath = JSON.stringify(options.storageRoot.replace(/\\/gu, '/'))
  return [
    '{',
    `    admin 127.0.0.1:${options.adminPort}`,
    '    storage file_system {',
    `        root ${storagePath}`,
    '    }',
    '    auto_https disable_redirects',
    '    skip_install_trust',
    '}',
    '',
    `https://localhost:${options.proxyPort} {`,
    '    tls internal',
    `    @authorized header X-Cate-Proxy-Token ${options.proxyToken}`,
    '    handle @authorized {',
    `        reverse_proxy 127.0.0.1:${options.relayPort}`,
    '    }',
    '    handle {',
    '        respond "unauthorized" 401',
    '    }',
    '}',
    '',
  ].join('\n')
}

function startCaddy(configPath: string): CaddyHandle {
  const child = spawn('caddy', ['run', '--config', configPath, '--adapter', 'caddyfile'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const logs: string[] = []
  const capture = (chunk: Buffer): void => {
    logs.push(chunk.toString('utf8'))
    while (logs.join('').length > 12_000) logs.shift()
  }
  child.stdout?.on('data', capture)
  child.stderr?.on('data', capture)
  return { child, logs }
}

async function stopCaddy(handle: CaddyHandle | undefined): Promise<void> {
  if (!handle || handle.child.exitCode !== null) return
  handle.child.kill('SIGTERM')
  await Promise.race([
    new Promise<void>((resolve) => handle.child.once('exit', () => resolve())),
    delay(2_000),
  ])
  if (handle.child.exitCode === null) handle.child.kill('SIGKILL')
}

async function reloadCaddy(configPath: string, adminPort: number): Promise<void> {
  await execFileAsync('caddy', [
    'reload',
    '--address',
    `127.0.0.1:${adminPort}`,
    '--config',
    configPath,
    '--adapter',
    'caddyfile',
  ])
}

function createProxyFetch(ca: Buffer, getProxyToken: () => string): typeof fetch {
  return (input, init = {}) => {
    const url = typeof input === 'string'
      ? new URL(input)
      : input instanceof URL
        ? input
        : new URL(input.url)
    const headers = new Headers(init.headers)
    headers.set('X-Cate-Proxy-Token', getProxyToken())
    const body = typeof init.body === 'string' || init.body instanceof Uint8Array ? init.body : undefined

    return new Promise<Response>((resolve, reject) => {
      const request = httpsRequest(url, {
        method: init.method ?? 'GET',
        headers: Object.fromEntries(headers.entries()),
        ca,
        rejectUnauthorized: true,
      }, (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.once('error', reject)
        response.once('end', () => {
          const responseHeaders = new Headers()
          for (const [name, value] of Object.entries(response.headers)) {
            if (typeof value === 'string') responseHeaders.set(name, value)
            else if (Array.isArray(value)) responseHeaders.set(name, value.join(', '))
          }
          resolve(new Response(Buffer.concat(chunks), {
            status: response.statusCode ?? 0,
            statusText: response.statusMessage ?? '',
            headers: responseHeaders,
          }))
        })
      })
      request.once('error', reject)
      if (init.signal) {
        const abort = (): void => {
          request.destroy(new Error('The operation was aborted'))
        }
        if (init.signal.aborted) abort()
        else {
          init.signal.addEventListener('abort', abort, { once: true })
          request.once('close', () => init.signal?.removeEventListener('abort', abort))
        }
      }
      if (body !== undefined) request.end(body)
      else request.end()
    })
  }
}

async function assertCaddyAvailable(): Promise<void> {
  try {
    await execFileAsync('caddy', ['version'])
  } catch (error) {
    throw new Error(`Caddy is required for this live test: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function pickPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    await closeServer(server)
    throw new Error('temporary port server did not expose an address')
  }
  const port = address.port
  await closeServer(server)
  return port
}

async function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
}

async function waitFor(
  label: string,
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  caddy: CaddyHandle,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    if (caddy.child.exitCode !== null) {
      throw new Error(`${label} failed because Caddy exited: ${caddy.logs.join('').slice(-2_000)}`)
    }
    try {
      if (await predicate()) return
    } catch (error) {
      lastError = error
    }
    await delay(100)
  }
  const caddyLog = caddy.logs.join('').slice(-8_000)
  throw new Error(`${label} did not become ready${lastError instanceof Error ? `: ${lastError.message}` : ''}${caddyLog ? `; Caddy logs: ${caddyLog}` : ''}`)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
