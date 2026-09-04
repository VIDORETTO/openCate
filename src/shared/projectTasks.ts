// =============================================================================
// Project tasks — the durable contract for work openCate assigns to an agent or
// records manually. The file contains intent and evidence, never an implicit
// terminal transcript or a second live-process state machine.
// =============================================================================

export type ProjectTaskStatus =
  | 'planned'
  | 'in-progress'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type ProjectTaskLogLevel = 'info' | 'success' | 'warning' | 'error'

export type ProjectTaskArtifactKind =
  | 'file'
  | 'diff'
  | 'test-report'
  | 'log'
  | 'url'
  | 'other'

export type ProjectTaskApprovalStatus = 'pending' | 'approved' | 'rejected'

export type ProjectTaskAttemptOutcome =
  | 'running'
  | 'completed'
  | 'failed'
  | 'timed-out'
  | 'cancelled'

export interface ProjectTaskExecutionPolicy {
  maxAttempts: number
  timeoutMs: number
  healthCheckIntervalMs: number
  retryDelayMs: number
  requireApproval: boolean
}

export interface ProjectTaskApproval {
  status: ProjectTaskApprovalStatus
  requestedAt: number
  decidedAt?: number
  note?: string
}

export interface ProjectTaskAttempt {
  id: string
  number: number
  startedAt: number
  endedAt?: number
  outcome: ProjectTaskAttemptOutcome
  message?: string
}

export interface ProjectTaskLog {
  id: string
  timestamp: number
  level: ProjectTaskLogLevel
  /** A bounded human-readable event, not a copied terminal buffer. */
  message: string
}

export interface ProjectTaskArtifact {
  id: string
  kind: ProjectTaskArtifactKind
  /** Short label rendered in the task inspector. */
  label: string
  /** A repo-relative path, task id, URL, or other stable locator. */
  locator: string
  description?: string
  createdAt: number
}

export interface ProjectTask {
  id: string
  /** The outcome the user wants the agent or human to achieve. */
  objective: string
  /** Explicit constraints supplied by the user; none are inferred. */
  constraints: string[]
  /** Explicit prerequisite task ids. A missing or cyclic prerequisite blocks execution. */
  dependsOn?: string[]
  /** Optional bounded policy used by a task runner; absent means one attempt, no approval gate. */
  executionPolicy?: ProjectTaskExecutionPolicy
  /** Human decision required only when executionPolicy.requireApproval is true. */
  approval?: ProjectTaskApproval
  /** Bounded execution history; process output remains outside this contract. */
  attempts?: ProjectTaskAttempt[]
  status: ProjectTaskStatus
  /** Human-entered or explicitly reported result that was validated. */
  validatedResult?: string
  validatedAt?: number
  /** Bounded, structured events. Terminal scrollback is never copied here. */
  logs: ProjectTaskLog[]
  /** References to evidence; artifact contents stay at their source locator. */
  artifacts: ProjectTaskArtifact[]
  createdAt: number
  updatedAt: number
  /** Optional link to the openCate-owned mission that is working this task. */
  runId?: string
  ownerPanelId?: string
  worktreeId?: string
}

export interface ProjectTasksFile {
  version: 1
  tasks: ProjectTask[]
}

export type ProjectTaskDraft = Omit<ProjectTask, 'id' | 'createdAt' | 'updatedAt'>

export const PROJECT_TASKS_FILE_VERSION = 1 as const
export const MAX_PROJECT_TASKS = 200
export const MAX_PROJECT_TASK_OBJECTIVE_CHARS = 20_000
export const MAX_PROJECT_TASK_CONSTRAINTS = 32
export const MAX_PROJECT_TASK_CONSTRAINT_CHARS = 1_000
export const MAX_PROJECT_TASK_DEPENDENCIES = 32
export const MAX_PROJECT_TASK_DEPENDENCY_ID_CHARS = 128
export const MAX_PROJECT_TASK_ATTEMPTS = 16
export const MAX_PROJECT_TASK_ATTEMPT_MESSAGE_CHARS = 1_000
export const MAX_PROJECT_TASK_APPROVAL_NOTE_CHARS = 1_000
export const MAX_PROJECT_TASK_RESULT_CHARS = 20_000
export const MAX_PROJECT_TASK_LOGS = 200
export const MAX_PROJECT_TASK_LOG_MESSAGE_CHARS = 4_000
export const MAX_PROJECT_TASK_ARTIFACTS = 100
export const MAX_PROJECT_TASK_ARTIFACT_LABEL_CHARS = 160
export const MAX_PROJECT_TASK_ARTIFACT_LOCATOR_CHARS = 8_000
export const MAX_PROJECT_TASK_ARTIFACT_DESCRIPTION_CHARS = 2_000
export const MAX_PROJECT_TASK_MAX_ATTEMPTS = 5
export const MAX_PROJECT_TASK_TIMEOUT_MS = 2 * 60 * 60 * 1_000
export const MAX_PROJECT_TASK_HEALTH_CHECK_INTERVAL_MS = 10 * 60 * 1_000
export const MAX_PROJECT_TASK_RETRY_DELAY_MS = 10 * 60 * 1_000

