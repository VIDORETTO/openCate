import { afterEach, describe, expect, test } from 'vitest'
import { CompanionClient } from '../../sdk/companionClient'
import { createCompanionIdentity } from '../../shared/companionCrypto'
import { CompanionGateway } from './companionGateway'
import { MainCompanionController } from './desktopController'
import { CompanionPairingManager } from './pairing'
import { CompanionRelayServer } from './relayServer'

let controller: MainCompanionController | undefined

afterEach(async () => {
  await controller?.close()
  controller = undefined
})

describe('desktop companion controller', () => {
  test('starts loopback pairing, completes proof, and serves an encrypted read', async () => {
    const gateway = new CompanionGateway({
      forward: async () => {},
      dispatch: async () => ({ product: 'openCate' }),
    })
    const relay = new CompanionRelayServer()
    controller = new MainCompanionController({
      relay,
      boundary: { gateway, pairing: new CompanionPairingManager(gateway) },
    })

    const started = await controller.beginPairing('workspace-1')
    expect(started.pairingUri).toContain('cate-companion://pair?invite=')
    const identity = await createCompanionIdentity()
    const proof = CompanionClient.createPairingProof(started.invitation, identity, started.code, { label: 'Browser' })
    const device = await controller.completePairing(proof)
    expect(device?.label).toBe('Browser')

    const client = await CompanionClient.fromInvitation(started.invitation, identity, {
      pollIntervalMs: 10,
      timeoutMs: 2_000,
    })
    await expect(client.read('cate.version')).resolves.toEqual({ product: 'openCate' })
  })
})
