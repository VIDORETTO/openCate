import { describe, expect, test, vi } from 'vitest'
import { CompanionGateway } from './companionGateway'

const NOW = 10_000

function readRequest(sessionId: string, nonce: string) {
  return {
    version: 1,
    requestId: `request-${nonce}`,
    sessionId,
    nonce,
    issuedAt: NOW,
    expiresAt: NOW + 10_000,
    capability: 'read' as const,
    method: 'cate.workspace.get' as const,
  }
}

describe('companion gateway', () => {
  test('defaults to read-only and rejects action requests before dispatch', async () => {
    const dispatch = vi.fn(async () => ({ ok: true }))
    const gateway = new CompanionGateway({ forward: vi.fn(), dispatch })
    const ticket = gateway.issueSession('ws-1', false, NOW)

    const read = await gateway.handle(readRequest(ticket.sessionId, 'read-1'), ticket.token, NOW + 1)
    expect(read).toMatchObject({ ok: true, result: { ok: true } })
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ caller: 'companion', workspaceId: 'ws-1' }),
      'cate.workspace.get',
      undefined,
    )

    const action = await gateway.handle({
      ...readRequest(ticket.sessionId, 'action-1'),
      capability: 'read',
      method: 'cate.codingAgent.send',
      approvalId: 'not-issued',
    }, ticket.token, NOW + 1)
    expect(action).toMatchObject({ ok: false, error: 'read-only' })
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  test('requires a host-minted, argument-bound, one-shot approval', async () => {
    const dispatch = vi.fn(async () => ({ accepted: true }))
    const gateway = new CompanionGateway({ forward: vi.fn(), dispatch })
    const ticket = gateway.issueSession('ws-1', true, NOW)
    const args = { message: 'Please review the diff' }
    const approvalId = gateway.grantApproval(ticket.sessionId, 'cate.codingAgent.send', args, NOW + 1)
    const request = {
      version: 1,
      requestId: 'action-1',
      sessionId: ticket.sessionId,
      nonce: 'nonce-approve',
      issuedAt: NOW,
      expiresAt: NOW + 10_000,
      capability: 'approve' as const,
      method: 'cate.codingAgent.send' as const,
      args,
      approvalId,
    }

    await expect(gateway.handle(request, ticket.token, NOW + 2)).resolves.toMatchObject({ ok: true })
    expect(dispatch).toHaveBeenCalledTimes(1)
    await expect(gateway.handle({ ...request, requestId: 'action-replay', nonce: 'nonce-replay' }, ticket.token, NOW + 3))
      .resolves.toMatchObject({ ok: false, error: 'approval-required' })
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  test('does not reveal session existence through an invalid token', async () => {
    const gateway = new CompanionGateway({ forward: vi.fn(), dispatch: vi.fn() })
    const ticket = gateway.issueSession('ws-1', false, NOW)

    await expect(gateway.handle(readRequest(ticket.sessionId, 'bad-token'), 'wrong', NOW + 1))
      .resolves.toMatchObject({ ok: false, error: 'unauthorized' })
  })
})