export const DEFAULT_PROJECT_TASK_EXECUTION_POLICY: Readonly<ProjectTaskExecutionPolicy> = {
  maxAttempts: 1,
  timeoutMs: 15 * 60 * 1_000,
  healthCheckIntervalMs: 15 * 1_000,
  retryDelayMs: 1_000,
  requireApproval: false,
}

const TASK_STATUSES = new Set<ProjectTaskStatus>([
  'planned',
  'in-progress',
  'blocked',
  'completed',
  'failed',
  'cancelled',
])

const LOG_LEVELS = new Set<ProjectTaskLogLevel>(['info', 'success', 'warning', 'error'])

const ARTIFACT_KINDS = new Set<ProjectTaskArtifactKind>([
  'file',
  'diff',
  'test-report',
  'log',
  'url',
  'other',
])

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string' || value.includes('\0')) return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

function boundedTime(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function boundedStringArray(value: unknown, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => boundedText(entry, maxChars))
    .filter((entry): entry is string => entry !== null)
    .slice(0, maxItems)
}

function boundedUniqueStringArray(value: unknown, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(value)) return []
  const result: string[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    const normalized = boundedText(entry, maxChars)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
    if (result.length >= maxItems) break
  }
  return result
}

function normalizeProjectTaskExecutionPolicy(raw: unknown): ProjectTaskExecutionPolicy | null {
  const value = recordValue(raw)
  if (!value) return null
  return {
    maxAttempts: boundedInteger(value.maxAttempts, DEFAULT_PROJECT_TASK_EXECUTION_POLICY.maxAttempts, 1, MAX_PROJECT_TASK_MAX_ATTEMPTS),
    timeoutMs: boundedInteger(value.timeoutMs, DEFAULT_PROJECT_TASK_EXECUTION_POLICY.timeoutMs, 1, MAX_PROJECT_TASK_TIMEOUT_MS),
    healthCheckIntervalMs: boundedInteger(value.healthCheckIntervalMs, DEFAULT_PROJECT_TASK_EXECUTION_POLICY.healthCheckIntervalMs, 1, MAX_PROJECT_TASK_HEALTH_CHECK_INTERVAL_MS),
    retryDelayMs: boundedInteger(value.retryDelayMs, DEFAULT_PROJECT_TASK_EXECUTION_POLICY.retryDelayMs, 0, MAX_PROJECT_TASK_RETRY_DELAY_MS),
    requireApproval: value.requireApproval === true,
  }
}

function normalizeProjectTaskApproval(raw: unknown): ProjectTaskApproval | null {
  const value = recordValue(raw)
  if (!value) return null
  const status = value.status === 'pending' || value.status === 'approved' || value.status === 'rejected'
    ? value.status
    : null
  const requestedAt = boundedTime(value.requestedAt)
  const decidedAt = value.decidedAt === undefined ? undefined : boundedTime(value.decidedAt)
  const note = boundedText(value.note, MAX_PROJECT_TASK_APPROVAL_NOTE_CHARS)
  if (!status || requestedAt === null || (value.decidedAt !== undefined && decidedAt === null)) return null
  return {
    status,
    requestedAt,
    ...(decidedAt !== undefined && decidedAt !== null ? { decidedAt } : {}),
    ...(note ? { note } : {}),
  }
}

function normalizeProjectTaskAttempt(raw: unknown): ProjectTaskAttempt | null {
  const value = recordValue(raw)
  if (!value) return null
  const id = boundedText(value.id, 128)
  const number = boundedInteger(value.number, 1, 1, MAX_PROJECT_TASK_MAX_ATTEMPTS)
  const startedAt = boundedTime(value.startedAt)
  const endedAt = value.endedAt === undefined ? undefined : boundedTime(value.endedAt)
  const outcome = value.outcome === 'running' || value.outcome === 'completed' ||
    value.outcome === 'failed' || value.outcome === 'timed-out' || value.outcome === 'cancelled'
    ? value.outcome
    : null
  const message = boundedText(value.message, MAX_PROJECT_TASK_ATTEMPT_MESSAGE_CHARS)
  if (!id || startedAt === null || !outcome || (value.endedAt !== undefined && endedAt === null)) return null
  return {
    id,
    number,
    startedAt,
    ...(endedAt !== undefined && endedAt !== null ? { endedAt } : {}),
    outcome,
    ...(message ? { message } : {}),
  }
}

export function normalizeProjectTaskLog(raw: unknown): ProjectTaskLog | null {
  const value = recordValue(raw)
  if (!value) return null
  const id = boundedText(value.id, 128)
  const timestamp = boundedTime(value.timestamp)
  const message = boundedText(value.message, MAX_PROJECT_TASK_LOG_MESSAGE_CHARS)
  const level = typeof value.level === 'string' && LOG_LEVELS.has(value.level as ProjectTaskLogLevel)
    ? value.level as ProjectTaskLogLevel
    : null
  if (!id || timestamp === null || !message || !level) return null
  return { id, timestamp, level, message }
}

