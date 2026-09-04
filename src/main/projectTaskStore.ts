// =============================================================================
// projectTaskStore — durable task contracts at `<project>/.cate/tasks.json`.
//
// The renderer owns the in-memory editing model; this module owns the filesystem
// adapter, input normalization, atomic writes and local/remote routing. Task
// records contain bounded evidence references only, so saving them never
// captures a terminal scrollback buffer implicitly.
// =============================================================================

import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import log from './logger'
import { KeyedLock } from './keyedLock'
import { PROJECT_TASKS_LOAD, PROJECT_TASKS_SAVE } from '../shared/ipc-channels'
import {
  normalizeProjectTask,
  normalizeProjectTasksFile,
  type ProjectTask,
  type ProjectTasksFile,
} from '../shared/projectTasks'
import { writeJsonAtomic } from './writeJsonAtomic'
import { quarantineCorruptFile } from './quarantineCorruptFile'
import { ensureCateGitignore, CATE_GITIGNORE_CONTENT } from './cateGitignore'
import { isLocalLocator, parseLocator } from '../shared/runtimeLocator'
import { runtimes } from './runtime/runtimeManager'

const CATE_DIR = '.cate'
const TASKS_FILE = 'tasks.json'
const saveQueues = new KeyedLock()

function cateDir(rootPath: string): string {
  return path.join(rootPath, CATE_DIR)
}

function tasksPath(rootPath: string): string {
  return path.join(rootPath, CATE_DIR, TASKS_FILE)
}

function remoteTargets(rootPath: string) {
  const { runtimeId, path: base } = parseLocator(rootPath)
  const dir = path.posix.join(base, CATE_DIR)
  return {
    runtime: runtimes.resolve(runtimeId),
    file: path.posix.join(dir, TASKS_FILE),
    gitignoreFile: path.posix.join(dir, '.gitignore'),
  }
}

function tasksFromFile(file: ProjectTasksFile): ProjectTask[] {
  return file.tasks
}

async function loadTasksRemote(rootPath: string): Promise<ProjectTask[]> {
  const { runtime, file } = remoteTargets(rootPath)
  const raw = await runtime.file.readFile(file).catch(() => null)
  if (!raw) return []
  try {
    return tasksFromFile(normalizeProjectTasksFile(JSON.parse(raw) as unknown))
  } catch {
    log.warn('[projectTaskStore] corrupt remote %s; starting empty', file)
    return []
  }
}

async function saveTasksRemote(rootPath: string, tasks: ProjectTask[]): Promise<void> {
  const { runtime, file, gitignoreFile } = remoteTargets(rootPath)
  await runtime.file
    .stat(gitignoreFile)
    .catch(() => runtime.file.writeFile(gitignoreFile, CATE_GITIGNORE_CONTENT))
  const payload = normalizeProjectTasksFile({ version: 1, tasks })
  await runtime.file.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`)
}

async function writeTasks(rootPath: string, tasks: ProjectTask[]): Promise<void> {
  if (!isLocalLocator(rootPath)) {
    await saveTasksRemote(rootPath, tasks)
    return
  }
  const payload = normalizeProjectTasksFile({ version: 1, tasks })
  await ensureCateGitignore(cateDir(rootPath))
  await writeJsonAtomic(tasksPath(rootPath), payload)
}

/** Read `.cate/tasks.json`. Missing or malformed data degrades to no tasks;
 * malformed local JSON is quarantined so the user's recovery copy survives. */
export async function loadTasks(rootPath: string): Promise<ProjectTask[]> {
  if (!isLocalLocator(rootPath)) return loadTasksRemote(rootPath)
  let raw: string
  try {
    raw = await fs.readFile(tasksPath(rootPath), 'utf-8')
  } catch {
    return []
  }
  try {
    return tasksFromFile(normalizeProjectTasksFile(JSON.parse(raw) as unknown))
  } catch {
    const backup = quarantineCorruptFile(tasksPath(rootPath))
    log.warn('[projectTaskStore] corrupt %s%s; starting empty', tasksPath(rootPath), backup ? `, backed up to ${backup}` : '')
    return []
  }
}

/** Persist the complete bounded task list atomically on local or remote hosts. */
export async function saveTasks(rootPath: string, tasks: ProjectTask[]): Promise<void> {
  await saveQueues.run(rootPath, () => writeTasks(rootPath, tasks))
}

interface TaskMutation<T> {
  value: T
  next?: ProjectTask[]
}

async function mutateTasks<T>(
  rootPath: string,
  mutate: (tasks: ProjectTask[]) => TaskMutation<T>,
): Promise<T> {
  return saveQueues.run(rootPath, async () => {
    const current = await loadTasks(rootPath)
    const result = mutate(current)
    if (result.next) await writeTasks(rootPath, result.next)
    return result.value
  })
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/** Create a task through the same bounded normalizer used by renderer saves.
 * The mutation is serialized with complete-list saves, so a CLI request cannot
 * overwrite a concurrent renderer/API write based on a stale read. */
export async function createProjectTask(
  rootPath: string,
  draft: unknown,
): Promise<ProjectTask | null> {
  const value = recordValue(draft)
  if (!value) return null
  const now = Date.now()
  const task = normalizeProjectTask({
    ...value,
    id: randomUUID(),
    constraints: value.constraints ?? [],
    status: value.status ?? 'planned',
    logs: value.logs ?? [],
    artifacts: value.artifacts ?? [],
    createdAt: now,
    updatedAt: now,
  })
  if (!task) return null
  return mutateTasks(rootPath, (tasks) => ({
    value: task,
    next: [...tasks, task],
  }))
}

const TASK_PATCH_FIELDS = [
  'objective',
  'constraints',
  'dependsOn',
  'executionPolicy',
  'approval',
  'attempts',
  'status',
  'validatedResult',
  'validatedAt',
  'logs',
  'artifacts',
  'runId',
  'ownerPanelId',
  'worktreeId',
] as const

export async function updateProjectTask(
  rootPath: string,
  taskId: string,
  patch: unknown,
): Promise<ProjectTask | null> {
  const value = recordValue(patch)
  if (!value || !taskId) return null
  return mutateTasks(rootPath, (tasks) => {
    const existing = tasks.find((task) => task.id === taskId)
    if (!existing) return { value: null }
    const candidate: Record<string, unknown> = { ...existing }
    for (const field of TASK_PATCH_FIELDS) {
      if (field in value) candidate[field] = value[field]
    }
    candidate.updatedAt = Date.now()
    const nextTask = normalizeProjectTask(candidate)
    if (!nextTask) return { value: null }
    return {
      value: nextTask,
      next: tasks.map((task) => task.id === taskId ? nextTask : task),
    }
  })
}

export async function deleteProjectTask(rootPath: string, taskId: string): Promise<boolean> {
  if (!taskId) return false
  return mutateTasks(rootPath, (tasks) => {
    const next = tasks.filter((task) => task.id !== taskId)
    return {
      value: next.length !== tasks.length,
      ...(next.length !== tasks.length ? { next } : {}),
    }
  })
}

export function registerProjectTaskHandlers(): void {
  ipcMain.handle(PROJECT_TASKS_LOAD, async (_event, rootPath: string) => loadTasks(rootPath))

  ipcMain.handle(PROJECT_TASKS_SAVE, async (_event, rootPath: string, tasks: ProjectTask[]) => {
    try {
      await saveTasks(rootPath, tasks)
    } catch (err) {
      log.warn('[projectTaskStore] save failed for %s: %O', cateDir(rootPath), err)
    }
  })
}
