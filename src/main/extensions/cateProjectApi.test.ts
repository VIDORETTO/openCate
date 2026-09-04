import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  tasks: [] as Array<Record<string, unknown>>,
  notes: [] as Array<Record<string, unknown>>,
}))

vi.mock('../workspaceManager', () => ({
  getWorkspaceInfo: () => ({ rootPath: '/workspace/project' }),
}))
vi.mock('../../shared/runtimeLocator', () => ({
  parseLocator: (rootPath: string) => ({ runtimeId: 'local', path: rootPath }),
}))
vi.mock('../projectTaskStore', () => ({
  loadTasks: vi.fn(async () => state.tasks),
  createProjectTask: vi.fn(async (_root: string, draft: Record<string, unknown>) => {
    const task = {
      id: 'task-new',
      objective: String(draft.objective),
      constraints: [],
      status: 'planned',
      logs: [],
      artifacts: [],
      createdAt: 1,
      updatedAt: 1,
    }
    state.tasks.push(task)
    return task
  }),
  updateProjectTask: vi.fn(async (_root: string, taskId: string, patch: Record<string, unknown>) => {
    const task = state.tasks.find((candidate) => candidate.id === taskId)
    if (!task) return null
    Object.assign(task, patch)
    return task
  }),
  deleteProjectTask: vi.fn(async (_root: string, taskId: string) => {
    const before = state.tasks.length
    state.tasks = state.tasks.filter((task) => task.id !== taskId)
    return state.tasks.length !== before
  }),
}))
vi.mock('../projectMemoryStore', () => ({
  loadMemory: vi.fn(async () => state.notes),
  createProjectMemoryNote: vi.fn(async (_root: string, draft: Record<string, unknown>) => {
    const note = {
      id: 'note-new',
      ...draft,
      createdAt: 1,
      updatedAt: 1,
    }
    state.notes.push(note)
    return note
  }),
  updateProjectMemoryNote: vi.fn(async (_root: string, noteId: string, patch: Record<string, unknown>) => {
    const note = state.notes.find((candidate) => candidate.id === noteId)
    if (!note) return null
    Object.assign(note, patch)
    return note
  }),
  deleteProjectMemoryNote: vi.fn(async (_root: string, noteId: string) => {
    const before = state.notes.length
    state.notes = state.notes.filter((note) => note.id !== noteId)
    return state.notes.length !== before
  }),
}))

import { dispatchCateProjectInvoke } from './cateProjectApi'

beforeEach(() => {
  state.tasks = [{
    id: 'task-1',
    objective: 'Validate output',
    constraints: [],
    status: 'completed',
    validatedResult: 'passed',
    validatedAt: 2,
    logs: [],
    artifacts: [{ id: 'artifact-1', kind: 'test-report', label: 'test', locator: 'test', createdAt: 2 }],
    createdAt: 1,
    updatedAt: 2,
  }]
  state.notes = [{
    id: 'note-1',
    scope: { kind: 'project' },
    title: 'Decision',
    content: 'Keep context curated.',
    citations: [{ kind: 'manual', label: 'test', locator: 'test' }],
    createdAt: 1,
    updatedAt: 1,
  }]
})

describe('first-party project API', () => {
  it('returns a workspace-scoped project and consistent list envelopes', async () => {
    await expect(dispatchCateProjectInvoke('ws-1', 'cate.project.get', {})).resolves.toEqual({
      id: 'ws-1',
      rootPath: '/workspace/project',
      branch: null,
      worktree: null,
    })
    await expect(dispatchCateProjectInvoke('ws-1', 'cate.tasks.list', { status: 'completed' })).resolves.toEqual({
      items: [expect.objectContaining({ id: 'task-1' })],
      total: 1,
    })
    await expect(dispatchCateProjectInvoke('ws-1', 'cate.context.list', {})).resolves.toEqual({
      items: [expect.objectContaining({ id: 'note-1' })],
      total: 1,
    })
  })

  it('creates, updates, deletes and projects task results through the same surface', async () => {
    await expect(dispatchCateProjectInvoke('ws-1', 'cate.tasks.create', {
      draft: { objective: 'Ship API' },
    })).resolves.toMatchObject({ id: 'task-new' })
    await expect(dispatchCateProjectInvoke('ws-1', 'cate.tasks.update', {
      taskId: 'task-new',
      patch: { status: 'completed', validatedResult: 'done' },
    })).resolves.toMatchObject({ status: 'completed', validatedResult: 'done' })
    await expect(dispatchCateProjectInvoke('ws-1', 'cate.results.get', { resultId: 'task-new' })).resolves.toMatchObject({
      id: 'task-new',
      taskId: 'task-new',
      value: 'done',
    })
    await expect(dispatchCateProjectInvoke('ws-1', 'cate.tasks.delete', { taskId: 'task-new' })).resolves.toEqual({
      ok: true,
      taskId: 'task-new',
    })
    await expect(dispatchCateProjectInvoke('ws-1', 'cate.tasks.get', { taskId: 'task-new' })).resolves.toEqual({
      error: 'no-such-task',
      method: 'cate.tasks.get',
    })
  })

  it('filters context by its explicit durable scope and rejects malformed filters', async () => {
    await expect(dispatchCateProjectInvoke('ws-1', 'cate.context.list', {
      scope: { kind: 'worktree', path: '/other' },
    })).resolves.toEqual({ items: [], total: 0 })
    await expect(dispatchCateProjectInvoke('ws-1', 'cate.context.list', {
      scope: { kind: 'unknown' },
    })).resolves.toEqual({ error: 'bad-args', method: 'cate.context.list' })
  })
})
