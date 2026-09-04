import { describe, expect, it, vi } from 'vitest'
import { Methods } from '../../runtime/protocol'
import { RemoteRuntime } from './RemoteRuntime'
import type { RuntimeRpcClient } from './rpcClient'

describe('RemoteRuntime server lifecycle', () => {
  it('keeps the server exit stream until the daemon reports termination', async () => {
    let onStream: ((payload: unknown) => void) | undefined
    const rpc = {
      call: vi.fn(async (method: string) => {
        if (method === Methods.serverStart) return { id: 'srv-1', pid: 42, port: 43123 }
        return undefined
      }),
      registerStream: vi.fn((_id: string, callback: (payload: unknown) => void) => {
        onStream = callback
      }),
      unregisterStream: vi.fn(),
    } as unknown as RuntimeRpcClient
    const runtime = new RemoteRuntime('srv-test', rpc)
    const onExit = vi.fn()

    await runtime.server.start(
      {
        id: 'srv-1',
        command: ['node', 'server.js'],
        cwd: '/tmp/extension',
        env: {},
        portEnv: 'PORT',
        readyPath: '/health',
        readyTimeoutMs: 5_000,
      },
      vi.fn(),
      onExit,
    )

    runtime.server.stop('srv-1')
    await Promise.resolve()
    expect(rpc.unregisterStream).not.toHaveBeenCalled()

    onStream?.({ kind: 'exit', code: null, signal: 'SIGTERM' })
    expect(onExit).toHaveBeenCalledWith('srv-1', null, 'SIGTERM')
    expect(rpc.unregisterStream).toHaveBeenCalledWith('srv-1')
  })
})
