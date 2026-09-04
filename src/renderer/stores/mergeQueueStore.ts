import { create } from 'zustand'
import {
  MAX_MERGE_QUEUE_ENTRIES,
  type MergeQueueEntry,
  type MergeQueueStatus,
} from '../../shared/mergeQueue'

interface MergeQueueInput {
  rootPath: string
  workspaceId: string
  worktreeId: string
  sourceBranch: string
  targetBranch: string
}

interface MergeQueueStore {
  entriesByRoot: Record<string, MergeQueueEntry[]>
  enqueue: (input: MergeQueueInput) => MergeQueueEntry | null
  startNext: (rootPath: string) => MergeQueueEntry | null
  finish: (rootPath: string, id: string, status: Exclude<MergeQueueStatus, 'queued' | 'running'>, message?: string) => void
  remove: (rootPath: string, id: string) => void
  clearFinished: (rootPath: string) => void
}

function byNewest(left: MergeQueueEntry, right: MergeQueueEntry): number {
  return left.enqueuedAt - right.enqueuedAt || left.id.localeCompare(right.id)
}

export const useMergeQueueStore = create<MergeQueueStore>((set, get) => ({
  entriesByRoot: {},

  enqueue(input) {
    const current = get().entriesByRoot[input.rootPath] ?? []
    const duplicate = current.find((entry) =>
      entry.worktreeId === input.worktreeId &&
      entry.targetBranch === input.targetBranch &&
      (entry.status === 'queued' || entry.status === 'running'))
    if (duplicate) return duplicate
    if (current.length >= MAX_MERGE_QUEUE_ENTRIES) return null
    const entry: MergeQueueEntry = {
      ...input,
      id: crypto.randomUUID(),
      status: 'queued',
      enqueuedAt: Date.now(),
    }
    set((state) => ({
      entriesByRoot: {
        ...state.entriesByRoot,
        [input.rootPath]: [...current, entry].sort(byNewest),
      },
    }))
    return entry
  },

  startNext(rootPath) {
    const current = get().entriesByRoot[rootPath] ?? []
    const next = current.find((entry) => entry.status === 'queued')
    if (!next) return null
    const started: MergeQueueEntry = { ...next, status: 'running', startedAt: Date.now() }
    set((state) => ({
      entriesByRoot: {
        ...state.entriesByRoot,
        [rootPath]: current.map((entry) => entry.id === next.id ? started : entry),
      },
    }))
    return started
  },

  finish(rootPath, id, status, message) {
    const current = get().entriesByRoot[rootPath] ?? []
    set((state) => ({
      entriesByRoot: {
        ...state.entriesByRoot,
        [rootPath]: current.map((entry) => entry.id === id
          ? { ...entry, status, finishedAt: Date.now(), ...(message ? { message } : {}) }
          : entry),
      },
    }))
  },

  remove(rootPath, id) {
    const current = get().entriesByRoot[rootPath] ?? []
    set((state) => ({
      entriesByRoot: {
        ...state.entriesByRoot,
        [rootPath]: current.filter((entry) => entry.id !== id),
      },
    }))
  },

  clearFinished(rootPath) {
    const current = get().entriesByRoot[rootPath] ?? []
    set((state) => ({
      entriesByRoot: {
        ...state.entriesByRoot,
        [rootPath]: current.filter((entry) => entry.status === 'queued' || entry.status === 'running' || entry.status === 'conflict'),
      },
    }))
  },
}))
