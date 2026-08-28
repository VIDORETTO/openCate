import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import type { WorktreeMeta } from '../../shared/types'
import type { ProjectMemoryNote } from '../../shared/projectMemory'
import { useProjectMemoryStore } from '../stores/projectMemoryStore'
import { WorkspaceMemorySection } from './WorkspaceMemorySection'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ROOT = '/repo'
const load = vi.fn(async () => [] as ProjectMemoryNote[])
const save = vi.fn(async () => undefined)
const worktrees: WorktreeMeta[] = [{ id: 'wt-1', path: '/repo/feature', color: '#5e9eff', label: 'feature' }]

const note: ProjectMemoryNote = {
  id: 'memory-1',
  scope: { kind: 'worktree', path: '/repo/feature' },
  title: 'Feature constraint',
  content: 'Keep the adapter provider-neutral.',
  citations: [{ kind: 'file', label: 'agent.ts', locator: 'src/agent.ts', lineStart: 4, lineEnd: 9 }],
  createdAt: 1,
  updatedAt: 2,
}

describe('WorkspaceMemorySection', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    load.mockResolvedValue([note])
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      projectMemoryLoad: load,
      projectMemorySave: save,
    }
    useProjectMemoryStore.setState({ notesByRoot: {}, loadedRoots: {}, revisions: {} })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => { root.unmount() })
    host.remove()
  })

  it('loads notes, filters them by selected worktree and shows their citation', async () => {
    await act(async () => {
      root.render(<WorkspaceMemorySection rootPath={ROOT} worktrees={worktrees} />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(load).toHaveBeenCalledWith(ROOT)
    expect(host.textContent).toContain('Memory')
    expect(host.textContent).toContain('No notes for this scope')

    const scope = host.querySelector('select') as HTMLSelectElement
    scope.value = 'worktree:/repo/feature'
    await act(async () => { scope.dispatchEvent(new Event('change', { bubbles: true })) })

    expect(host.textContent).toContain('Feature constraint')
    expect(host.textContent).toContain('src/agent.ts:4-9')
  })

  it('opens the editor for a note and keeps the citation locator visible', async () => {
    await act(async () => {
      root.render(<WorkspaceMemorySection rootPath={ROOT} worktrees={worktrees} />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const scope = host.querySelector('select') as HTMLSelectElement
    scope.value = 'worktree:/repo/feature'
    await act(async () => { scope.dispatchEvent(new Event('change', { bubbles: true })) })

    const noteButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Feature constraint'))
    expect(noteButton).toBeTruthy()
    await act(async () => {
      noteButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(document.body.textContent).toContain('Edit memory note')
    expect((document.body.querySelector('input[placeholder="src/file.ts"]') as HTMLInputElement).value).toBe('src/agent.ts')
  })
})
