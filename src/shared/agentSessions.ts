// =============================================================================
// Cross-CLI agent-session history — provider-neutral references and transcript
// projection. The source files remain owned by each CLI; Cate only stores a
// small machine-local index and reads a transcript when the user asks to view
// it. A transcript is never reconstructed from terminal scrollback.
// =============================================================================

import type { AgentHookEvent, AgentHookEventKind } from './agentHooks'
import { AGENTS, resumeCommandForAgent, type AgentId } from './agents'

export type AgentSessionSource = 'native-transcript' | 'unknown'

export interface AgentSessionRef {
  runtimeId: string
  agentId: AgentId
  sessionId: string
  cwd: string
  transcriptPath?: string
  resumable: boolean
}

export interface AgentSessionSummary extends AgentSessionRef {
  title?: string
  model?: string
  createdAt: number
  updatedAt: number
  messageCount?: number
  lastEvent: AgentHookEventKind
  endedAt?: number
  source: AgentSessionSource
}

export interface AgentSessionHistoryFile {
  version: 1
  sessions: AgentSessionSummary[]
}

export type AgentTranscriptRole = 'user' | 'assistant' | 'tool' | 'system'

export interface AgentTranscriptMessage {
  id: string
  role: AgentTranscriptRole
  text: string
  createdAt?: number
  toolName?: string
}

const MAX_SESSION_ID = 512
const MAX_PATH = 8_000
const MAX_TEXT = 200_000
const MAX_SESSIONS = 500

const AGENT_IDS = new Set(AGENTS.map((agent) => agent.id))

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function boundedString(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined
}

