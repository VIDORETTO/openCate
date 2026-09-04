import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentAuditEvent } from '../../shared/agentAudit'
import { useAgentAuditStore } from './agentAuditStore'

const ROOT = '/repo'
const load = vi.fn(async () => [] as AgentAuditEvent[])
const save = vi.fn(async () => undefined)

const existing: AgentAuditEvent = {
  id: 'existing',
  timestamp: 1,
  kind: 'context',
  outcome: 'sent',
  actorKind: 'human',
  actorId: 'local-user',
  origin: 'global-composer',
  targetPanelId: 'agent-panel',
  contextItemIds: ['context-1'],
  contentChars: 10,
}

beforeEach(() => {
  vi.clearAllMocks()
  load.mockResolvedValue([existing])
  ;(globalThis as unknown as { window: unknown }).window = {
    electronAPI: {
      projectAgentAuditLoad: load,
      projectAgentAuditSave: save,
    },
  }
  useAgentAuditStore.setState({ eventsByRoot: {}, loadedRoots: {}, revisions: {} })
})

describe('agent audit renderer store', () => {
  it('loads existing events and records a bounded metadata-only delivery', async () => {
    const recorded = await useAgentAuditStore.getState().recordEvent(ROOT, {
      kind: 'prompt',
      outcome: 'sent',
      actorKind: 'human',
      actorId: 'local-user',
      origin: 'direct-chat',
      targetPanelId: 'agent-panel',
      contentChars: 24,
      hasImages: true,
    })

    expect(load).toHaveBeenCalledTimes(1)
    expect(recorded).toMatchObject({ kind: 'prompt', targetPanelId: 'agent-panel', contentChars: 24 })
    expect(recorded).not.toHaveProperty('content')
    expect(useAgentAuditStore.getState().getEvents(ROOT)).toHaveLength(2)
    expect(save).toHaveBeenCalledWith(ROOT, expect.arrayContaining([
      expect.objectContaining({ id: 'existing' }),
      expect.objectContaining({ id: recorded?.id }),
    ]))
  })

  it('does not make a failed audit load block recording', async () => {
    load.mockRejectedValueOnce(new Error('temporarily unavailable'))
    const recorded = await useAgentAuditStore.getState().recordEvent(ROOT, {
      kind: 'command',
      outcome: 'failed',
      actorKind: 'agent',
      origin: 'terminal-api',
      sourcePanelId: 'orchestrator-panel',
      targetPanelId: 'agent-panel',
      commandName: 'press',
      contentChars: 1,
      error: 'terminal-not-ready',
    })

    expect(recorded).toMatchObject({ outcome: 'failed', commandName: 'press' })
    expect(useAgentAuditStore.getState().getEvents(ROOT)).toHaveLength(1)
  })
})
