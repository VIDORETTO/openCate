// =============================================================================
// projectMemoryStore — user-curated project/worktree notes at
// `<project>/.cate/memory.json`.
//
// Memory is machine-local like chats/session state. It is deliberately separate
// from workspace.json because citations can contain local checkout paths and
// notes are personal context. The renderer sends the complete bounded list;
// this module owns validation, atomic persistence and local/remote routing.
// =============================================================================

import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import log from './logger'
import { KeyedLock } from './keyedLock'
import { PROJECT_MEMORY_LOAD, PROJECT_MEMORY_SAVE } from '../shared/ipc-channels'
import {
  normalizeProjectMemoryNote,
  normalizeProjectMemoryFile,
  type ProjectMemoryFile,
  type ProjectMemoryNote,
} from '../shared/projectMemory'
import { writeJsonAtomic } from './writeJsonAtomic'
import { quarantineCorruptFile } from './quarantineCorruptFile'
import { ensureCateGitignore, CATE_GITIGNORE_CONTENT } from './cateGitignore'
import { isLocalLocator, parseLocator } from '../shared/runtimeLocator'
import { runtimes } from './runtime/runtimeManager'

const CATE_DIR = '.cate'
const MEMORY_FILE = 'memory.json'
const saveQueues = new KeyedLock()

function cateDir(rootPath: string): string {
  return path.join(rootPath, CATE_DIR)
}

function memoryPath(rootPath: string): string {
  return path.join(rootPath, CATE_DIR, MEMORY_FILE)
}

function remoteTargets(rootPath: string) {
  const { runtimeId, path: base } = parseLocator(rootPath)
  const dir = path.posix.join(base, CATE_DIR)
  return {
    runtime: runtimes.resolve(runtimeId),
    file: path.posix.join(dir, MEMORY_FILE),
    gitignoreFile: path.posix.join(dir, '.gitignore'),
  }
}

function notesFromFile(file: ProjectMemoryFile): ProjectMemoryNote[] {
  return file.notes
}

async function loadMemoryRemote(rootPath: string): Promise<ProjectMemoryNote[]> {
  const { runtime, file } = remoteTargets(rootPath)
  const raw = await runtime.file.readFile(file).catch(() => null)
  if (!raw) return []
  try {
    return notesFromFile(normalizeProjectMemoryFile(JSON.parse(raw) as unknown))
  } catch {
    log.warn('[projectMemoryStore] corrupt remote %s; starting empty', file)
    return []
  }
}

async function saveMemoryRemote(rootPath: string, notes: ProjectMemoryNote[]): Promise<void> {
  const { runtime, file, gitignoreFile } = remoteTargets(rootPath)
  await runtime.file
    .stat(gitignoreFile)
    .catch(() => runtime.file.writeFile(gitignoreFile, CATE_GITIGNORE_CONTENT))
  const payload = normalizeProjectMemoryFile({ version: 1, notes })
  await runtime.file.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`)
}

async function writeMemory(rootPath: string, notes: ProjectMemoryNote[]): Promise<void> {
  if (!isLocalLocator(rootPath)) {
    await saveMemoryRemote(rootPath, notes)
    return
  }
  const payload = normalizeProjectMemoryFile({ version: 1, notes })
  await ensureCateGitignore(cateDir(rootPath))
  await writeJsonAtomic(memoryPath(rootPath), payload)
}

/** Read `.cate/memory.json` for a project. Missing or invalid notes degrade to
 * an empty list; locally malformed JSON is quarantined for recovery. */
export async function loadMemory(rootPath: string): Promise<ProjectMemoryNote[]> {
  if (!isLocalLocator(rootPath)) return loadMemoryRemote(rootPath)
  let raw: string
  try {
    raw = await fs.readFile(memoryPath(rootPath), 'utf-8')
  } catch {
    return []
  }
  try {
    return notesFromFile(normalizeProjectMemoryFile(JSON.parse(raw) as unknown))
  } catch {
    const backup = quarantineCorruptFile(memoryPath(rootPath))
    log.warn('[projectMemoryStore] corrupt %s%s; starting empty', memoryPath(rootPath), backup ? `, backed up to ${backup}` : '')
    return []
  }
}

/** Persist the complete bounded note list atomically on the local filesystem
 * or through the runtime file API for a remote project. */
export async function saveMemory(rootPath: string, notes: ProjectMemoryNote[]): Promise<void> {
  await saveQueues.run(rootPath, () => writeMemory(rootPath, notes))
}

interface MemoryMutation<T> {
  value: T
  next?: ProjectMemoryNote[]
}

async function mutateMemory<T>(
  rootPath: string,
  mutate: (notes: ProjectMemoryNote[]) => MemoryMutation<T>,
): Promise<T> {
  return saveQueues.run(rootPath, async () => {
    const current = await loadMemory(rootPath)
    const result = mutate(current)
    if (result.next) await writeMemory(rootPath, result.next)
    return result.value
  })
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/** Mutations used by the first-party project API. They share the renderer's
 * normalizer and serialize complete-list writes with renderer persistence. */
export async function createProjectMemoryNote(
  rootPath: string,
  draft: unknown,
): Promise<ProjectMemoryNote | null> {
  const value = recordValue(draft)
  if (!value) return null
  const now = Date.now()
  const note = normalizeProjectMemoryNote({
    ...value,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  })
  if (!note) return null
  return mutateMemory(rootPath, (notes) => ({
    value: note,
    next: [...notes, note],
  }))
}

const MEMORY_PATCH_FIELDS = ['scope', 'title', 'content', 'citations'] as const

export async function updateProjectMemoryNote(
  rootPath: string,
  noteId: string,
  patch: unknown,
): Promise<ProjectMemoryNote | null> {
  const value = recordValue(patch)
  if (!value || !noteId) return null
  return mutateMemory(rootPath, (notes) => {
    const existing = notes.find((note) => note.id === noteId)
    if (!existing) return { value: null }
    const candidate: Record<string, unknown> = { ...existing }
    for (const field of MEMORY_PATCH_FIELDS) {
      if (field in value) candidate[field] = value[field]
    }
    candidate.updatedAt = Date.now()
    const nextNote = normalizeProjectMemoryNote(candidate)
    if (!nextNote) return { value: null }
    return {
      value: nextNote,
      next: notes.map((note) => note.id === noteId ? nextNote : note),
    }
  })
}

export async function deleteProjectMemoryNote(rootPath: string, noteId: string): Promise<boolean> {
  if (!noteId) return false
  return mutateMemory(rootPath, (notes) => {
    const next = notes.filter((note) => note.id !== noteId)
    return {
      value: next.length !== notes.length,
      ...(next.length !== notes.length ? { next } : {}),
    }
  })
}

export function registerProjectMemoryHandlers(): void {
  ipcMain.handle(PROJECT_MEMORY_LOAD, async (_event, rootPath: string) => loadMemory(rootPath))

  ipcMain.handle(PROJECT_MEMORY_SAVE, async (_event, rootPath: string, notes: ProjectMemoryNote[]) => {
    try {
      await saveMemory(rootPath, notes)
    } catch (err) {
      log.warn('[projectMemoryStore] save failed for %s: %O', cateDir(rootPath), err)
    }
  })
}
