// =============================================================================
// Agent-session history — a small machine-local index fed by authenticated
// hook events. It deliberately stores references and metadata only; provider
// transcripts remain in their native stores and are read on demand.
// =============================================================================

import { ipcMain } from 'electron'
import os from 'os'
import { hostJoin } from '../../cateAgent/main/codingDir'
import {
  agentSessionKey,
  agentSessionSummaryFromHook,
  normalizeAgentSessionHistory,
  parseAgentTranscript,
  searchAgentTranscript,
  searchAgentSessionSummaries,
  type AgentSessionHistoryFile,
  type AgentSessionRef,
  type AgentSessionSummary,
  upsertAgentSessionHistory,
} from '../../shared/agentSessions'
import { AGENT_SESSION_HISTORY_LIST, AGENT_SESSION_HISTORY_LOAD } from '../../shared/ipc-channels'
import { parseLocator } from '../../shared/runtimeLocator'
import type { AgentHookEvent } from '../../shared/agentHooks'
import type { Runtime } from '../runtime/types'
import { runtimes } from '../runtime/runtimeManager'

const HISTORY_FILE = 'agent-sessions.json'
const writes = new Map<string, Promise<void>>()

const NATIVE_PROVIDER_DIRS: Partial<Record<AgentSessionSummary['agentId'], string[]>> = {
  'claude-code': ['.claude/projects'],
  codex: ['.codex/sessions'],
  cursor: ['.cursor'],
  grok: ['.grok'],
  pi: ['.cate/cate-agent'],
  opencode: ['.opencode', '.local/share/opencode'],
  gemini: ['.gemini/tmp'],
  copilot: ['.copilot'],
  aider: ['.aider'],
}

function pathKey(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '').toLocaleLowerCase()
}

function pathInside(root: string, target: string): boolean {
  const rootKey = pathKey(root)
  const targetKey = pathKey(target)
  return !!rootKey && (targetKey === rootKey || targetKey.startsWith(`${rootKey}/`))
}

/** Hooks are authenticated but their payload remains untrusted. Keep only
 * transcript references inside the workspace or the CLI's documented native
 * store; a random hook payload must never turn replay into arbitrary file read. */
function safeTranscriptPath(
  agentId: AgentSessionSummary['agentId'],
  transcriptPath: string,
  workspaceRoot: string,
  cwd: string,
): boolean {
  if (!transcriptPath || !/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(transcriptPath)) return false
  if (pathInside(workspaceRoot, transcriptPath) || pathInside(cwd, transcriptPath)) return true
  if (process.platform !== 'win32' && !transcriptPath.startsWith('/')) return false
  return (NATIVE_PROVIDER_DIRS[agentId] ?? []).some((relative) =>
    pathInside(`${os.homedir()}/${relative}`, transcriptPath),
  )
}

function hostRootFor(runtimeId: string, workspaceRoot: string | undefined, cwd: string): string {
  if (workspaceRoot) {
    const parsed = parseLocator(workspaceRoot)
    if (parsed.runtimeId === runtimeId && parsed.path) return parsed.path
  }
  const parsedCwd = parseLocator(cwd)
  return parsedCwd.runtimeId === runtimeId ? parsedCwd.path : ''
}

function historyPath(runtimeId: string, root: string): string {
  return hostJoin(runtimeId, root, '.cate', HISTORY_FILE)
}

async function readHistory(runtime: Runtime, file: string): Promise<AgentSessionHistoryFile> {
  try {
    return normalizeAgentSessionHistory(JSON.parse(await runtime.file.readFile(file)))
  } catch {
    return { version: 1, sessions: [] }
  }
}

function enqueueWrite(key: string, write: () => Promise<void>): Promise<void> {
  const previous = writes.get(key) ?? Promise.resolve()
  const next = previous
    .catch(() => {})
    .then(write)
    .finally(() => {
      if (writes.get(key) === next) writes.delete(key)
    })
  writes.set(key, next)
  return next
}

