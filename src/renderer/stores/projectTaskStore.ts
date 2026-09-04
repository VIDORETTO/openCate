// =============================================================================
// projectTaskStore — renderer editing model for project task contracts.
// Main remains the filesystem adapter; every mutation writes the complete
// bounded list through the typed preload bridge.
// =============================================================================

import { create } from 'zustand'
import type { CodingAgentRun } from '../../shared/codingAgentRuns'
import {
  MAX_PROJECT_TASK_ARTIFACTS,
  MAX_PROJECT_TASK_LOGS,
  MAX_PROJECT_TASKS,
  normalizeProjectTask,
  type ProjectTaskApproval,
  type ProjectTaskApprovalStatus,
  type ProjectTaskAttempt,
  type ProjectTask,
  type ProjectTaskArtifact,
  type ProjectTaskArtifactKind,
  type ProjectTaskDraft,
  type ProjectTaskLog,
  type ProjectTaskLogLevel,
  type ProjectTaskStatus,
} from '../../shared/projectTasks'
import { generateId } from './canvas/helpers'

type ProjectTaskPatch = Partial<Pick<
  ProjectTask,
  'objective' | 'constraints' | 'dependsOn' | 'executionPolicy' | 'approval' | 'attempts' |
  'status' | 'validatedResult' | 'validatedAt' | 'logs' | 'artifacts' | 'runId' |
  'ownerPanelId' | 'worktreeId'
>>

export type ProjectTaskLogDraft = Omit<ProjectTaskLog, 'id'>
export type ProjectTaskArtifactDraft = Omit<ProjectTaskArtifact, 'id'>
export type ProjectTaskAttemptDraft = Omit<ProjectTaskAttempt, 'id'>

interface ProjectTaskStoreState {
  tasksByRoot: Record<string, ProjectTask[]>
  loadedRoots: Record<string, boolean>
  /** Prevent a slow initial load from replacing a newer local mutation. */
  revisions: Record<string, number>
}

interface ProjectTaskStoreActions {
  loadTasks: (rootPath: string, force?: boolean) => Promise<void>
  getTasks: (rootPath: string) => ProjectTask[]
  getTask: (rootPath: string, taskId: string) => ProjectTask | undefined
  createTask: (rootPath: string, draft: ProjectTaskDraft) => ProjectTask | null
  updateTask: (rootPath: string, taskId: string, patch: ProjectTaskPatch) => ProjectTask | null
  appendTaskLog: (rootPath: string, taskId: string, draft: ProjectTaskLogDraft) => ProjectTask | null
  addTaskArtifact: (rootPath: string, taskId: string, draft: ProjectTaskArtifactDraft) => ProjectTask | null
  requestTaskApproval: (rootPath: string, taskId: string, note?: string) => ProjectTask | null
  decideTaskApproval: (rootPath: string, taskId: string, status: Exclude<ProjectTaskApprovalStatus, 'pending'>, note?: string) => ProjectTask | null
  recordTaskAttempt: (rootPath: string, taskId: string, draft: ProjectTaskAttemptDraft) => ProjectTask | null
  /** Apply explicit run facts to the linked task, including file references
   * reported by hooks. No terminal output is copied. */
  syncTaskWithRun: (
    rootPath: string,
    run: Pick<CodingAgentRun, 'id' | 'taskId' | 'filesTouched'>,
    status: ProjectTaskStatus,
    log?: ProjectTaskLogDraft,
  ) => ProjectTask | null
}

export type ProjectTaskStore = ProjectTaskStoreState & ProjectTaskStoreActions

function persist(rootPath: string, tasks: ProjectTask[]): void {
  if (typeof window === 'undefined' || typeof window.electronAPI?.projectTasksSave !== 'function') return
  void window.electronAPI.projectTasksSave(rootPath, tasks).catch(() => {
    // The main process logs durable-write failures. The in-memory projection
    // remains usable and the next mutation retries the complete list.
  })
}

