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
  createProjectMemoryNote,
  deleteProjectMemoryNote,
  loadMemory,
  saveMemory,
  updateProjectMemoryNote,
} from './projectMemoryStore'
import type { ProjectMemoryNote } from '../shared/projectMemory'

let root: string

const note: ProjectMemoryNote = {
  id: 'note-1',
  scope: { kind: 'project' },
  title: 'Decision',
  content: 'Use one shared lifecycle vocabulary.',
  citations: [{ kind: 'file', label: 'agent.ts', locator: 'src/agent.ts', lineStart: 4, lineEnd: 9 }],
  createdAt: 1,
  updatedAt: 2,
}

const legacyMemoryJson = `{
  "version": 1,
  "notes": [
    {
      "id": "legacy-note",
      "scope": { "kind": "project" },
      "title": "Legacy decision",
      "content": "Keep the workspace stable.",
      "citations": [{ "kind": "manual", "label": "decision", "locator": "README.md" }],
      "createdAt": 1,
      "updatedAt": 1
    }
  ]
}
`

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'cate-memory-'))
  hostFiles.clear()
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('projectMemoryStore', () => {
  it('loads a literal version-1 file without rewriting optional fields', async () => {
    const file = path.join(root, '.cate', 'memory.json')
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, legacyMemoryJson, 'utf8')

    await expect(loadMemory(root)).resolves.toEqual([{
      id: 'legacy-note',
      scope: { kind: 'project' },
      title: 'Legacy decision',
      content: 'Keep the workspace stable.',
      citations: [{ kind: 'manual', label: 'decision', locator: 'README.md' }],
      createdAt: 1,
      updatedAt: 1,
    }])
    await expect(fs.readFile(file, 'utf8')).resolves.toBe(legacyMemoryJson)
  })

  it('round-trips project and worktree notes locally', async () => {
    const worktreeNote: ProjectMemoryNote = {
      ...note,
      id: 'note-2',
      scope: { kind: 'worktree', path: path.join(root, 'feature') },
    }
    await saveMemory(root, [note, worktreeNote])
    expect(await loadMemory(root)).toEqual([note, worktreeNote])
  })

  it('drops invalid notes while retaining valid hand-edited data', async () => {
    await fs.mkdir(path.join(root, '.cate'), { recursive: true })
    await fs.writeFile(
      path.join(root, '.cate', 'memory.json'),
      JSON.stringify({ version: 1, notes: [note, { ...note, id: 'invalid', citations: [] }] }),
      'utf-8',
    )
    expect(await loadMemory(root)).toEqual([note])
  })

  it('quarantines unparseable local memory', async () => {
    await fs.mkdir(path.join(root, '.cate'), { recursive: true })
    await fs.writeFile(path.join(root, '.cate', 'memory.json'), '{ not json', 'utf-8')
    expect(await loadMemory(root)).toEqual([])
    const files = await fs.readdir(path.join(root, '.cate'))
    expect(files.some((file) => file.startsWith('memory.json.corrupt-'))).toBe(true)
  })

  it('serializes public API mutations and keeps note identity on update', async () => {
    const created = await createProjectMemoryNote(root, {
      scope: { kind: 'project' },
      title: 'API decision',
      content: 'Expose curated context only.',
      citations: [{ kind: 'manual', label: 'test', locator: 'test' }],
    })
    expect(created).toMatchObject({ title: 'API decision', scope: { kind: 'project' } })
    const updated = await updateProjectMemoryNote(root, created!.id, { title: 'Updated decision' })
    expect(updated).toMatchObject({
      id: created!.id,
      createdAt: created!.createdAt,
      title: 'Updated decision',
    })
    await expect(loadMemory(root)).resolves.toEqual([updated])
    await expect(deleteProjectMemoryNote(root, created!.id)).resolves.toBe(true)
    await expect(deleteProjectMemoryNote(root, created!.id)).resolves.toBe(false)
    await expect(loadMemory(root)).resolves.toEqual([])
  })
})

describe('projectMemoryStore — remote roots', () => {
  const remoteRoot = 'cate-runtime://srv_abc/home/dev/project'
  const file = '/home/dev/project/.cate/memory.json'
  const gitignore = '/home/dev/project/.cate/.gitignore'

  it('round-trips notes through the runtime and preserves a custom gitignore', async () => {
    await saveMemory(remoteRoot, [note])
    expect(hostFiles.has(file)).toBe(true)
    expect(hostFiles.has(gitignore)).toBe(true)
    expect(await loadMemory(remoteRoot)).toEqual([note])

    hostFiles.set(gitignore, 'custom')
    await saveMemory(remoteRoot, [note])
    expect(hostFiles.get(gitignore)).toBe('custom')
  })

  it('returns empty for absent or corrupt remote memory', async () => {
    expect(await loadMemory(remoteRoot)).toEqual([])
    hostFiles.set(file, '{ not json')
    expect(await loadMemory(remoteRoot)).toEqual([])
  })
})
