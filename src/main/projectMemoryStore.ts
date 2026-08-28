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
import fs from 'fs/promises'
import path from 'path'
import log from './logger'
import { KeyedLock } from './keyedLock'
import { PROJECT_MEMORY_LOAD, PROJECT_MEMORY_SAVE } from '../shared/ipc-channels'
import {
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
  await saveQueues.run(rootPath, async () => {
    if (!isLocalLocator(rootPath)) {
      await saveMemoryRemote(rootPath, notes)
      return
    }
    const payload = normalizeProjectMemoryFile({ version: 1, notes })
    await ensureCateGitignore(cateDir(rootPath))
    await writeJsonAtomic(memoryPath(rootPath), payload)
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
