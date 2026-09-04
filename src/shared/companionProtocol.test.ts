import { describe, expect, test } from 'vitest'
import {
  COMPANION_PROTOCOL_VERSION,
  isCompanionReadMethod,
  normalizeCompanionPairingInvitation,
  normalizeCompanionRequest,
  validateRelayFrame,
} from './companionProtocol'

describe('companion protocol', () => {
  test('accepts bounded read requests and excludes terminal scrollback', () => {
    const request = normalizeCompanionRequest({
      version: COMPANION_PROTOCOL_VERSION,
      requestId: 'read-1',
      sessionId: 'session-1',
      nonce: 'nonce-1',
      issuedAt: 1_000,
      expiresAt: 30_000,
      capability: 'read',
      method: 'cate.panel.list',
      args: { workspaceId: 'ws-1' },
    }, 2_000)

    expect(request.method).toBe('cate.panel.list')
    expect(isCompanionReadMethod('cate.panel.list')).toBe(true)
    expect(isCompanionReadMethod('cate.terminal.read')).toBe(false)
  })

  test('rejects expired, oversized, and unapproved action envelopes', () => {
    const base = {
      version: COMPANION_PROTOCOL_VERSION,
      requestId: 'request-1',
      sessionId: 'session-1',
      nonce: 'nonce-1',
      issuedAt: 1_000,
      expiresAt: 30_000,
      capability: 'approve' as const,
      method: 'cate.codingAgent.send' as const,
    }
    expect(() => normalizeCompanionRequest(base, 30_000)).toThrow('expired')
    expect(() => normalizeCompanionRequest({ ...base, approvalId: 'a', args: 'x'.repeat(140_000) }, 2_000)).toThrow('too large')
    expect(() => normalizeCompanionRequest({ ...base }, 2_000)).toThrow('requires approval')
  })

  test('validates relay metadata while leaving the payload opaque', () => {
    const frame = validateRelayFrame({
      version: COMPANION_PROTOCOL_VERSION,
      frameId: 'frame-1',
      channelId: 'channel-1',
      sender: 'desktop',
      issuedAt: 1_000,
      expiresAt: 30_000,
      ciphertext: 'base64-or-encrypted-bytes',
    }, 2_000)
    expect(frame.ciphertext).toBe('base64-or-encrypted-bytes')
    expect(() => validateRelayFrame({ ...frame, expiresAt: 1_000 }, 2_000)).toThrow('expired')
  })

  test('normalizes bounded invitations and rejects unsafe relay URLs', () => {
    const invitation = normalizeCompanionPairingInvitation({
      version: COMPANION_PROTOCOL_VERSION,
      pairingId: 'pairing-1',
      workspaceId: 'workspace-1',
      relayUrl: 'https://relay.example.test',
      channelId: 'channel-1',
      relayToken: 'relay-token',
      sessionId: 'session-1',
      hostPublicKey: 'jwk1-public',
      expiresAt: 30_000,
    }, 2_000)
    expect(invitation.relayUrl).toBe('https://relay.example.test')
    expect(() => normalizeCompanionPairingInvitation({
      ...invitation,
      relayUrl: 'https://user:password@relay.example.test',
    }, 2_000)).toThrow('invalid companion relay URL')
  })
})
