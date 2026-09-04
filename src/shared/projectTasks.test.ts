import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROJECT_TASK_EXECUTION_POLICY,
  MAX_PROJECT_TASK_ARTIFACTS,
  MAX_PROJECT_TASK_CONSTRAINTS,
  MAX_PROJECT_TASK_DEPENDENCIES,
  MAX_PROJECT_TASK_LOGS,
  normalizeProjectTask,
  normalizeProjectTasksFile,
} from './projectTasks'

const baseTask = {
  id: 'task-1',
  objective: 'Implement the durable task contract',
  constraints: ['Do not copy terminal scrollback'],
  status: 'in-progress',
  logs: [{ id: 'log-1', timestamp: 1, level: 'info', message: 'Started' }],
  artifacts: [{ id: 'artifact-1', kind: 'file', label: 'contract', locator: 'src/shared/projectTasks.ts', createdAt: 2 }],
  createdAt: 1,
  updatedAt: 2,
}

describe('project task contract', () => {
  it('normalizes a complete task without introducing transcript fields', () => {
    expect(normalizeProjectTask(baseTask)).toEqual(baseTask)
    expect(normalizeProjectTask({ ...baseTask, scrollback: 'must not persist' })).not.toHaveProperty('scrollback')
  })

  it('bounds collections and drops malformed evidence entries', () => {
    const result = normalizeProjectTask({
      ...baseTask,
      constraints: Array.from({ length: MAX_PROJECT_TASK_CONSTRAINTS + 4 }, (_, i) => `constraint-${i}`),
      dependsOn: ['dependency-1', 'dependency-1', ...Array.from(
        { length: MAX_PROJECT_TASK_DEPENDENCIES + 4 },
        (_, i) => `dependency-${i + 2}`,
      )],
      logs: [
        ...Array.from({ length: MAX_PROJECT_TASK_LOGS + 4 }, (_, i) => ({
          id: `log-${i}`,
          timestamp: i,
          level: 'info',
          message: `event-${i}`,
        })),
        { id: 'bad', timestamp: -1, level: 'info', message: 'discard' },
      ],
      artifacts: [
        ...Array.from({ length: MAX_PROJECT_TASK_ARTIFACTS + 4 }, (_, i) => ({
          id: `artifact-${i}`,
          kind: 'file',
          label: `file-${i}`,
          locator: `src/file-${i}.ts`,
          createdAt: i,
        })),
        { id: 'bad', kind: 'file', label: 'missing locator', createdAt: 1 },
      ],
    })
    expect(result?.constraints).toHaveLength(MAX_PROJECT_TASK_CONSTRAINTS)
    expect(result?.dependsOn).toHaveLength(MAX_PROJECT_TASK_DEPENDENCIES)
    expect(result?.dependsOn?.[0]).toBe('dependency-1')
    expect(result?.logs).toHaveLength(MAX_PROJECT_TASK_LOGS)
    expect(result?.artifacts).toHaveLength(MAX_PROJECT_TASK_ARTIFACTS)
    expect(result?.logs.some((entry) => entry.id === 'bad')).toBe(false)
    expect(result?.artifacts.some((entry) => entry.id === 'bad')).toBe(false)
  })

  it('rejects invalid task identity and invalid explicit validation timestamps', () => {
    expect(normalizeProjectTask({ ...baseTask, id: '' })).toBeNull()
    expect(normalizeProjectTask({ ...baseTask, validatedResult: 'done', validatedAt: -1 })).toBeNull()
  })

  it('normalizes bounded execution policy, approval, and attempt history', () => {
    const result = normalizeProjectTask({
      ...baseTask,
      executionPolicy: {
        maxAttempts: 99,
        timeoutMs: 0,
        healthCheckIntervalMs: 99_999_999,
        retryDelayMs: -1,
        requireApproval: true,
      },
      approval: {
        status: 'approved',
        requestedAt: 10,
        decidedAt: 20,
        note: 'approved by reviewer',
      },
      attempts: [
        { id: 'attempt-2', number: 2, startedAt: 30, endedAt: 40, outcome: 'failed', message: 'retry' },
        { id: 'attempt-1', number: 1, startedAt: 10, outcome: 'completed' },
        { id: 'invalid', number: 1, startedAt: 10, outcome: 'unknown' },
      ],
    })

    expect(result?.executionPolicy).toEqual({
      ...DEFAULT_PROJECT_TASK_EXECUTION_POLICY,
      maxAttempts: 5,
      timeoutMs: 1,
      healthCheckIntervalMs: 600_000,
      retryDelayMs: 0,
      requireApproval: true,
    })
    expect(result?.approval).toEqual({
      status: 'approved',
      requestedAt: 10,
      decidedAt: 20,
      note: 'approved by reviewer',
    })
    expect(result?.attempts?.map((attempt) => attempt.id)).toEqual(['attempt-1', 'attempt-2'])
    expect(result?.attempts?.some((attempt) => attempt.id === 'invalid')).toBe(false)
  })

  it('degrades an unknown file version to an empty canonical file', () => {
    expect(normalizeProjectTasksFile({ version: 99, tasks: [baseTask] })).toEqual({ version: 1, tasks: [] })
    expect(normalizeProjectTasksFile({ version: 1, tasks: [baseTask, { id: 'bad' }] }).tasks).toEqual([baseTask])
  })
})
