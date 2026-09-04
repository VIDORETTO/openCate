import type { AgentAuditEventDraft } from '../../../shared/agentAudit'
import { generateId } from '../../stores/canvas/helpers'
import { useAgentAuditStore } from '../../stores/agentAuditStore'

/** Fire-and-forget audit recording for send paths. Audit persistence must never
 * turn a successful user action into a failed action when the project is
 * temporarily unavailable or read-only. */
export function recordAgentAudit(rootPath: string, draft: AgentAuditEventDraft): void {
  if (!rootPath) return
  void useAgentAuditStore.getState().recordEvent(rootPath, draft).catch(() => {
    // The durable store is best-effort from the action's point of view; the
    // original send result remains authoritative for the user.
  })
}

export function createAgentAuditCorrelationId(): string {
  return generateId()
}
