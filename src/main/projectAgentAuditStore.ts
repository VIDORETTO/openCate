// =============================================================================
// projectAgentAuditStore — bounded local provenance at
// `<project>/.cate/agent-audit.json`.
//
// The audit file stores actor/destination metadata and outcomes, never prompt,
// command, or selected-context contents. This module owns local/remote routing,
// normalization, quarantine, and atomic persistence; the renderer owns the
// short-lived projection used by the UI send paths.
// =============================================================================

import { ipcMain } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import log from './logger'
import { KeyedLock } from './keyedLock'
import { PROJECT_AGENT_AUDIT_LOAD, PROJECT_AGENT_AUDIT_SAVE } from '../shared/ipc-channels'
import {
  normalizeAgentAuditFile,
  type AgentAuditEvent,
  type AgentAuditFile,
} from '../shared/agentAudit'
import { writeJsonAtomic } from './writeJsonAtomic'
import { quarantineCorruptFile } from './quarantineCorruptFile'
import { ensureCateGitignore, CATE_GITIGNORE_CONTENT } from './cateGitignore'
import { isLocalLocator, parseLocator } from '../shared/runtimeLocator'
import { runtimes } from './runtime/runtimeManager'

const CATE_DIR = '.cate'
const AUDIT_FILE = 'agent-audit.json'
const saveQueues = new KeyedLock()

function cateDir(rootPath: string): string {
  return path.join(rootPath, CATE_DIR)
}

function auditPath(rootPath: string): string {
  return path.join(rootPath, CATE_DIR, AUDIT_FILE)
}

function remoteTargets(rootPath: string) {
  const { runtimeId, path: base } = parseLocator(rootPath)
  const dir = path.posix.join(base, CATE_DIR)
  return {
    runtime: runtimes.resolve(runtimeId),
    file: path.posix.join(dir, AUDIT_FILE),
    gitignoreFile: path.posix.join(dir, '.gitignore'),
  }
}

function eventsFromFile(file: AgentAuditFile): AgentAuditEvent[] {
  return file.events
}

async function loadAgentAuditRemote(rootPath: string): Promise<AgentAuditEvent[]> {
  const { runtime, file } = remoteTargets(rootPath)
  const raw = await runtime.file.readFile(file).catch(() => null)
  if (!raw) return []
  try {
    return eventsFromFile(normalizeAgentAuditFile(JSON.parse(raw) as unknown))
  } catch {
    log.warn('[projectAgentAuditStore] corrupt remote %s; starting empty', file)
    return []
  }
}

async function saveAgentAuditRemote(rootPath: string, events: AgentAuditEvent[]): Promise<void> {
  const { runtime, file, gitignoreFile } = remoteTargets(rootPath)
  await runtime.file
    .stat(gitignoreFile)
    .catch(() => runtime.file.writeFile(gitignoreFile, CATE_GITIGNORE_CONTENT))
  const payload = normalizeAgentAuditFile({ version: 1, events })
  await runtime.file.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`)
}

/** Read `.cate/agent-audit.json`. Missing or malformed data degrades to no
 * events; malformed local JSON is quarantined for manual recovery. */
export async function loadAgentAudit(rootPath: string): Promise<AgentAuditEvent[]> {
  if (!isLocalLocator(rootPath)) return loadAgentAuditRemote(rootPath)
  let raw: string
  try {
    raw = await fs.readFile(auditPath(rootPath), 'utf-8')
  } catch {
    return []
  }
  try {
    return eventsFromFile(normalizeAgentAuditFile(JSON.parse(raw) as unknown))
  } catch {
    const backup = quarantineCorruptFile(auditPath(rootPath))
    log.warn('[projectAgentAuditStore] corrupt %s%s; starting empty', auditPath(rootPath), backup ? `, backed up to ${backup}` : '')
    return []
  }
}

/** Persist the complete bounded event list atomically on local or remote hosts. */
export async function saveAgentAudit(rootPath: string, events: AgentAuditEvent[]): Promise<void> {
  await saveQueues.run(rootPath, async () => {
    if (!isLocalLocator(rootPath)) {
      await saveAgentAuditRemote(rootPath, events)
      return
    }
    const payload = normalizeAgentAuditFile({ version: 1, events })
    await ensureCateGitignore(cateDir(rootPath))
    await writeJsonAtomic(auditPath(rootPath), payload)
  })
}

export function registerProjectAgentAuditHandlers(): void {
  ipcMain.handle(PROJECT_AGENT_AUDIT_LOAD, async (_event, rootPath: string) => loadAgentAudit(rootPath))

  ipcMain.handle(PROJECT_AGENT_AUDIT_SAVE, async (_event, rootPath: string, events: AgentAuditEvent[]) => {
    try {
      await saveAgentAudit(rootPath, events)
    } catch (err) {
      log.warn('[projectAgentAuditStore] save failed for %s: %O', cateDir(rootPath), err)
    }
  })
}