function boundedTime(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function firstString(records: readonly (Record<string, unknown> | undefined)[], keys: readonly string[]): string | undefined {
  for (const record of records) {
    if (!record) continue
    for (const key of keys) {
      const value = boundedString(record[key], MAX_TEXT)
      if (value) return value
    }
  }
  return undefined
}

function nestedRecords(root: Record<string, unknown>): Array<Record<string, unknown> | undefined> {
  const message = recordValue(root.message)
  const payload = recordValue(root.payload)
  const data = recordValue(root.data)
  const usage = recordValue(root.usage)
  return [root, message, payload, data, usage]
}

export function agentSessionKey(ref: Pick<AgentSessionRef, 'runtimeId' | 'agentId' | 'sessionId'>): string {
  return `${ref.runtimeId}\0${ref.agentId}\0${ref.sessionId}`
}

/** Convert one authenticated hook observation into an index record. */
export function agentSessionSummaryFromHook(
  runtimeId: string,
  event: AgentHookEvent,
  observedAt = Date.now(),
): AgentSessionSummary | null {
  const sessionId = boundedString(event.sessionId, MAX_SESSION_ID)
  if (!runtimeId || !sessionId || !AGENT_IDS.has(event.agentId)) return null
  const transcriptPath = boundedString(event.transcriptPath, MAX_PATH)
  const records = nestedRecords(event.raw)
  const title = firstString(records, ['sessionName', 'session_name', 'title', 'name'])
  const model = firstString(records, ['model', 'modelId', 'model_id'])
  return {
    runtimeId: runtimeId.slice(0, 200),
    agentId: event.agentId,
    sessionId,
    cwd: boundedString(event.cwd, MAX_PATH) ?? '',
    ...(transcriptPath ? { transcriptPath } : {}),
    resumable: resumeCommandForAgent(event.agentId, sessionId) !== null,
    ...(title ? { title } : {}),
    ...(model ? { model } : {}),
    createdAt: observedAt,
    updatedAt: observedAt,
    lastEvent: event.kind,
    ...(event.kind === 'session-end' ? { endedAt: observedAt } : {}),
    source: transcriptPath ? 'native-transcript' : 'unknown',
  }
}

function normalizeSummary(raw: unknown): AgentSessionSummary | null {
  const value = recordValue(raw)
  if (!value) return null
  const runtimeId = boundedString(value.runtimeId, 200)
  const agentId = boundedString(value.agentId, 80)
  const sessionId = boundedString(value.sessionId, MAX_SESSION_ID)
  const createdAt = boundedTime(value.createdAt)
  const updatedAt = boundedTime(value.updatedAt)
  const lastEvent = value.lastEvent
  if (
    !runtimeId || !agentId || !AGENT_IDS.has(agentId as AgentId) || !sessionId ||
    createdAt === undefined || updatedAt === undefined ||
    !['session-start', 'session-end', 'turn-start', 'turn-end', 'permission-wait', 'turn-resume'].includes(String(lastEvent))
  ) return null
  const source = value.source === 'native-transcript' ? value.source : 'unknown'
  const cwd = boundedString(value.cwd, MAX_PATH) ?? ''
  const transcriptPath = boundedString(value.transcriptPath, MAX_PATH)
  const messageCount = typeof value.messageCount === 'number' && Number.isInteger(value.messageCount) && value.messageCount >= 0
    ? value.messageCount
    : undefined
  const endedAt = boundedTime(value.endedAt)
  return {
    runtimeId,
    agentId: agentId as AgentId,
    sessionId,
    cwd,
    ...(transcriptPath ? { transcriptPath } : {}),
    resumable: value.resumable === true,
    ...(boundedString(value.title, MAX_TEXT) ? { title: boundedString(value.title, MAX_TEXT) } : {}),
    ...(boundedString(value.model, 200) ? { model: boundedString(value.model, 200) } : {}),
    createdAt,
    updatedAt,
    ...(messageCount !== undefined ? { messageCount } : {}),
    lastEvent: lastEvent as AgentHookEventKind,
    ...(endedAt !== undefined ? { endedAt } : {}),
    source,
  }
}

export function normalizeAgentSessionHistory(raw: unknown): AgentSessionHistoryFile {
  const value = recordValue(raw)
  const sessions = Array.isArray(value?.sessions)
    ? value.sessions.map(normalizeSummary).filter((session): session is AgentSessionSummary => session !== null)
    : []
  return { version: 1, sessions: sessions.slice(0, MAX_SESSIONS) }
}

/** Merge a later hook observation without erasing a transcript path learned on
 * an earlier event or turning a partial lifecycle into a duplicate session. */
export function mergeAgentSessionSummary(
  previous: AgentSessionSummary | undefined,
  next: AgentSessionSummary,
): AgentSessionSummary {
  if (!previous) return next
  return {
    ...previous,
    ...next,
    cwd: next.cwd || previous.cwd,
    ...(next.transcriptPath || previous.transcriptPath
      ? { transcriptPath: next.transcriptPath ?? previous.transcriptPath }
      : {}),
    ...(next.title || previous.title ? { title: next.title ?? previous.title } : {}),
    ...(next.model || previous.model ? { model: next.model ?? previous.model } : {}),
    createdAt: Math.min(previous.createdAt, next.createdAt),
    updatedAt: Math.max(previous.updatedAt, next.updatedAt),
    ...(next.endedAt ?? previous.endedAt
      ? { endedAt: Math.max(next.endedAt ?? 0, previous.endedAt ?? 0) }
      : {}),
    source: previous.source === 'native-transcript' || next.source === 'native-transcript'
      ? 'native-transcript'
      : 'unknown',
  }
}

export function upsertAgentSessionHistory(
  history: AgentSessionHistoryFile,
  next: AgentSessionSummary,
): AgentSessionHistoryFile {
  const normalized = normalizeAgentSessionHistory(history)
  const key = agentSessionKey(next)
  const sessions = normalized.sessions.slice()
  const index = sessions.findIndex((session) => agentSessionKey(session) === key)
  if (index === -1) sessions.push(next)
  else sessions[index] = mergeAgentSessionSummary(sessions[index], next)
  sessions.sort((a, b) => b.updatedAt - a.updatedAt)
  return { version: 1, sessions: sessions.slice(0, MAX_SESSIONS) }
}

export function searchAgentSessionSummaries(
  sessions: readonly AgentSessionSummary[],
  query: string,
  limit = 50,
): AgentSessionSummary[] {
  const q = query.trim().toLocaleLowerCase()
  if (!q) return sessions.slice(0, limit)
  return sessions
    .filter((session) => [
      session.title,
      session.agentId,
      session.sessionId,
      session.cwd,
      session.model,
    ].some((value) => value?.toLocaleLowerCase().includes(q)))
    .slice(0, limit)
}

function jsonRecords(raw: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
    const record = recordValue(parsed)
    if (record && Array.isArray(record.messages)) return record.messages
    return record ? [record] : []
  } catch {
    return raw.split(/\r?\n/).flatMap((line) => {
      if (!line.trim()) return []
      try { return [JSON.parse(line) as unknown] } catch { return [] }
    })
  }
}

