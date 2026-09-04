import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import { tmpdir } from 'os'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('./logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('./cateGitignore', () => ({
  ensureCateGitignore: vi.fn(async () => {}),
  CATE_GITIGNORE_CONTENT: '*\n!.gitignore\n!workspace.json\n',
}))

const hostFiles = vi.hoisted(() => new Map<string, string>())
vi.mock('./runtime/runtimeManager', () => ({
  runtimes: {
    resolve: () => ({
      file: {
        async readFile(filePath: string): Promise<string> {
          const value = hostFiles.get(filePath)
          if (value === undefined) throw new Error(`ENOENT: ${filePath}`)
          return value
        },
        async writeFile(filePath: string, content: string): Promise<void> {
          hostFiles.set(filePath, content)
        },
        async stat(filePath: string): Promise<{ isDirectory: boolean; isFile: boolean }> {
          if (!hostFiles.has(filePath)) throw new Error(`ENOENT: ${filePath}`)
          return { isDirectory: false, isFile: true }
        },
      },
    }),
  },
}))

import {
  createProjectTask,
  deleteProjectTask,
  loadTasks,
  saveTasks,
  updateProjectTask,
} from './projectTaskStore'
import type { ProjectTask } from '../shared/projectTasks'

let root: string

const task: ProjectTask = {
  id: 'task-1',
  objective: 'Keep the task contract durable',
  constraints: ['Use atomic writes'],
  status: 'completed',
  validatedResult: 'Round-trip verified',
  validatedAt: 3,
  logs: [{ id: 'log-1', timestamp: 1, level: 'success', message: 'Verified' }],
  artifacts: [{ id: 'artifact-1', kind: 'test-report', label: 'focused test', locator: 'projectTaskStore.test.ts', createdAt: 2 }],
  createdAt: 1,
  updatedAt: 3,
}

const legacyTasksJson = `{
  "version": 1,
  "tasks": [
    {
      "id": "legacy-task",
      "objective": "Keep the task contract durable",
      "constraints": [],
      "status": "planned",
      "logs": [],
      "artifacts": [],
      "createdAt": 1,
      "updatedAt": 1
    }
  ]
}
`

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'cate-tasks-'))
  hostFiles.clear()
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('projectTaskStore', () => {
  it('loads a literal version-1 file without rewriting optional fields', async () => {
    const file = path.join(root, '.cate', 'tasks.json')
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, legacyTasksJson, 'utf8')

    await expect(loadTasks(root)).resolves.toEqual([{
      id: 'legacy-task',
      objective: 'Keep the task contract durable',
      constraints: [],
      status: 'planned',
      logs: [],
      artifacts: [],
      createdAt: 1,
      updatedAt: 1,
    }])
    await expect(fs.readFile(file, 'utf8')).resolves.toBe(legacyTasksJson)
  })

  it('round-trips task contracts locally', async () => {
    await saveTasks(root, [task])
    expect(await loadTasks(root)).toEqual([task])
    const raw = await fs.readFile(path.join(root, '.cate', 'tasks.json'), 'utf8')
    expect(JSON.parse(raw)).toEqual({ version: 1, tasks: [task] })
  })

  it('retains valid hand-edited tasks and quarantines malformed JSON', async () => {
    await fs.mkdir(path.join(root, '.cate'), { recursive: true })
    await fs.writeFile(
      path.join(root, '.cate', 'tasks.json'),
      JSON.stringify({ version: 1, tasks: [task, { ...task, id: '' }] }),
      'utf8',
    )
    expect(await loadTasks(root)).toEqual([task])

    await fs.writeFile(path.join(root, '.cate', 'tasks.json'), '{ not json', 'utf8')
    expect(await loadTasks(root)).toEqual([])
    const files = await fs.readdir(path.join(root, '.cate'))
    expect(files.some((file) => file.startsWith('tasks.json.corrupt-'))).toBe(true)
  })

  it('serializes public API mutations and preserves task identity on update', async () => {
    const created = await createProjectTask(root, { objective: 'Ship the task API' })
    expect(created).toMatchObject({
      objective: 'Ship the task API',
      status: 'planned',
      constraints: [],
      logs: [],
      artifacts: [],
    })
    const updated = await updateProjectTask(root, created!.id, {
      status: 'completed',
      validatedResult: 'Focused test passed',
    })
    expect(updated).toMatchObject({
      id: created!.id,
      createdAt: created!.createdAt,
      status: 'completed',
      validatedResult: 'Focused test passed',
    })
    expect(await loadTasks(root)).toEqual([updated])
    await expect(deleteProjectTask(root, created!.id)).resolves.toBe(true)
    await expect(deleteProjectTask(root, created!.id)).resolves.toBe(false)
    await expect(loadTasks(root)).resolves.toEqual([])
  })
})

describe('projectTaskStore — remote roots', () => {
  const remoteRoot = 'cate-runtime://srv_abc/home/dev/project'
  const file = '/home/dev/project/.cate/tasks.json'
  const gitignore = '/home/dev/project/.cate/.gitignore'

  it('round-trips through the runtime and does not overwrite a custom gitignore', async () => {
    await saveTasks(remoteRoot, [task])
    expect(JSON.parse(hostFiles.get(file)!)).toEqual({ version: 1, tasks: [task] })
    expect(hostFiles.has(gitignore)).toBe(true)
    expect(await loadTasks(remoteRoot)).toEqual([task])

    hostFiles.set(gitignore, 'custom')
    await saveTasks(remoteRoot, [task])
    expect(hostFiles.get(gitignore)).toBe('custom')
  })
})
