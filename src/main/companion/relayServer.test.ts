import { afterEach, describe, expect, test } from 'vitest'
import { CompanionRelayServer } from './relayServer'

const NOW = 100_000
let relay: CompanionRelayServer | undefined

afterEach(async () => {
  await relay?.close()
  relay = undefined
})

describe('self-hosted companion relay', () => {
  test('forwards opaque frames without an account or plaintext access', async () => {
    relay = new CompanionRelayServer({ now: () => NOW })
    const address = await relay.listen()
    const base = `http://${address.host}:${address.port}`

    const created = await fetch(`${base}/v1/channels`, { method: 'POST' })
    const ticket = await created.json() as { channelId: string; token: string }
    const frame = {
      version: 1,
      frameId: 'frame-1',
      channelId: ticket.channelId,
      sender: 'desktop' as const,
      issuedAt: NOW,
      expiresAt: NOW + 10_000,
      ciphertext: 'encrypted-companion-request',
    }

    const pushed = await fetch(`${base}/v1/channels/${ticket.channelId}/frames`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ticket.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(frame),
    })
    expect(pushed.status).toBe(202)

    const read = await fetch(`${base}/v1/channels/${ticket.channelId}/frames?after=0`, {
      headers: { Authorization: `Bearer ${ticket.token}` },
    })
    expect(read.status).toBe(200)
    expect(await read.json()).toMatchObject({ frames: [frame], nextCursor: 1 })

    const denied = await fetch(`${base}/v1/channels/${ticket.channelId}/frames`, {
      headers: { Authorization: 'Bearer wrong-token' },
    })
    expect(denied.status).toBe(401)
  })

  test('refuses public binding by default policy', () => {
    expect(() => new CompanionRelayServer({ host: '0.0.0.0' })).toThrow('loopback')
  })

  test('normalizes a hosted companion CORS origin and rejects URL paths', async () => {
    relay = new CompanionRelayServer({ now: () => NOW, corsOrigin: 'https://companion.example.test/' })
    const address = await relay.listen()
    const response = await fetch(`http://${address.host}:${address.port}/health`)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://companion.example.test')
    expect(() => new CompanionRelayServer({ corsOrigin: 'https://companion.example.test/path' })).toThrow('CORS origin')
  })
})
