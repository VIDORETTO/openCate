import { describe, expect, it, vi } from 'vitest'
import { CateApiClient, CateApiError, CateApiTransportError } from './cateClient'

function response(body: unknown, status = 200): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response
}

describe('CateApiClient', () => {
  it('uses the workspace API envelope and exposes typed resource helpers', async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => response({
      result: { items: [], total: 0 },
    }))
    const client = new CateApiClient({
      baseUrl: 'http://127.0.0.1:4123/',
      token: 'secret',
      fetch: fetch as unknown as typeof globalThis.fetch,
      clientId: 'cli-session',
      callerPanelId: 'terminal-1',
      originCwd: '/workspace/project',
    })

    await expect(client.tasks.list({ status: 'completed', limit: 5 })).resolves.toEqual({ items: [], total: 0 })
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.headers).toMatchObject({ Authorization: 'Bearer secret' })
    expect(JSON.parse(init.body as string)).toEqual({
      method: 'cate.tasks.list',
      args: { status: 'completed', limit: 5 },
      clientId: 'cli-session',
      callerPanelId: 'terminal-1',
      originCwd: '/workspace/project',
    })
  })

  it('maps HTTP and in-band errors to stable typed errors', async () => {
    const httpClient = new CateApiClient({
      baseUrl: 'http://api.test',
      token: 'x',
      fetch: vi.fn(async () => response({ error: 'unauthorized' }, 401)) as unknown as typeof globalThis.fetch,
    })
    await expect(httpClient.version()).rejects.toMatchObject({
      name: 'CateApiError',
      method: 'cate.version',
      status: 401,
      code: 'unauthorized',
    } satisfies Partial<CateApiError>)

    const inBandClient = new CateApiClient({
      baseUrl: 'http://api.test',
      token: 'x',
      fetch: vi.fn(async () => response({ result: { error: 'no-such-task' } })) as unknown as typeof globalThis.fetch,
    })
    await expect(inBandClient.tasks.get('missing')).rejects.toMatchObject({
      name: 'CateApiError',
      method: 'cate.tasks.get',
      code: 'no-such-task',
    } satisfies Partial<CateApiError>)
  })

  it('reports malformed responses separately from API errors', async () => {
    const client = new CateApiClient({
      baseUrl: 'http://api.test',
      token: 'x',
      fetch: vi.fn(async () => response({ ok: true })) as unknown as typeof globalThis.fetch,
    })
    await expect(client.project.get()).rejects.toBeInstanceOf(CateApiTransportError)
  })
})
