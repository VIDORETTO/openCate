import { create } from 'zustand'
import {
  normalizeAgentAuditFile,
  normalizeAgentAuditEvent,
  type AgentAuditEvent,
  type AgentAuditEventDraft,
} from '../../shared/agentAudit'
import { generateId } from './canvas/helpers'

interface AgentAuditStoreState {
  eventsByRoot: Record<string, AgentAuditEvent[]>
  loadedRoots: Record<string, boolean>
  /** Prevent a slow initial load from replacing a locally recorded event. */
  revisions: Record<string, number>
}

interface AgentAuditStoreActions {
  loadEvents: (rootPath: string, force?: boolean) => Promise<void>
  getEvents: (rootPath: string) => AgentAuditEvent[]
  recordEvent: (rootPath: string, draft: AgentAuditEventDraft) => Promise<AgentAuditEvent | null>
}

export type AgentAuditStore = AgentAuditStoreState & AgentAuditStoreActions

function persist(rootPath: string, events: AgentAuditEvent[]): void {
  if (typeof window === 'undefined' || typeof window.electronAPI?.projectAgentAuditSave !== 'function') return
  void window.electronAPI.projectAgentAuditSave(rootPath, events).catch(() => {
    // The main process logs durable-write failures. Keep the local projection
    // usable; the next event will retry the complete bounded list.
  })
}

function sortEvents(events: readonly AgentAuditEvent[]): AgentAuditEvent[] {
  return normalizeAgentAuditFile({ version: 1, events: [...events] }).events
}

const pendingLoads = new Map<string, Promise<void>>()

export const useAgentAuditStore = create<AgentAuditStore>((set, get) => ({
  eventsByRoot: {},
  loadedRoots: {},
  revisions: {},

  async loadEvents(rootPath, force = false) {
    if (!rootPath || typeof window === 'undefined' || typeof window.electronAPI?.projectAgentAuditLoad !== 'function') return
    if (!force && get().loadedRoots[rootPath]) return
    const pending = pendingLoads.get(rootPath)
    if (pending) return pending
    const revisionAtStart = get().revisions[rootPath] ?? 0
    const load = window.electronAPI.projectAgentAuditLoad(rootPath).then((events) => {
      if ((get().revisions[rootPath] ?? 0) !== revisionAtStart) return
      set((state) => ({
        eventsByRoot: { ...state.eventsByRoot, [rootPath]: sortEvents(events) },
        loadedRoots: { ...state.loadedRoots, [rootPath]: true },
      }))
    }).catch(() => {
      if ((get().revisions[rootPath] ?? 0) === revisionAtStart) {
        set((state) => ({
          loadedRoots: { ...state.loadedRoots, [rootPath]: true },
        }))
      }
    })
    pendingLoads.set(rootPath, load)
    try {
      await load
    } finally {
      if (pendingLoads.get(rootPath) === load) pendingLoads.delete(rootPath)
    }
  },

  getEvents(rootPath) {
    return get().eventsByRoot[rootPath] ?? []
  },

  async recordEvent(rootPath, draft) {
    if (!rootPath) return null
    if (!get().loadedRoots[rootPath]) await get().loadEvents(rootPath)
    const event = normalizeAgentAuditEvent({
      ...draft,
      id: generateId(),
      timestamp: draft.timestamp ?? Date.now(),
    })
    if (!event) return null
    const next = sortEvents([...(get().eventsByRoot[rootPath] ?? []), event])
    set((state) => ({
      eventsByRoot: { ...state.eventsByRoot, [rootPath]: next },
      loadedRoots: { ...state.loadedRoots, [rootPath]: true },
      revisions: { ...state.revisions, [rootPath]: (state.revisions[rootPath] ?? 0) + 1 },
    }))
    persist(rootPath, next)
    return event
  },
}))
