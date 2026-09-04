import { describe, expect, it, vi } from 'vitest'
import type { ProjectTask } from './projectTasks'
import {
  DEFAULT_PROJECT_TASK_EXECUTION_POLICY,
} from './projectTasks'
import {
  evaluateProjectTaskExecution,
  executeProjectTask,
} from './projectTaskExecution'

function makeTask(overrides: Partial<ProjectTask> = {}): ProjectTask {
  return {
    id: 'task-1',
    objective: 'Run a bounded task',
    constraints: [],
    status: 'planned',
    logs: [],
    artifacts: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('project task execution policy', () => {
  it('gates readiness, approval, running attempts, and attempt limits', () => {
    const task = makeTask({
      executionPolicy: { ...DEFAULT_PROJECT_TASK_EXECUTION_POLICY, requireApproval: true },
    })

    expect(evaluateProjectTaskExecution(task, 'waiting')).toMatchObject({
      allowed: false,
      reason: 'dependencies-not-ready',
    })
    expect(evaluateProjectTaskExecution(task, 'ready')).toMatchObject({
      allowed: false,
      reason: 'approval-required',
    })
    expect(evaluateProjectTaskExecution({
      ...task,
      approval: { status: 'approved', requestedAt: 1, decidedAt: 2 },
    }, 'ready')).toMatchObject({ allowed: true, nextAttempt: 1 })
    expect(evaluateProjectTaskExecution({
      ...task,
      approval: { status: 'approved', requestedAt: 1, decidedAt: 2 },
      attempts: [{ id: 'attempt-1', number: 1, startedAt: 1, outcome: 'running' }],
    }, 'ready')).toMatchObject({
      allowed: false,
      reason: 'attempt-in-progress',
    })
    expect(evaluateProjectTaskExecution({
      ...task,
      executionPolicy: { ...task.executionPolicy!, maxAttempts: 1 },
      approval: { status: 'approved', requestedAt: 1, decidedAt: 2 },
      attempts: [{ id: 'attempt-1', number: 1, startedAt: 1, endedAt: 2, outcome: 'failed' }],
    }, 'ready')).toMatchObject({
      allowed: false,
      reason: 'attempt-limit',
      nextAttempt: 2,
    })
  })

  it('retries a failed attempt and returns the successful result', async () => {
    let calls = 0
    const result = await executeProjectTask({
      task: makeTask({
        executionPolicy: { ...DEFAULT_PROJECT_TASK_EXECUTION_POLICY, maxAttempts: 2, retryDelayMs: 0 },
      }),
      readiness: 'ready',
      run: vi.fn(async (_signal, attempt) => {
        calls += 1
        if (attempt === 1) throw new Error('transient failure')
        return 'done'
      }),
      sleep: async () => undefined,
      createAttemptId: (attempt) => `attempt-${attempt}`,
    })

    expect(calls).toBe(2)
    expect(result.outcome).toBe('completed')
    expect(result.value).toBe('done')
    expect(result.attempts.map((attempt) => attempt.outcome)).toEqual(['failed', 'completed'])
    expect(result.attempts.map((attempt) => attempt.id)).toEqual(['attempt-1', 'attempt-2'])
  })

  it('times out a hung attempt and does not exceed the policy bound', async () => {
    const result = await executeProjectTask({
      task: makeTask({
        executionPolicy: { ...DEFAULT_PROJECT_TASK_EXECUTION_POLICY, timeoutMs: 1 },
      }),
      readiness: 'ready',
      run: () => new Promise<string>(() => undefined),
    })

    expect(result.outcome).toBe('timed-out')
    expect(result.attempts).toHaveLength(1)
    expect(result.attempts[0].outcome).toBe('timed-out')
    expect(result.attempts[0].message).toBe('task-timeout')
  })

  it('fails before running when the initial health check is unhealthy', async () => {
    const run = vi.fn(async () => 'should not run')
    const result = await executeProjectTask({
      task: makeTask(),
      readiness: 'ready',
      healthCheck: async () => false,
      run,
    })

    expect(run).not.toHaveBeenCalled()
    expect(result.outcome).toBe('failed')
    expect(result.attempts[0].message).toBe('task-health-check-failed')
  })

  it('stops a running attempt when a periodic health check fails', async () => {
    let checks = 0
    const run = vi.fn(() => new Promise<string>(() => undefined))
    const result = await executeProjectTask({
      task: makeTask({
        executionPolicy: { ...DEFAULT_PROJECT_TASK_EXECUTION_POLICY, healthCheckIntervalMs: 1 },
      }),
      readiness: 'ready',
      healthCheck: async () => {
        checks += 1
        return checks === 1
      },
      run,
      setIntervalFn: (handler) => {
        handler()
        return setInterval(() => undefined, 1_000)
      },
    })

    expect(run).toHaveBeenCalledTimes(1)
    expect(checks).toBe(2)
    expect(result.outcome).toBe('failed')
    expect(result.attempts[0].message).toBe('task-health-check-failed')
  })

  it('honors cancellation without retrying', async () => {
    const controller = new AbortController()
    controller.abort()
    const run = vi.fn(async () => 'should not run')
    const result = await executeProjectTask({
      task: makeTask({
        executionPolicy: { ...DEFAULT_PROJECT_TASK_EXECUTION_POLICY, maxAttempts: 3 },
      }),
      readiness: 'ready',
      signal: controller.signal,
      run,
    })

    expect(run).not.toHaveBeenCalled()
    expect(result.outcome).toBe('cancelled')
    expect(result.attempts).toHaveLength(1)
    expect(result.attempts[0].outcome).toBe('cancelled')
  })
})
