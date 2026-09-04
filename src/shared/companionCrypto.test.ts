import { describe, expect, test } from 'vitest'
import {
  companionRelayAssociatedData,
  createCompanionIdentity,
  decryptCompanionPayload,
  deriveCompanionKey,
  encryptCompanionPayload,
  openCompanionRelayFrame,
  sealCompanionRelayFrame,
} from './companionCrypto'

describe('companion end-to-end crypto', () => {
  test('derives the same key on both sides and authenticates payload metadata', async () => {
    const host = await createCompanionIdentity()
    const companion = await createCompanionIdentity()
    const hostKey = await deriveCompanionKey(host, companion.publicKey, 'pairing-1')
    const companionKey = await deriveCompanionKey(companion, host.publicKey, 'pairing-1')
    const payload = { type: 'request', request: { requestId: 'req-1', value: 'private' } }

    const encrypted = await encryptCompanionPayload(payload, companionKey, 'channel-a')
    await expect(decryptCompanionPayload(encrypted, hostKey, 'channel-a')).resolves.toEqual(payload)
    await expect(decryptCompanionPayload(encrypted, hostKey, 'channel-b')).rejects.toThrow(
      'unable to decrypt companion payload',
    )
  })

  test('binds relay frame identity and expiry to the authenticated ciphertext', async () => {
    const host = await createCompanionIdentity()
    const companion = await createCompanionIdentity()
    const key = await deriveCompanionKey(host, companion.publicKey, 'pairing-2')
    const frame = await sealCompanionRelayFrame({
      channelId: 'channel-a',
      sender: 'desktop',
      key,
      message: { type: 'response', response: { version: 1, requestId: 'req-2', ok: true, result: 42 } },
      issuedAt: 10_000,
      ttlMs: 10_000,
      frameId: 'frame-1',
    })

    await expect(openCompanionRelayFrame(frame, key, 15_000)).resolves.toMatchObject({
      type: 'response',
      response: { result: 42 },
    })
    const altered = { ...frame, sender: 'companion' as const }
    await expect(openCompanionRelayFrame(altered, key, 15_000)).rejects.toThrow(
      'unable to decrypt companion payload',
    )
    expect(companionRelayAssociatedData(frame)).not.toBe(companionRelayAssociatedData(altered))
  })
})
