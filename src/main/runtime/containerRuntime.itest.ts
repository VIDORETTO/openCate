// Real Docker/Podman integration coverage for the container transport.
// Opt in with CATE_CONTAINER_E2E=1 and provide CATE_CONTAINER_IMAGE. The image
// must contain the fixed Cate runtime paths documented in CONTAINER_RUNTIME.md.

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { RemoteRuntime } from './RemoteRuntime'
import { RuntimeRpcClient } from './rpcClient'
import { ContainerTransport } from './transports/containerTransport'

const image = process.env.CATE_CONTAINER_IMAGE ?? ''
const enabled = process.env.CATE_CONTAINER_E2E === '1' && image.length > 0
const engine: 'docker' | 'podman' = process.env.CATE_CONTAINER_ENGINE === 'podman' ? 'podman' : 'docker'

let root = ''
let transport: ContainerTransport | undefined
let client: RuntimeRpcClient | undefined
let readOnlyTransport: ContainerTransport | undefined
let readOnlyClient: RuntimeRpcClient | undefined

beforeAll(async () => {
  if (!enabled) return
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'cate-container-e2e-')))
  await fs.writeFile(path.join(root, 'container-marker.txt'), 'read from Cate container\n')
  transport = new ContainerTransport({
    engine,
    image,
    root: '/workspace',
    id: `container-e2e-${process.pid}`,
    workspaceHostPath: root,
    workspaceContainerPath: '/workspace',
    networkMode: 'none',
    platform: process.platform,
  })
  await expect(transport.isInstalled('container-e2e')).resolves.toBe(true)
  await transport.bootstrap('container-e2e')

  const channel = await transport.launch()
  client = new RuntimeRpcClient((line) => channel.write(line))
  channel.onData((chunk) => client?.handleChunk(chunk))
  channel.onClose(({ code }) => client?.dispose(`container exited (${code ?? 'unknown'})`))
  await expect(client.ready).resolves.toMatchObject({ protocolVersion: expect.any(Number) })
}, 60_000)

afterAll(async () => {
  client?.dispose('container smoke complete')
  await transport?.dispose()
  readOnlyClient?.dispose('read-only container smoke complete')
  await readOnlyTransport?.dispose()
  if (root) await fs.rm(root, { recursive: true, force: true })
})

describe.skipIf(!enabled)(`ContainerTransport real ${engine} E2E`, () => {
  test('handshakes, serves the mounted workspace, and enforces the root boundary', async () => {
    if (!client || !root) throw new Error('container fixture was not created')
    const runtime = new RemoteRuntime(`container-e2e-${process.pid}`, client)
    const marker = await runtime.validatePathStrict('/workspace/container-marker.txt')
    expect(await runtime.file.readFile(marker)).toBe('read from Cate container\n')

    const written = path.join(root, 'written-by-container.txt')
    await runtime.file.writeFile('/workspace/written-by-container.txt', `written through ${engine}\n`)
    await expect(fs.readFile(written, 'utf8')).resolves.toBe(`written through ${engine}\n`)
    await expect(runtime.validatePathStrict('/etc/passwd')).rejects.toThrow()
  }, 60_000)

  test('honors a read-only workspace mount', async () => {
    if (!root) throw new Error('container fixture was not created')
    readOnlyTransport = new ContainerTransport({
      engine,
      image,
      root: '/workspace',
      id: `container-e2e-readonly-${process.pid}`,
      workspaceHostPath: root,
      workspaceContainerPath: '/workspace',
      workspaceReadOnly: true,
      networkMode: 'none',
      platform: process.platform,
    })
    await expect(readOnlyTransport.isInstalled('container-e2e-readonly')).resolves.toBe(true)
    await readOnlyTransport.bootstrap('container-e2e-readonly')

    const channel = await readOnlyTransport.launch()
    readOnlyClient = new RuntimeRpcClient((line) => channel.write(line))
    channel.onData((chunk) => readOnlyClient?.handleChunk(chunk))
    channel.onClose(({ code }) => readOnlyClient?.dispose(`read-only container exited (${code ?? 'unknown'})`))
    await expect(readOnlyClient.ready).resolves.toMatchObject({ protocolVersion: expect.any(Number) })

    const runtime = new RemoteRuntime(`container-e2e-readonly-${process.pid}`, readOnlyClient)
    const marker = await runtime.validatePathStrict('/workspace/container-marker.txt')
    await expect(runtime.file.readFile(marker)).resolves.toBe('read from Cate container\n')
    await expect(runtime.file.writeFile('/workspace/should-not-write.txt', 'denied\n')).rejects.toThrow()
    readOnlyClient.dispose('read-only container smoke complete')
    await readOnlyTransport.dispose()
    readOnlyClient = undefined
    readOnlyTransport = undefined
  }, 60_000)
})
