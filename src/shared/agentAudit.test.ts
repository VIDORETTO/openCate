import { describe, expect, it } from 'vitest'
import {
  MAX_AGENT_AUDIT_CONTEXT_IDS,
  MAX_AGENT_AUDIT_EVENTS,
  normalizeAgentAuditEvent,
  normalizeAgentAuditFile,
} from './agentAudit'

const event = {
  id: 'audit-1',
  timestamp: 1,
  kind: 'prompt',
  outcome: 'sent',
  actorKind: 'human',
  actorId: 'local-user',
  actorLabel: 'Global composer',
  origin: 'global-composer',
  sourcePanelId: 'source-panel',
  targetPanelId: 'agent-panel',
  targetRunId: 'run-1',
  correlationId: 'delivery-1',
  contentChars: 42,
  hasImages: true,
}

describe('agent audit contract', () => {
  it('normalizes a complete provenance event without retaining content', () => {
    const normalized = normalizeAgentAuditEvent({ ...event, prompt: 'secret prompt' })
    expect(normalized).toEqual(event)
    expect(normalized).not.toHaveProperty('prompt')
  })

  it('bounds context ids and event history while dropping malformed events', () => {
    const events = Array.from({ length: MAX_AGENT_AUDIT_EVENTS + 2 }, (_, index) => ({
      ...event,
      id: `audit-${index}`,
      timestamp: index,
      contextItemIds: Array.from({ length: MAX_AGENT_AUDIT_CONTEXT_IDS + 2 }, (_, item) => `item-${item}`),
    }))
    const normalized = normalizeAgentAuditFile({
      version: 1,
      events: [...events, { ...event, id: 'bad', targetPanelId: '', timestamp: -1 }],
    })

    expect(normalized.events).toHaveLength(MAX_AGENT_AUDIT_EVENTS)
    expect(normalized.events[0].id).toBe('audit-2')
    expect(normalized.events.at(-1)?.contextItemIds).toHaveLength(MAX_AGENT_AUDIT_CONTEXT_IDS)
    expect(normalized.events.some((entry) => entry.id === 'bad')).toBe(false)
  })

  it('degrades unknown versions and unsupported actor/origin values to empty', () => {
    expect(normalizeAgentAuditFile({ version: 99, events: [event] })).toEqual({ version: 1, events: [] })
    expect(normalizeAgentAuditEvent({ ...event, actorKind: 'unknown' })).toBeNull()
    expect(normalizeAgentAuditEvent({ ...event, origin: 'unknown' })).toBeNull()
  })
})
