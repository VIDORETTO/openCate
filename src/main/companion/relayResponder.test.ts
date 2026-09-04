import { afterEach, describe, expect, test, vi } from 'vitest'
import { createCompanionIdentity, deriveCompanionKey } from '../../shared/companionCrypto'
import type { CompanionPairingInvitation } from '../../shared/companionProtocol'
import { CompanionClient } from '../../sdk/companionClient'
import { CompanionGateway } from './companionGateway'
import { CompanionRelayServer } from './relayServer'
import { CompanionRelayResponder } from './relayResponder'

let relay: CompanionRelayServer | undefined
let responder: CompanionRelayResponder | undefined

afterEach(async () => {
  responder?.stop()
  responder = undefined
  await relay?.close()
  relay = undefined
})

describe('companion relay responder', () => {
  test('round-trips encrypted reads and host-approved actions over the real relay', async () => {
    relay = new CompanionRelayServer()
    const address = await relay.listen()
    const baseUrl = `http://${address.host}:${address.port}`
    const channelResponse = await fetch(`${baseUrl}/v1/channels`, { method: 'POST' })
    const channel = await channelResponse.json() as { channelId: string; token: string; expiresAt: number }
    const gateway = new CompanionGateway({
      forward: vi.fn(),
      dispatch: vi.fn(async (scope, method, args) => ({
        workspaceId: scope.workspaceId,
        method,
        args,
      })),
    })
    const session = gateway.issueSession('workspace-1', true)
    const host = await createCompanionIdentity()
    const companion = await createCompanionIdentity()
    const hostKey = await deriveCompanionKey(host, companion.publicKey, 'pairing-1')
    const invitation: CompanionPairingInvitation = {
      version: 1,
      pairingId: 'pairing-1',
      workspaceId: 'workspace-1',
      relayUrl: baseUrl,
      channelId: channel.channelId,
      relayToken: channel.token,
      sessionId: session.sessionId,
      hostPublicKey: host.publicKey,
      expiresAt: Date.now() + 60_000,
    }
    let failedRead = false
    let postCount = 0
    const fetchWithTransientReadFailure: typeof fetch = vi.fn(async (input, init) => {
      const method = init?.method ?? 'GET'
      if (method === 'GET' && !failedRead) {
        failedRead = true
        throw new TypeError('temporary relay network failure')
      }
      if (method === 'POST') postCount += 1
      return fetch(input, init)
    })
    const client = await CompanionClient.fromInvitation(invitation, companion, {
      fetch: fetchWithTransientReadFailure,
      pollIntervalMs: 25,
      timeoutMs: 5_000,
    })
    responder = new CompanionRelayResponder({
      connection: { relayUrl: baseUrl, channelId: channel.channelId, relayToken: channel.token },
      sessionId: session.sessionId,
      sessionToken: session.token,
      key: hostKey,
      gateway,
      pollIntervalMs: 25,
    })
    responder.start()

    await expect(client.read('cate.workspace.get')).resolves.toMatchObject({
      workspaceId: 'workspace-1',
      method: 'cate.workspace.get',
    })
    const args = { message: 'review this' }
    const approvalId = gateway.grantApproval(session.sessionId, 'cate.codingAgent.send', args)
    await expect(client.approve('cate.codingAgent.send', args, approvalId)).resolves.toMatchObject({
      workspaceId: 'workspace-1',
      method: 'cate.codingAgent.send',
    })
    expect(postCount).toBe(2)
  })
})
