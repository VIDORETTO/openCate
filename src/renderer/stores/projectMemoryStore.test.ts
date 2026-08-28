import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectMemoryNote } from '../../shared/projectMemory'
import { useProjectMemoryStore } from './projectMemoryStore'

const ROOT = '/repo'
const load = vi.fn(async () => [] as ProjectMemoryNote[])
const save = vi.fn(async () => undefined)

const draft = {
  scope: { kind: 'project' as const },
  title: 'Decision',
  content: 'Keep the provider adapter neutral.',
  citations: [{ kind: 'manual' as const, label: 'Planning note', locator: 'planning-1' }],
}

beforeEach(() => {
  vi.clearAllMocks()
  load.mockResolvedValue([])
  ;(globalThis as unknown as { window: unknown }).window = {
    electronAPI: {
      projectMemoryLoad: load,
      projectMemorySave: save,
    },
  }
  useProjectMemoryStore.setState({ notesByRoot: {}, loadedRoots: {}, revisions: {} })
})

describe('project memory renderer store', () => {
  it('coalesces concurrent loads for one project', async () => {
    const note = useProjectMemoryStore.getState().saveNote(ROOT, null, draft)!
    useProjectMemoryStore.setState({ notesByRoot: {}, loadedRoots: {}, revisions: {} })
    load.mockResolvedValueOnce([note])

    await Promise.all([
      useProjectMemoryStore.getState().loadMemory(ROOT),
      useProjectMemoryStore.getState().loadMemory(ROOT),
    ])

    expect(load).toHaveBeenCalledTimes(1)
    expect(useProjectMemoryStore.getState().getNotes(ROOT)).toEqual([note])
  })

  it('creates, updates and deletes notes while persisting the complete list', () => {
    const created = useProjectMemoryStore.getState().saveNote(ROOT, null, draft)
    expect(created).not.toBeNull()
    expect(useProjectMemoryStore.getState().getNotes(ROOT)).toHaveLength(1)
    expect(save).toHaveBeenCalledWith(ROOT, [created])

    const updated = useProjectMemoryStore.getState().saveNote(ROOT, created!.id, {
      ...draft,
      title: 'Updated decision',
    })
    expect(updated?.id).toBe(created!.id)
    expect(useProjectMemoryStore.getState().getNotes(ROOT)[0].title).toBe('Updated decision')

    useProjectMemoryStore.getState().deleteNote(ROOT, created!.id)
    expect(useProjectMemoryStore.getState().getNotes(ROOT)).toEqual([])
    expect(save).toHaveBeenLastCalledWith(ROOT, [])
  })

  it('does not persist an invalid draft', () => {
    expect(useProjectMemoryStore.getState().saveNote(ROOT, null, { ...draft, citations: [] })).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('does not let a slow load overwrite a note saved while it was pending', async () => {
    let resolveLoad: ((notes: ProjectMemoryNote[]) => void) | undefined
    load.mockImplementationOnce(() => new Promise((resolve) => { resolveLoad = resolve }))
    const pending = useProjectMemoryStore.getState().loadMemory(ROOT)

    const created = useProjectMemoryStore.getState().saveNote(ROOT, null, draft)!
    resolveLoad!([])
    await pending

    expect(useProjectMemoryStore.getState().getNotes(ROOT)).toEqual([created])
  })
})
