import { describe, expect, test, vi } from 'vitest'
import { createCompanionIdentity } from '../../shared/companionCrypto'
import { CompanionClient } from '../../sdk/companionClient'
import { CompanionGateway } from './companionGateway'
import { CompanionPairingManager } from './pairing'

describe('companion pairing lifecycle', () => {
  test('uses a one-time code, keeps session bearer host-side, and revokes devices', async () => {
    const gateway = new CompanionGateway({ forward: vi.fn(), dispatch: vi.fn(async () => ({ ok: true })) })
    const manager = new CompanionPairingManager(gateway)
    const started = await manager.begin({
      workspaceId: 'workspace-1',
      allowApprove: true,
      relay: {
        relayUrl: 'https://relay.example.test',
        channelId: 'channel-1',
        relayToken: 'relay-secret',
        expiresAt: Date.now() + 60_000,
      },
    })
    expect(started.code).toMatch(/^\d{6}$/u)
    expect(started.invitation).not.toHaveProperty('sessionToken')
    expect(started.invitation).not.toHaveProperty('privateKey')

    const companion = await createCompanionIdentity()
    const wrongCode = started.code === '000000' ? '000001' : '000000'
    await expect(manager.complete(
      started.invitation.pairingId,
      wrongCode,
      companion.publicKey,
      'Untrusted attempt',
    )).resolves.toBeNull()
    const proof = CompanionClient.createPairingProof(started.invitation, companion, started.code, { label: '  Phone\u0000  ' })
    const device = await manager.complete(proof.pairingId, proof.code, proof.companionPublicKey, proof.label)
    expect(device).toMatchObject({
      workspaceId: 'workspace-1',
      label: 'Phone',
      capabilities: ['read', 'approve'],
    })
    expect(manager.listDevices()).toHaveLength(1)
    const id = device!.deviceId
    const approval = manager.grantApproval(id, 'cate.tasks.update', { status: 'done' })
    expect(approval).toHaveLength(48)

    manager.revokeDevice(id)
    expect(manager.listDevices()).toEqual([])
    await expect(manager.complete(
      started.invitation.pairingId,
      started.code,
      companion.publicKey,
    )).resolves.toBeNull()
  })

  test('expires pending pairings and revokes their unpaired session', async () => {
    const gateway = new CompanionGateway({ forward: vi.fn(), dispatch: vi.fn() })
    const manager = new CompanionPairingManager(gateway)
    const started = await manager.begin({
      workspaceId: 'workspace-2',
      relay: {
        relayUrl: 'http://127.0.0.1:40123',
        channelId: 'channel-2',
        relayToken: 'relay-secret',
        expiresAt: 2_000,
      },
    }, 1_000)
    expect(manager.listDevices(2_000)).toEqual([])
    const companion = await createCompanionIdentity()
    await expect(manager.complete(started.invitation.pairingId, started.code, companion.publicKey, 'late', 2_000))
      .resolves.toBeNull()
  })
})
