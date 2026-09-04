// =============================================================================
// Agent audit — bounded local provenance for messages sent to agents.
//
// Audit events answer who sent what kind of input to which agent without
// persisting the input itself. The full prompt/context remains in the agent's
// own transcript or at the selected source; this file stores only correlation
// metadata and bounded outcome facts.
// =============================================================================

export type AgentAuditKind = 'context' | 'prompt' | 'command'
export type AgentAuditActorKind = 'human' | 'agent' | 'extension' | 'system'
export type AgentAuditOutcome = 'sent' | 'failed'
export type AgentAuditOrigin =
  | 'direct-chat'
  | 'global-composer'
  | 'mission-sidebar'
  | 'mission-launch'
  | 'orchestrator'
  | 'terminal-api'
  | 'system'

export interface AgentAuditActor {
  kind: AgentAuditActorKind
  id?: string
  label?: string
  sourcePanelId?: string
  origin: AgentAuditOrigin
}

export interface AgentAuditEvent {
  id: string
  timestamp: number
  kind: AgentAuditKind
  outcome: AgentAuditOutcome
  actorKind: AgentAuditActorKind
  actorId?: string
  actorLabel?: string
  origin: AgentAuditOrigin
  sourcePanelId?: string
  targetPanelId: string
  targetRunId?: string
  correlationId?: string
  contextItemIds?: string[]
  /** Number of input characters, never the input content. */
  contentChars: number
  /** Provider-neutral command name or key, never a raw shell command. */
  commandName?: string
  hasImages?: boolean
  error?: string
}

export interface AgentAuditFile {
  version: 1
  events: AgentAuditEvent[]
}

export type AgentAuditEventDraft = Omit<AgentAuditEvent, 'id' | 'timestamp'> & {
  timestamp?: number
}

export const AGENT_AUDIT_FILE_VERSION = 1 as const
export const MAX_AGENT_AUDIT_EVENTS = 500
export const MAX_AGENT_AUDIT_ID_CHARS = 160
export const MAX_AGENT_AUDIT_LABEL_CHARS = 160
export const MAX_AGENT_AUDIT_CORRELATION_ID_CHARS = 160
export const MAX_AGENT_AUDIT_CONTEXT_IDS = 32
export const MAX_AGENT_AUDIT_CONTENT_CHARS = 50_000
export const MAX_AGENT_AUDIT_COMMAND_CHARS = 120
export const MAX_AGENT_AUDIT_ERROR_CHARS = 1_000

const AUDIT_KINDS = new Set<AgentAuditKind>(['context', 'prompt', 'command'])
const ACTOR_KINDS = new Set<AgentAuditActorKind>(['human', 'agent', 'extension', 'system'])
const OUTCOMES = new Set<AgentAuditOutcome>(['sent', 'failed'])
const ORIGINS = new Set<AgentAuditOrigin>([
  'direct-chat',
  'global-composer',
  'mission-sidebar',
  'mission-launch',
  'orchestrator',
  'terminal-api',
  'system',
])

type RecordValue = Record<string, unknown>

function recordValue(value: unknown): RecordValue | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : null
}

function boundedText(value: unknown, maxChars: number): string | null {
  if (typeof value !== 'string' || value.includes('\0')) return null
  const text = value.trim().slice(0, maxChars)
  return text || null
}

function boundedTime(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.trunc(value)))
    : fallback
}

function boundedUniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const result: string[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    const id = boundedText(entry, MAX_AGENT_AUDIT_ID_CHARS)
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push(id)
    if (result.length >= MAX_AGENT_AUDIT_CONTEXT_IDS) break
  }
  return result
}

export function normalizeAgentAuditEvent(raw: unknown): AgentAuditEvent | null {
  const value = recordValue(raw)
  if (!value) return null
  const id = boundedText(value.id, MAX_AGENT_AUDIT_ID_CHARS)
  const timestamp = boundedTime(value.timestamp)
  const kind = typeof value.kind === 'string' && AUDIT_KINDS.has(value.kind as AgentAuditKind)
    ? value.kind as AgentAuditKind
    : null
  const outcome = typeof value.outcome === 'string' && OUTCOMES.has(value.outcome as AgentAuditOutcome)
    ? value.outcome as AgentAuditOutcome
    : null
  const actorKind = typeof value.actorKind === 'string' && ACTOR_KINDS.has(value.actorKind as AgentAuditActorKind)
    ? value.actorKind as AgentAuditActorKind
    : null
  const origin = typeof value.origin === 'string' && ORIGINS.has(value.origin as AgentAuditOrigin)
    ? value.origin as AgentAuditOrigin
    : null
  const targetPanelId = boundedText(value.targetPanelId, MAX_AGENT_AUDIT_ID_CHARS)
  const actorId = boundedText(value.actorId, MAX_AGENT_AUDIT_ID_CHARS)
  const actorLabel = boundedText(value.actorLabel, MAX_AGENT_AUDIT_LABEL_CHARS)
  const sourcePanelId = boundedText(value.sourcePanelId, MAX_AGENT_AUDIT_ID_CHARS)
  const targetRunId = boundedText(value.targetRunId, MAX_AGENT_AUDIT_ID_CHARS)
  const correlationId = boundedText(value.correlationId, MAX_AGENT_AUDIT_CORRELATION_ID_CHARS)
  const commandName = boundedText(value.commandName, MAX_AGENT_AUDIT_COMMAND_CHARS)
  const error = boundedText(value.error, MAX_AGENT_AUDIT_ERROR_CHARS)
  const contentChars = boundedInteger(value.contentChars, 0, 0, MAX_AGENT_AUDIT_CONTENT_CHARS)
  const contextItemIds = boundedUniqueStrings(value.contextItemIds)
  if (!id || timestamp === null || !kind || !outcome || !actorKind || !origin || !targetPanelId) return null
  return {
    id,
    timestamp,
    kind,
    outcome,
    actorKind,
    ...(actorId ? { actorId } : {}),
    ...(actorLabel ? { actorLabel } : {}),
    origin,
    ...(sourcePanelId ? { sourcePanelId } : {}),
    targetPanelId,
    ...(targetRunId ? { targetRunId } : {}),
    ...(correlationId ? { correlationId } : {}),
    ...(contextItemIds.length > 0 ? { contextItemIds } : {}),
    contentChars,
    ...(commandName ? { commandName } : {}),
    ...(value.hasImages === true ? { hasImages: true } : {}),
    ...(error ? { error } : {}),
  }
}

export function normalizeAgentAuditFile(raw: unknown): AgentAuditFile {
  const value = recordValue(raw)
  const events = value?.version === AGENT_AUDIT_FILE_VERSION && Array.isArray(value.events)
    ? value.events
      .map(normalizeAgentAuditEvent)
      .filter((event): event is AgentAuditEvent => event !== null)
      .sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id))
      .slice(-MAX_AGENT_AUDIT_EVENTS)
    : []
  return { version: AGENT_AUDIT_FILE_VERSION, events }
}
