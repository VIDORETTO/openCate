import { expect, test } from 'vitest'
import {
  encodeCompanionPairingProof,
  encodeCompanionPairingUri,
  parseCompanionPairingProof,
  parseCompanionPairingUri,
} from './companionPairing'

const NOW = 1_700_000_000_000

function invitation() {
  return {
    version: 1 as const,
    pairingId: 'pairing-1',
    workspaceId: 'workspace-1',
    relayUrl: 'https://relay.example.test',
    channelId: 'channel-1',
    relayToken: 'relay-token',
    sessionId: 'session-1',
    hostPublicKey: 'jwk1.public',
    expiresAt: NOW + 60_000,
  }
}

test('QR URI round-trips the invitation without embedding the pairing code', () => {
  const uri = encodeCompanionPairingUri(invitation(), NOW)
  expect(uri.startsWith('cate-companion://pair?invite=')).toBe(true)
  expect(uri).not.toContain('123456')
  expect(parseCompanionPairingUri(uri, NOW)).toEqual(invitation())
})

test('pairing proofs are bounded JSON contracts', () => {
  const proof = {
    version: 1 as const,
    pairingId: 'pairing-1',
    code: '123456',
    companionPublicKey: 'jwk1.companion',
    label: 'Phone',
  }
  expect(parseCompanionPairingProof(encodeCompanionPairingProof(proof))).toEqual(proof)
  expect(() => parseCompanionPairingProof(JSON.stringify({ ...proof, code: '12' }))).toThrow('invalid companion pairing proof')
})
