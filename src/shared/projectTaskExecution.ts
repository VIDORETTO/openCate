// =============================================================================
// Project task execution — a small, side-effect-free policy seam for a future
// task runner. It owns gating, bounded retries, timeout and health monitoring;
// callers still provide the actual operation and decide whether it is safe to
// retry. No process is started here.
// =============================================================================

import {
  DEFAULT_PROJECT_TASK_EXECUTION_POLICY,
  type ProjectTask,
  type ProjectTaskAttempt,
  type ProjectTaskExecutionPolicy,
} from './projectTasks'
import type { ProjectTaskReadiness } from './projectTaskGraph'

export type ProjectTaskExecutionBlockReason =
  | 'task-not-planned'
  | 'dependencies-not-ready'
  | 'approval-required'
  | 'approval-rejected'
  | 'attempt-in-progress'
  | 'attempt-limit'

export interface ProjectTaskExecutionGate {
  allowed: boolean
  nextAttempt: number
  policy: ProjectTaskExecutionPolicy
  reason?: ProjectTaskExecutionBlockReason
}

export type ProjectTaskExecutionOutcome = 'completed' | 'failed' | 'timed-out' | 'cancelled' | 'blocked'

export interface ProjectTaskExecutionResult<T> {
  outcome: ProjectTaskExecutionOutcome
  attempts: ProjectTaskAttempt[]
  gate: ProjectTaskExecutionGate
  value?: T
  error?: string
}

// DOM and Node expose different timer-handle types. Keep the shared executor
// assignable when a renderer-only dependency pulls Node's ambient declarations
// into the project-wide typecheck.
type TimerHandle = number | ReturnType<typeof setTimeout>
type IntervalHandle = number | ReturnType<typeof setInterval>

export interface ProjectTaskExecutionOptions<T> {
  task: ProjectTask
  readiness: ProjectTaskReadiness
  run: (signal: AbortSignal, attempt: number) => Promise<T>
  healthCheck?: (signal: AbortSignal) => Promise<boolean>
  signal?: AbortSignal
  now?: () => number
  createAttemptId?: (attempt: number) => string
  /** Defaults to retrying failed and timed-out attempts. */
  shouldRetry?: (outcome: Exclude<ProjectTaskExecutionOutcome, 'blocked' | 'cancelled' | 'completed'>, attempt: number, error?: string) => boolean
  /** Injected by tests or a host that owns its own scheduler. */
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>
  setTimeoutFn?: (handler: () => void, timeoutMs: number) => TimerHandle
  clearTimeoutFn?: (handle: TimerHandle) => void
  setIntervalFn?: (handler: () => void, timeoutMs: number) => IntervalHandle
  clearIntervalFn?: (handle: IntervalHandle) => void
}

class TaskTimeoutError extends Error {
  constructor() {
    super('task-timeout')
    this.name = 'TaskTimeoutError'
  }
}

class TaskHealthError extends Error {
  constructor() {
    super('task-health-check-failed')
    this.name = 'TaskHealthError'
  }
}

class TaskCancelledError extends Error {
  constructor() {
    super('task-cancelled')
    this.name = 'TaskCancelledError'
  }
}

export function resolveProjectTaskExecutionPolicy(task: ProjectTask): ProjectTaskExecutionPolicy {
  return { ...DEFAULT_PROJECT_TASK_EXECUTION_POLICY, ...(task.executionPolicy ?? {}) }
}

export function evaluateProjectTaskExecution(
  task: ProjectTask,
  readiness: ProjectTaskReadiness,
): ProjectTaskExecutionGate {
  const policy = resolveProjectTaskExecutionPolicy(task)
  const highestAttempt = (task.attempts ?? []).reduce(
    (highest, attempt) => Math.max(highest, attempt.number),
    0,
  )
  const nextAttempt = highestAttempt + 1
  let reason: ProjectTaskExecutionBlockReason | undefined
  if (task.status !== 'planned') reason = 'task-not-planned'
  else if (readiness !== 'ready') reason = 'dependencies-not-ready'
  else if ((task.attempts ?? []).some((attempt) => attempt.outcome === 'running')) reason = 'attempt-in-progress'
  else if (nextAttempt > policy.maxAttempts) reason = 'attempt-limit'
  else if (policy.requireApproval && task.approval?.status === 'rejected') reason = 'approval-rejected'
  else if (policy.requireApproval && task.approval?.status !== 'approved') reason = 'approval-required'
  return {
    allowed: reason === undefined,
    nextAttempt,
    policy,
    ...(reason ? { reason } : {}),
  }
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 1_000)
}

function defaultSleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)
    const onAbort = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(new TaskCancelledError())
    }
    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function executeAttempt<T>(
  options: ProjectTaskExecutionOptions<T>,
  policy: ProjectTaskExecutionPolicy,
  attemptNumber: number,
): Promise<{ outcome: Exclude<ProjectTaskExecutionOutcome, 'blocked'>; value?: T; error?: string }> {
  const controller = new AbortController()
  const externalSignal = options.signal
  if (externalSignal?.aborted) return { outcome: 'cancelled', error: 'task-cancelled' }

  let settled = false
  let timedOut = false
  let healthFailed = false
  let healthCheckInFlight = false
  let timeoutHandle: TimerHandle | undefined
  let healthIntervalHandle: IntervalHandle | undefined
  let rejectHealthFailure: ((error: Error) => void) | undefined
  let removeExternalAbort = (): void => {}

  const healthFailure = new Promise<never>((_, reject) => {
    rejectHealthFailure = reject
  })
  const timeoutFailure = new Promise<never>((_, reject) => {
    timeoutHandle = (options.setTimeoutFn ?? setTimeout)(() => {
      if (settled) return
      timedOut = true
      controller.abort()
      reject(new TaskTimeoutError())
    }, policy.timeoutMs)
  })
  const externalAbort = externalSignal
    ? new Promise<never>((_, reject) => {
        const onAbort = (): void => {
          controller.abort()
          reject(new TaskCancelledError())
        }
        externalSignal.addEventListener('abort', onAbort, { once: true })
        removeExternalAbort = () => externalSignal.removeEventListener('abort', onAbort)
      })
    : new Promise<never>(() => {})

  const failHealth = (error: Error = new TaskHealthError()): void => {
    if (settled || healthFailed) return
    healthFailed = true
    controller.abort()
    rejectHealthFailure?.(error)
  }

  const operation = (async (): Promise<T> => {
    if (options.healthCheck) {
      let healthy = false
      try {
        healthy = await options.healthCheck(controller.signal)
      } catch (error) {
        failHealth(error instanceof Error ? error : new TaskHealthError())
        throw error
      }
      if (!healthy) {
        failHealth()
        throw new TaskHealthError()
      }
      healthIntervalHandle = (options.setIntervalFn ?? setInterval)(() => {
        if (settled || healthCheckInFlight || controller.signal.aborted) return
        healthCheckInFlight = true
        void options.healthCheck!(controller.signal)
          .then((ok) => {
            healthCheckInFlight = false
            if (!ok) failHealth()
          })
          .catch((error: unknown) => {
            healthCheckInFlight = false
            failHealth(error instanceof Error ? error : new TaskHealthError())
          })
      }, policy.healthCheckIntervalMs)
    }
    return options.run(controller.signal, attemptNumber)
  })()
  // A timed-out operation may finish later after observing its abort signal;
  // the race below already owns a rejection handler, so it cannot become an
  // unhandled rejection in the host runtime.
  operation.catch(() => undefined)

  try {
    const value = await Promise.race([operation, timeoutFailure, healthFailure, externalAbort])
    return { outcome: 'completed', value }
  } catch (error) {
    if (error instanceof TaskTimeoutError || timedOut) {
      return { outcome: 'timed-out', error: 'task-timeout' }
    }
    if (error instanceof TaskCancelledError || externalSignal?.aborted) {
      return { outcome: 'cancelled', error: 'task-cancelled' }
    }
    if (error instanceof TaskHealthError || healthFailed) {
      return { outcome: 'failed', error: 'task-health-check-failed' }
    }
    return { outcome: 'failed', error: errorMessage(error) }
  } finally {
    settled = true
    if (timeoutHandle !== undefined) (options.clearTimeoutFn ?? clearTimeout)(timeoutHandle)
    if (healthIntervalHandle !== undefined) (options.clearIntervalFn ?? clearInterval)(healthIntervalHandle)
    removeExternalAbort()
    controller.abort()
  }
}

/** Run an approved, ready task with bounded attempts and liveness checks. */
export async function executeProjectTask<T>(
  options: ProjectTaskExecutionOptions<T>,
): Promise<ProjectTaskExecutionResult<T>> {
  const gate = evaluateProjectTaskExecution(options.task, options.readiness)
  if (!gate.allowed) {
    return { outcome: 'blocked', attempts: [], gate, error: gate.reason }
  }

  const now = options.now ?? Date.now
  const attempts: ProjectTaskAttempt[] = []
  const createAttemptId = options.createAttemptId ?? ((attempt: number) => `${options.task.id}:attempt:${attempt}`)
  const shouldRetry = options.shouldRetry ?? (() => true)
  const sleep = options.sleep ?? defaultSleep
  for (let attemptNumber = gate.nextAttempt; attemptNumber <= gate.policy.maxAttempts; attemptNumber += 1) {
    const startedAt = now()
    const attempt: ProjectTaskAttempt = {
      id: createAttemptId(attemptNumber),
      number: attemptNumber,
      startedAt,
      outcome: 'running',
    }
    const result = await executeAttempt(options, gate.policy, attemptNumber)
    const endedAt = now()
    const completedAttempt: ProjectTaskAttempt = {
      ...attempt,
      endedAt,
      outcome: result.outcome,
      ...(result.error ? { message: result.error } : {}),
    }
    attempts.push(completedAttempt)
    if (result.outcome === 'completed') {
      return { outcome: 'completed', attempts, gate, value: result.value }
    }
    if (result.outcome === 'cancelled') {
      return { outcome: 'cancelled', attempts, gate, error: result.error }
    }
    const retryable = attemptNumber < gate.policy.maxAttempts && shouldRetry(result.outcome, attemptNumber, result.error)
    if (!retryable) {
      return { outcome: result.outcome, attempts, gate, error: result.error }
    }
    try {
      await sleep(gate.policy.retryDelayMs, options.signal)
    } catch (error) {
      return { outcome: 'cancelled', attempts, gate, error: errorMessage(error) }
    }
  }
  return { outcome: 'failed', attempts, gate, error: 'task-attempt-limit' }
}
