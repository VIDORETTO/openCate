import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectTask } from '../../shared/projectTasks'
import { useProjectTaskStore } from './projectTaskStore'

const ROOT = '/repo'
const load = vi.fn(async () => [] as ProjectTask[])
const save = vi.fn(async () => undefined)

beforeEach(() => {
  vi.clearAllMocks()
  load.mockResolvedValue([])
  ;(globalThis as unknown as { window: unknown }).window = {
    electronAPI: {
      projectTasksLoad: load,
      projectTasksSave: save,
    },
  }
  useProjectTaskStore.setState({ tasksByRoot: {}, loadedRoots: {}, revisions: {} })
})

describe('project task renderer store', () => {
  it('creates, validates, logs and adds an artifact to one contract', () => {
    const created = useProjectTaskStore.getState().createTask(ROOT, {
      objective: 'Ship the feature',
      constraints: ['Keep the bridge typed'],
      dependsOn: ['prepare-release'],
      status: 'in-progress',
      logs: [],
      artifacts: [],
    })!
    expect(created).toBeTruthy()

    useProjectTaskStore.getState().appendTaskLog(ROOT, created.id, {
      timestamp: 2,
      level: 'info',
      message: 'Started',
    })
    useProjectTaskStore.getState().addTaskArtifact(ROOT, created.id, {
      kind: 'file',
      label: 'contract',
      locator: 'src/shared/projectTasks.ts',
      createdAt: 3,
    })
    const updated = useProjectTaskStore.getState().updateTask(ROOT, created.id, {
      status: 'completed',
      dependsOn: ['prepare-release'],
      validatedResult: 'Focused tests passed',
      validatedAt: 4,
    })!

    expect(updated).toMatchObject({
      status: 'completed',
      dependsOn: ['prepare-release'],
      validatedResult: 'Focused tests passed',
      logs: [{ message: 'Started' }],
      artifacts: [{ locator: 'src/shared/projectTasks.ts' }],
    })
    expect(save).toHaveBeenCalled()
    expect(save).toHaveBeenLastCalledWith(ROOT, expect.arrayContaining([expect.objectContaining({ id: created.id })]))
  })

  it('coalesces loads and does not overwrite a local mutation that wins the race', async () => {
    let resolveLoad: ((tasks: ProjectTask[]) => void) | undefined
    load.mockImplementationOnce(() => new Promise((resolve) => { resolveLoad = resolve }))
    const pending = useProjectTaskStore.getState().loadTasks(ROOT)
    const created = useProjectTaskStore.getState().createTask(ROOT, {
      objective: 'Local task',
      constraints: [],
      status: 'planned',
      logs: [],
      artifacts: [],
    })!
    resolveLoad!([])
    await pending
    expect(useProjectTaskStore.getState().getTask(ROOT, created.id)).toEqual(created)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('records approval decisions and closes the linked attempt with explicit run facts', () => {
    const created = useProjectTaskStore.getState().createTask(ROOT, {
      objective: 'Run an approved mission',
      constraints: [],
      executionPolicy: {
        maxAttempts: 2,
        timeoutMs: 1_000,
        healthCheckIntervalMs: 100,
        retryDelayMs: 0,
        requireApproval: true,
      },
      status: 'planned',
      logs: [],
      artifacts: [],
    })!

    const requested = useProjectTaskStore.getState().requestTaskApproval(ROOT, created.id, 'Review the command')!
    expect(requested.approval).toMatchObject({ status: 'pending', note: 'Review the command' })

    const approved = useProjectTaskStore.getState().decideTaskApproval(ROOT, created.id, 'approved', 'Approved')!
    expect(approved.approval).toMatchObject({ status: 'approved', note: 'Approved' })

    const running = useProjectTaskStore.getState().recordTaskAttempt(ROOT, created.id, {
      number: 1,
      startedAt: 10,
      outcome: 'running',
    })!
    const completed = useProjectTaskStore.getState().syncTaskWithRun(ROOT, {
      id: running.attempts![0].id,
      taskId: created.id,
      filesTouched: [{ path: 'src/feature.ts', lastObservedAt: 20 }],
    }, 'completed', {
      timestamp: 30,
      level: 'success',
      message: 'Mission completed.',
    })!

    expect(completed).toMatchObject({
      status: 'completed',
      approval: { status: 'approved' },
      attempts: [{ outcome: 'completed', endedAt: 30 }],
      artifacts: [{ kind: 'file', locator: 'src/feature.ts' }],
    })
  })
})