function transcriptRole(value: unknown): AgentTranscriptRole | undefined {
  if (typeof value !== 'string') return undefined
  switch (value.toLowerCase()) {
    case 'user':
    case 'human':
    case 'user_message':
      return 'user'
    case 'assistant':
    case 'model':
    case 'gemini':
    case 'agent_message':
      return 'assistant'
    case 'tool':
    case 'tool_result':
    case 'toolresult':
    case 'tool_use':
    case 'function_call':
    case 'function_call_output':
      return 'tool'
    case 'system':
    case 'compaction':
      return 'system'
    default:
      return undefined
  }
}

function textValue(value: unknown, depth = 0): string {
  if (depth > 4) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((item) => textValue(item, depth + 1)).filter(Boolean).join('')
  const record = recordValue(value)
  if (!record) return ''
  for (const key of ['text', 'output_text', 'thinking', 'content', 'parts', 'delta', 'message', 'output']) {
    const text = textValue(record[key], depth + 1)
    if (text) return text
  }
  return ''
}

function toolNameValue(records: readonly (Record<string, unknown> | undefined)[]): string | undefined {
  return firstString(records, ['toolName', 'tool_name', 'name'])
}

function transcriptTimestamp(records: readonly (Record<string, unknown> | undefined)[]): number | undefined {
  for (const record of records) {
    if (!record) continue
    for (const key of ['timestamp', 'createdAt', 'created_at', 'time']) {
      const value = boundedTime(record[key])
      if (value !== undefined) return value
    }
  }
  return undefined
}

/** Parse common JSON/JSONL transcript envelopes without parsing terminal text.
 * Provider-specific fields remain optional; unknown entries are skipped. */
export function parseAgentTranscript(raw: string, agentId: AgentId): AgentTranscriptMessage[] {
  const out: AgentTranscriptMessage[] = []
  for (const [index, value] of jsonRecords(raw).entries()) {
    const root = recordValue(value)
    if (!root) continue
    const nested = [
      recordValue(root.message),
      recordValue(root.payload),
      recordValue(root.data),
      root,
    ]
    let role: AgentTranscriptRole | undefined
    let source: Record<string, unknown> | undefined
    for (const candidate of nested) {
      if (!candidate) continue
      role = transcriptRole(candidate.role) ?? transcriptRole(candidate.type)
      if (role) {
        source = candidate
        break
      }
    }
    if (!role) continue
    const records = [source, ...nested.filter((candidate) => candidate !== source)]
    const text = textValue(source?.content ?? source?.text ?? source?.output ?? source?.message ?? root.message)
      .trim()
      .slice(0, MAX_TEXT)
    const toolName = role === 'tool' ? toolNameValue(records) : undefined
    if (!text && !toolName) continue
    const sourceId = firstString(records, ['id', 'messageId', 'message_id', 'uuid'])
    const id = sourceId ?? `${agentId}-${index}`
    out.push({
      id,
      role,
      text: text || (toolName ? `[${toolName}]` : ''),
      ...(transcriptTimestamp(records) !== undefined ? { createdAt: transcriptTimestamp(records) } : {}),
      ...(toolName ? { toolName } : {}),
    })
  }
  return out
}

export function searchAgentTranscript(
  messages: readonly AgentTranscriptMessage[],
  query: string,
): AgentTranscriptMessage[] {
  const q = query.trim().toLocaleLowerCase()
  if (!q) return [...messages]
  return messages.filter((message) => message.text.toLocaleLowerCase().includes(q))
}