export function normalizeProjectTaskArtifact(raw: unknown): ProjectTaskArtifact | null {
  const value = recordValue(raw)
  if (!value) return null
  const id = boundedText(value.id, 128)
  const locator = boundedText(value.locator, MAX_PROJECT_TASK_ARTIFACT_LOCATOR_CHARS)
  const label = boundedText(value.label, MAX_PROJECT_TASK_ARTIFACT_LABEL_CHARS) ?? locator?.slice(0, MAX_PROJECT_TASK_ARTIFACT_LABEL_CHARS)
  const createdAt = boundedTime(value.createdAt)
  const kind = typeof value.kind === 'string' && ARTIFACT_KINDS.has(value.kind as ProjectTaskArtifactKind)
    ? value.kind as ProjectTaskArtifactKind
    : null
  const description = boundedText(value.description, MAX_PROJECT_TASK_ARTIFACT_DESCRIPTION_CHARS)
  if (!id || !locator || !label || createdAt === null || !kind) return null
  return {
    id,
    kind,
    label,
    locator,
    ...(description ? { description } : {}),
    createdAt,
  }
}

export function normalizeProjectTask(raw: unknown): ProjectTask | null {
  const value = recordValue(raw)
  if (!value) return null
  const id = boundedText(value.id, 128)
  const objective = boundedText(value.objective, MAX_PROJECT_TASK_OBJECTIVE_CHARS)
  const status = typeof value.status === 'string' && TASK_STATUSES.has(value.status as ProjectTaskStatus)
    ? value.status as ProjectTaskStatus
    : 'planned'
  const constraints = boundedStringArray(
    value.constraints,
    MAX_PROJECT_TASK_CONSTRAINTS,
    MAX_PROJECT_TASK_CONSTRAINT_CHARS,
  )
  const dependsOn = boundedUniqueStringArray(
    value.dependsOn,
    MAX_PROJECT_TASK_DEPENDENCIES,
    MAX_PROJECT_TASK_DEPENDENCY_ID_CHARS,
  )
  const executionPolicy = value.executionPolicy === undefined
    ? null
    : normalizeProjectTaskExecutionPolicy(value.executionPolicy)
  const approval = value.approval === undefined ? null : normalizeProjectTaskApproval(value.approval)
  const attempts = Array.isArray(value.attempts)
    ? value.attempts
      .map(normalizeProjectTaskAttempt)
      .filter((entry): entry is ProjectTaskAttempt => entry !== null)
      .sort((left, right) => left.number - right.number || left.startedAt - right.startedAt || left.id.localeCompare(right.id))
      .slice(-MAX_PROJECT_TASK_ATTEMPTS)
    : []
  const validatedResult = boundedText(value.validatedResult, MAX_PROJECT_TASK_RESULT_CHARS)
  const validatedAt = value.validatedAt === undefined ? undefined : boundedTime(value.validatedAt)
  const createdAt = boundedTime(value.createdAt)
  const updatedAt = boundedTime(value.updatedAt)
  const logs = Array.isArray(value.logs)
    ? value.logs
      .map(normalizeProjectTaskLog)
      .filter((entry): entry is ProjectTaskLog => entry !== null)
      .sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id))
      .slice(-MAX_PROJECT_TASK_LOGS)
    : []
  const artifacts = Array.isArray(value.artifacts)
    ? value.artifacts
      .map(normalizeProjectTaskArtifact)
      .filter((entry): entry is ProjectTaskArtifact => entry !== null)
      .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id))
      .slice(-MAX_PROJECT_TASK_ARTIFACTS)
    : []
  const runId = boundedText(value.runId, 128)
  const ownerPanelId = boundedText(value.ownerPanelId, 128)
  const worktreeId = boundedText(value.worktreeId, 256)
  if (
    !id || !objective || createdAt === null || updatedAt === null ||
    (value.validatedAt !== undefined && validatedAt === null)
  ) return null
  return {
    id,
    objective,
    constraints,
    ...(dependsOn.length > 0 ? { dependsOn } : {}),
    ...(executionPolicy ? { executionPolicy } : {}),
    ...(approval ? { approval } : {}),
    ...(attempts.length > 0 ? { attempts } : {}),
    status,
    ...(validatedResult ? { validatedResult } : {}),
    ...(validatedAt !== undefined && validatedAt !== null ? { validatedAt } : {}),
    logs,
    artifacts,
    createdAt,
    updatedAt,
    ...(runId ? { runId } : {}),
    ...(ownerPanelId ? { ownerPanelId } : {}),
    ...(worktreeId ? { worktreeId } : {}),
  }
}

export function normalizeProjectTasksFile(raw: unknown): ProjectTasksFile {
  const value = recordValue(raw)
  const tasks = value?.version === PROJECT_TASKS_FILE_VERSION && Array.isArray(value.tasks)
    ? value.tasks
      .map(normalizeProjectTask)
      .filter((task): task is ProjectTask => task !== null)
      .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))
      .slice(0, MAX_PROJECT_TASKS)
    : []
  return { version: PROJECT_TASKS_FILE_VERSION, tasks }
}
