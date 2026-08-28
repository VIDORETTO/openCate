// =============================================================================
// projectMemoryStore — renderer authority for the user-curated notes belonging
// to each open project. Main persists the complete list atomically.
// =============================================================================

import { create } from 'zustand'
import {
  MAX_PROJECT_MEMORY_NOTES,
  normalizeProjectMemoryNote,
  type ProjectMemoryNote,
  type ProjectMemoryNoteDraft,
} from '../../shared/projectMemory'
import { generateId } from './canvas/helpers'

interface ProjectMemoryStoreState {
  notesByRoot: Record<string, ProjectMemoryNote[]>
  loadedRoots: Record<string, boolean>
  /** Mutation generation prevents a slow initial load from undoing a local save. */
  revisions: Record<string, number>
}

interface ProjectMemoryStoreActions {
  /** Load `.cate/memory.json` once; re-calls are cheap no-ops unless forced. */
  loadMemory: (rootPath: string, force?: boolean) => Promise<void>
  /** Read the current list for a root (empty until loaded). */
  getNotes: (rootPath: string) => ProjectMemoryNote[]
  /** Create or update one note and persist the new complete list. */
  saveNote: (rootPath: string, id: string | null, draft: ProjectMemoryNoteDraft) => ProjectMemoryNote | null
  /** Remove one note and persist. */
  deleteNote: (rootPath: string, id: string) => void
}

export type ProjectMemoryStore = ProjectMemoryStoreState & ProjectMemoryStoreActions

function persist(rootPath: string, notes: ProjectMemoryNote[]): void {
  if (typeof window === 'undefined' || typeof window.electronAPI?.projectMemorySave !== 'function') return
  void window.electronAPI.projectMemorySave(rootPath, notes)
}

const pendingLoads = new Map<string, Promise<void>>()

export const useProjectMemoryStore = create<ProjectMemoryStore>((set, get) => ({
  notesByRoot: {},
  loadedRoots: {},
  revisions: {},

  async loadMemory(rootPath, force = false) {
    if (!rootPath || typeof window === 'undefined' || typeof window.electronAPI?.projectMemoryLoad !== 'function') return
    if (!force && get().loadedRoots[rootPath]) return
    const pending = pendingLoads.get(rootPath)
    if (pending) return pending
    const revisionAtStart = get().revisions[rootPath] ?? 0
    const load = window.electronAPI.projectMemoryLoad(rootPath).then((notes) => {
      if ((get().revisions[rootPath] ?? 0) !== revisionAtStart) return
      set((state) => ({
        notesByRoot: { ...state.notesByRoot, [rootPath]: notes },
        loadedRoots: { ...state.loadedRoots, [rootPath]: true },
      }))
    })
    pendingLoads.set(rootPath, load)
    try {
      await load
    } finally {
      if (pendingLoads.get(rootPath) === load) pendingLoads.delete(rootPath)
    }
  },

  getNotes(rootPath) {
    return get().notesByRoot[rootPath] ?? []
  },

  saveNote(rootPath, id, draft) {
    if (!rootPath) return null
    const current = get().notesByRoot[rootPath] ?? []
    const existing = id ? current.find((note) => note.id === id) : undefined
    const now = Date.now()
    const note = normalizeProjectMemoryNote({
      id: existing?.id ?? generateId(),
      ...draft,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    if (!note) return null
    const next = [
      ...current.filter((candidate) => candidate.id !== note.id),
      note,
    ]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_PROJECT_MEMORY_NOTES)
    set((state) => ({
      notesByRoot: { ...state.notesByRoot, [rootPath]: next },
      loadedRoots: { ...state.loadedRoots, [rootPath]: true },
      revisions: { ...state.revisions, [rootPath]: (state.revisions[rootPath] ?? 0) + 1 },
    }))
    persist(rootPath, next)
    return note
  },

  deleteNote(rootPath, id) {
    const current = get().notesByRoot[rootPath]
    if (!current?.some((note) => note.id === id)) return
    const next = current.filter((note) => note.id !== id)
    set((state) => ({
      notesByRoot: { ...state.notesByRoot, [rootPath]: next },
      revisions: { ...state.revisions, [rootPath]: (state.revisions[rootPath] ?? 0) + 1 },
    }))
    persist(rootPath, next)
  },
}))
