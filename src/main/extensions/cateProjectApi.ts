// =============================================================================
// First-party project API handlers.
//
// This module owns the resource-shaped part of CATE_API. It deliberately does
// not perform authorization; cateApiHandlers does that once for every invoke.
// Keeping the storage adapter here prevents the reverse endpoint and CLI from
// inventing separate task/context semantics.
// =============================================================================

import { getWorkspaceInfo } from '../workspaceManager'
import { loadTasks, createProjectTask, updateProjectTask, deleteProjectTask } from '../projectTaskStore'
import { loadMemory, createProjectMemoryNote, updateProjectMemoryNote, deleteProjectMemoryNote } from '../projectMemoryStore'
import { parseLocator } from '../../shared/runtimeLocator'
import {
  CATE_PUBLIC_METHODS,
  type CateTaskResult,
} from '../../shared/catePublicApi'
import {
  MAX_PROJECT_MEMORY_NOTES,
  normalizeProjectMemoryScope,
  projectMemoryScopeKey,
  type ProjectMemoryNote,
} from '../../shared/projectMemory'
import {
  MAX_PROJECT_TASKS,
  type ProjectTask,
  type ProjectTaskStatus,
} from '../../shared/projectTasks'

type PublicResult = unknown | { error: string; method?: string }

const PUBLIC_METHODS = new Set<string>(CATE_PUBLIC_METHODS)
const TASK_STATUSES: readonly ProjectTaskStatus[] = [
  'planned',
  'in-progress',
  'blocked',
  'completed',
  'failed',
  'cancelled',
]

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function stringArg(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function limitArg(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.min(fallback, Math.trunc(value)))
    : fallback
}

function error(method: string, code: string): PublicResult {
  return { error: code, method }
}

function workspaceRoot(workspaceId: string): string | null {
  const rootPath = getWorkspaceInfo(workspaceId)?.rootPath
  return typeof rootPath === 'string' && rootPath ? rootPath : null
}

function projectFor(workspaceId: string): Record<string, unknown> {
  const rootPath = workspaceRoot(workspaceId)
  const visiblePath = rootPath ? parseLocator(rootPath).path : null
  return {
    id: workspaceId,
    rootPath: visiblePath || null,
    branch: null,
    worktree: null,
  }
}

function taskResult(task: ProjectTask): CateTaskResult {
  return {
    id: task.id,
    taskId: task.id,
    objective: task.objective,
    status: task.status,
    value: task.validatedResult ?? null,
    validatedAt: task.validatedAt ?? null,
    artifacts: task.artifacts,
    updatedAt: task.updatedAt,
  }
}

async function readTasks(rootPath: string, method: string): Promise<ProjectTask[] | PublicResult> {
  try {
    return await loadTasks(rootPath)
  } catch {
    return error(method, 'project-read-failed')
  }
}

async function readMemory(rootPath: string, method: string): Promise<ProjectMemoryNote[] | PublicResult> {
  try {
    return await loadMemory(rootPath)
  } catch {
    return error(method, 'project-read-failed')
  }
}

export function isCateProjectMethod(method: string): boolean {
  return PUBLIC_METHODS.has(method)
}