/** Record a hook observation without changing terminal-resume behavior. */
export function recordAgentSessionEvent(
  runtime: Runtime,
  workspaceRoot: string | undefined,
  event: AgentHookEvent,
  observedAt = Date.now(),
): Promise<void> {
  const summary = agentSessionSummaryFromHook(runtime.id, event, observedAt)
  const root = hostRootFor(runtime.id, workspaceRoot, event.cwd ?? '')
  if (!summary || !root) return Promise.resolve()
  const safeSummary = summary.transcriptPath && !safeTranscriptPath(
    summary.agentId,
    summary.transcriptPath,
    root,
    summary.cwd,
  )
    ? { ...summary, transcriptPath: undefined, source: 'unknown' as const }
    : summary
  const file = historyPath(runtime.id, root)
  const key = `${runtime.id}\0${root}`
  return enqueueWrite(key, async () => {
    const next = upsertAgentSessionHistory(await readHistory(runtime, file), safeSummary)
    await runtime.file.writeFile(file, `${JSON.stringify(next, null, 2)}\n`)
  })
}

export async function listAgentSessionHistory(
  workspaceRoot: string,
  query = '',
): Promise<AgentSessionSummary[]> {
  if (!workspaceRoot) return []
  const { runtimeId, path: root } = parseLocator(workspaceRoot)
  if (!root) return []
  let runtime: Runtime
  try { runtime = runtimes.resolve(runtimeId) } catch { return [] }
  const history = await readHistory(runtime, historyPath(runtimeId, root))
  const metadataMatches = searchAgentSessionSummaries(history.sessions, query)
  if (!query.trim()) return metadataMatches
  const matched = new Map(metadataMatches.map((session) => [agentSessionKey(session), session]))
  const candidates = history.sessions.filter((session) =>
    session.transcriptPath && safeTranscriptPath(session.agentId, session.transcriptPath, root, session.cwd),
  ).slice(0, 100)
  const contentMatches = await Promise.all(candidates.map(async (session) => {
    try {
      const raw = await runtime.file.readFile(session.transcriptPath!)
      return searchAgentTranscript(parseAgentTranscript(raw, session.agentId), query).length > 0 ? session : null
    } catch {
      return null
    }
  }))
  for (const session of contentMatches) {
    if (session) matched.set(agentSessionKey(session), session)
  }
  return [...matched.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50)
}

function refFromUnknown(value: unknown): AgentSessionRef | null {
  if (!value || typeof value !== 'object') return null
  const ref = value as Record<string, unknown>
  if (
    typeof ref.runtimeId !== 'string' || typeof ref.agentId !== 'string' ||
    typeof ref.sessionId !== 'string' || typeof ref.cwd !== 'string' ||
    typeof ref.resumable !== 'boolean'
  ) return null
  return {
    runtimeId: ref.runtimeId,
    agentId: ref.agentId as AgentSessionRef['agentId'],
    sessionId: ref.sessionId,
    cwd: ref.cwd,
    ...(typeof ref.transcriptPath === 'string' ? { transcriptPath: ref.transcriptPath } : {}),
    resumable: ref.resumable,
  }
}

/** Load only a transcript path that is already present in the workspace's
 * index. The renderer cannot turn an arbitrary path into a file read. */
export async function loadAgentSessionHistory(
  workspaceRoot: string,
  rawRef: unknown,
): Promise<ReturnType<typeof parseAgentTranscript>> {
  const ref = refFromUnknown(rawRef)
  if (!workspaceRoot || !ref) return []
  const parsed = parseLocator(workspaceRoot)
  if (!parsed.path || parsed.runtimeId !== ref.runtimeId || !ref.transcriptPath) return []
  let runtime: Runtime
  try { runtime = runtimes.resolve(ref.runtimeId) } catch { return [] }
  const history = await readHistory(runtime, historyPath(ref.runtimeId, parsed.path))
  const known = history.sessions.find((session) => agentSessionKey(session) === agentSessionKey(ref))
  if (
    !known?.transcriptPath || known.transcriptPath !== ref.transcriptPath ||
    !safeTranscriptPath(known.agentId, known.transcriptPath, parsed.path, known.cwd)
  ) return []
  try {
    const raw = await runtime.file.readFile(known.transcriptPath)
    return parseAgentTranscript(raw, known.agentId)
  } catch {
    // The provider may have rotated or removed a transcript after the hook
    // event. History remains useful even when replay is temporarily unavailable.
    return []
  }
}

export function registerAgentSessionHistoryHandlers(): void {
  ipcMain.handle(AGENT_SESSION_HISTORY_LIST, async (_event, workspaceRoot: string, query?: string) =>
    listAgentSessionHistory(workspaceRoot, typeof query === 'string' ? query : ''))
  ipcMain.handle(AGENT_SESSION_HISTORY_LOAD, async (_event, workspaceRoot: string, ref: unknown) =>
    loadAgentSessionHistory(workspaceRoot, ref))
}