function sortTasks(tasks: readonly ProjectTask[]): ProjectTask[] {
  return [...tasks]
    .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))
    .slice(0, MAX_PROJECT_TASKS)
}

function replaceTask(
  rootPath: string,
  taskId: string,
  build: (task: ProjectTask) => ProjectTask | null,
  set: (updater: (state: ProjectTaskStoreState) => ProjectTaskStoreState) => void,
  get: () => ProjectTaskStoreState,
): ProjectTask | null {
  const current = get().tasksByRoot[rootPath] ?? []
  const existing = current.find((task) => task.id === taskId)
  if (!existing) return null
  const nextTask = build(existing)
  if (!nextTask) return null
  const next = sortTasks([
    ...current.filter((task) => task.id !== taskId),
    nextTask,
  ])
  set((state) => ({
    ...state,
    tasksByRoot: { ...state.tasksByRoot, [rootPath]: next },
    loadedRoots: { ...state.loadedRoots, [rootPath]: true },
    revisions: { ...state.revisions, [rootPath]: (state.revisions[rootPath] ?? 0) + 1 },
  }))
  persist(rootPath, next)
  return nextTask
}

const pendingLoads = new Map<string, Promise<void>>()

export const useProjectTaskStore = create<ProjectTaskStore>((set, get) => ({
  tasksByRoot: {},
  loadedRoots: {},
  revisions: {},

  async loadTasks(rootPath, force = false) {
    if (!rootPath || typeof window === 'undefined' || typeof window.electronAPI?.projectTasksLoad !== 'function') return
    if (!force && get().loadedRoots[rootPath]) return
    const pending = pendingLoads.get(rootPath)
    if (pending) return pending
    const revisionAtStart = get().revisions[rootPath] ?? 0
    const load = window.electronAPI.projectTasksLoad(rootPath).then((tasks) => {
      if ((get().revisions[rootPath] ?? 0) !== revisionAtStart) return
      set((state) => ({
        tasksByRoot: { ...state.tasksByRoot, [rootPath]: sortTasks(tasks) },
        loadedRoots: { ...state.loadedRoots, [rootPath]: true },
      }))
    }).catch(() => {
      // A missing or temporarily unavailable project degrades to an empty
      // editor; main has already quarantined malformed local JSON when needed.
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

  getTasks(rootPath) {
    return get().tasksByRoot[rootPath] ?? []
  },

  getTask(rootPath, taskId) {
    return get().tasksByRoot[rootPath]?.find((task) => task.id === taskId)
  },

  createTask(rootPath, draft) {
    if (!rootPath) return null
    const now = Date.now()
    const task = normalizeProjectTask({
      ...draft,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    })
    if (!task) return null
    const next = sortTasks([...(get().tasksByRoot[rootPath] ?? []), task])
    set((state) => ({
      tasksByRoot: { ...state.tasksByRoot, [rootPath]: next },
      loadedRoots: { ...state.loadedRoots, [rootPath]: true },
      revisions: { ...state.revisions, [rootPath]: (state.revisions[rootPath] ?? 0) + 1 },
    }))
    persist(rootPath, next)
    return task
  },

  updateTask(rootPath, taskId, patch) {
    return replaceTask(
      rootPath,
      taskId,
      (task) => normalizeProjectTask({
        ...task,
        ...patch,
        id: task.id,
        createdAt: task.createdAt,
        updatedAt: Date.now(),
      }),
      set,
      get,
    )
  },

  appendTaskLog(rootPath, taskId, draft) {
    return get().updateTask(rootPath, taskId, {
      logs: [
        ...(get().getTask(rootPath, taskId)?.logs ?? []),
        { ...draft, id: generateId() },
      ].slice(-MAX_PROJECT_TASK_LOGS),
    })
  },

  addTaskArtifact(rootPath, taskId, draft) {
    const task = get().getTask(rootPath, taskId)
    if (!task) return null
    const existing = task.artifacts.find((artifact) =>
      artifact.kind === draft.kind && artifact.locator === draft.locator)
    if (existing) return task
    return get().updateTask(rootPath, taskId, {
      artifacts: [
        ...task.artifacts,
        { ...draft, id: generateId() },
      ].slice(-MAX_PROJECT_TASK_ARTIFACTS),
    })
  },

  requestTaskApproval(rootPath, taskId, note) {
    const task = get().getTask(rootPath, taskId)
    if (!task) return null
    const now = Date.now()
    const approval: ProjectTaskApproval = {
      status: 'pending',
      requestedAt: now,
      ...(note?.trim() ? { note: note.trim() } : {}),
    }
    return get().updateTask(rootPath, taskId, {
      approval,
      logs: [...task.logs, {
        id: generateId(),
        timestamp: now,
        level: 'info',
        message: 'Human approval requested before execution.',
      }],
    })
  },

  decideTaskApproval(rootPath, taskId, status, note) {
    const task = get().getTask(rootPath, taskId)
    if (!task) return null
    const now = Date.now()
    const approval: ProjectTaskApproval = {
      status,
      requestedAt: task.approval?.requestedAt ?? now,
      decidedAt: now,
      ...(note?.trim() ? { note: note.trim() } : task.approval?.note ? { note: task.approval.note } : {}),
    }
    return get().updateTask(rootPath, taskId, {
      approval,
      logs: [...task.logs, {
        id: generateId(),
        timestamp: now,
        level: status === 'approved' ? 'success' : 'warning',
        message: status === 'approved' ? 'Human approval granted.' : 'Human approval rejected.',
      }],
    })
  },

  recordTaskAttempt(rootPath, taskId, draft) {
    const task = get().getTask(rootPath, taskId)
    if (!task) return null
    return get().updateTask(rootPath, taskId, {
      attempts: [
        ...(task.attempts ?? []),
        { ...draft, id: generateId() },
      ],
    })
  },

  syncTaskWithRun(rootPath, run, status, log) {
    if (!run.taskId) return null
    const task = get().getTask(rootPath, run.taskId)
    if (!task) return null
    const artifacts = [...task.artifacts]
    let artifactAdded = false
    for (const touched of run.filesTouched ?? []) {
      if (artifacts.some((artifact) => artifact.kind === 'file' && artifact.locator === touched.path)) continue
      artifactAdded = true
      artifacts.push({
        id: generateId(),
        kind: 'file',
        label: touched.path,
        locator: touched.path,
        createdAt: touched.lastObservedAt,
      })
    }
    const logs = log
      ? [...task.logs, { ...log, id: generateId() }].slice(-MAX_PROJECT_TASK_LOGS)
      : task.logs
    const attemptOutcome: ProjectTaskAttempt['outcome'] = status === 'completed'
      ? 'completed'
      : status === 'cancelled'
        ? 'cancelled'
        : status === 'failed'
          ? 'failed'
          : 'running'
    const attempts = task.attempts?.map((attempt) => {
      if (attempt.id !== run.id || attemptOutcome === 'running') return attempt
      return {
        ...attempt,
        outcome: attemptOutcome,
        endedAt: log?.timestamp ?? Date.now(),
        ...(log?.message ? { message: log.message } : {}),
      }
    })
    const attemptChanged = attempts?.some((attempt, index) => attempt !== task.attempts?.[index]) === true
    if (task.status === status && !artifactAdded && !log && !attemptChanged) return task
    return get().updateTask(rootPath, run.taskId, {
      status,
      artifacts: artifacts.slice(-MAX_PROJECT_TASK_ARTIFACTS),
      logs,
      ...(attempts ? { attempts } : {}),
    })
  },
}))

export type { ProjectTaskPatch }
export type { ProjectTaskArtifactKind, ProjectTaskLogLevel }