/** Dispatch project/task/context/result methods after the common auth gate. */
export async function dispatchCateProjectInvoke(
  workspaceId: string,
  method: string,
  args: unknown,
): Promise<PublicResult> {
  if (!isCateProjectMethod(method)) return error(method, 'unsupported')
  if (method === 'cate.project.get') return projectFor(workspaceId)

  const rootPath = workspaceRoot(workspaceId)
  if (!rootPath) return error(method, 'no-workspace')
  const a = asRecord(args) ?? {}

  if (method === 'cate.tasks.list') {
    const status = a.status === undefined ? undefined : stringArg(a.status)
    if (status !== undefined && (!status || !TASK_STATUSES.includes(status as ProjectTaskStatus))) {
      return error(method, 'bad-args')
    }
    const tasks = await readTasks(rootPath, method)
    if (!Array.isArray(tasks)) return tasks
    const filtered = status ? tasks.filter((task) => task.status === status) : tasks
    const limit = limitArg(a.limit, MAX_PROJECT_TASKS)
    return { items: filtered.slice(0, limit), total: filtered.length }
  }

  if (method === 'cate.tasks.get') {
    const taskId = stringArg(a.taskId)
    if (!taskId) return error(method, 'bad-args')
    const tasks = await readTasks(rootPath, method)
    if (!Array.isArray(tasks)) return tasks
    return tasks.find((task) => task.id === taskId) ?? error(method, 'no-such-task')
  }

  if (method === 'cate.tasks.create') {
    if (!asRecord(a.draft)) return error(method, 'bad-args')
    try {
      const task = await createProjectTask(rootPath, a.draft)
      return task ?? error(method, 'invalid-task')
    } catch {
      return error(method, 'project-write-failed')
    }
  }

  if (method === 'cate.tasks.update') {
    const taskId = stringArg(a.taskId)
    if (!taskId || !asRecord(a.patch)) return error(method, 'bad-args')
    try {
      const task = await updateProjectTask(rootPath, taskId, a.patch)
      return task ?? error(method, 'no-such-task')
    } catch {
      return error(method, 'project-write-failed')
    }
  }

  if (method === 'cate.tasks.delete') {
    const taskId = stringArg(a.taskId)
    if (!taskId) return error(method, 'bad-args')
    try {
      return await deleteProjectTask(rootPath, taskId)
        ? { ok: true, taskId }
        : error(method, 'no-such-task')
    } catch {
      return error(method, 'project-write-failed')
    }
  }

  if (method === 'cate.context.list') {
    const rawScope = a.scope
    const scope = rawScope === undefined ? undefined : normalizeProjectMemoryScope(rawScope)
    if (rawScope !== undefined && !scope) return error(method, 'bad-args')
    const notes = await readMemory(rootPath, method)
    if (!Array.isArray(notes)) return notes
    const filtered = scope
      ? notes.filter((note) => projectMemoryScopeKey(note.scope) === projectMemoryScopeKey(scope))
      : notes
    const limit = limitArg(a.limit, MAX_PROJECT_MEMORY_NOTES)
    return { items: filtered.slice(0, limit), total: filtered.length }
  }

  if (method === 'cate.context.get') {
    const contextId = stringArg(a.contextId)
    if (!contextId) return error(method, 'bad-args')
    const notes = await readMemory(rootPath, method)
    if (!Array.isArray(notes)) return notes
    return notes.find((note) => note.id === contextId) ?? error(method, 'no-such-context')
  }

  if (method === 'cate.context.create') {
    if (!asRecord(a.draft)) return error(method, 'bad-args')
    try {
      const note = await createProjectMemoryNote(rootPath, a.draft)
      return note ?? error(method, 'invalid-context')
    } catch {
      return error(method, 'project-write-failed')
    }
  }

  if (method === 'cate.context.update') {
    const contextId = stringArg(a.contextId)
    if (!contextId || !asRecord(a.patch)) return error(method, 'bad-args')
    try {
      const note = await updateProjectMemoryNote(rootPath, contextId, a.patch)
      return note ?? error(method, 'no-such-context')
    } catch {
      return error(method, 'project-write-failed')
    }
  }

  if (method === 'cate.context.delete') {
    const contextId = stringArg(a.contextId)
    if (!contextId) return error(method, 'bad-args')
    try {
      return await deleteProjectMemoryNote(rootPath, contextId)
        ? { ok: true, contextId }
        : error(method, 'no-such-context')
    } catch {
      return error(method, 'project-write-failed')
    }
  }

  if (method === 'cate.results.list') {
    const taskId = a.taskId === undefined ? undefined : stringArg(a.taskId)
    if (a.taskId !== undefined && !taskId) return error(method, 'bad-args')
    const tasks = await readTasks(rootPath, method)
    if (!Array.isArray(tasks)) return tasks
    const selected = taskId ? tasks.filter((task) => task.id === taskId) : tasks
    const limit = limitArg(a.limit, MAX_PROJECT_TASKS)
    return {
      items: selected.slice(0, limit).map(taskResult),
      total: selected.length,
    }
  }

  if (method === 'cate.results.get') {
    const resultId = stringArg(a.resultId)
    if (!resultId) return error(method, 'bad-args')
    const tasks = await readTasks(rootPath, method)
    if (!Array.isArray(tasks)) return tasks
    const task = tasks.find((candidate) => candidate.id === resultId)
    return task ? taskResult(task) : error(method, 'no-such-result')
  }

  return error(method, 'unsupported')
}
