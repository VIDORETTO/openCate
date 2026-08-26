import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import type { AgentContextItem } from '../../../shared/agentContextBus'
import { useAgentContextBus } from './useAgentContextBus'

const h = vi.hoisted(() => ({
  getEntry: vi.fn(),
}))

vi.mock('../terminal/registryState', () => ({ getEntry: h.getEntry }))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Bus = ReturnType<typeof useAgentContextBus>

let host: HTMLDivElement
let root: Root
let observed: Bus | null = null

function Harness() {
  observed = useAgentContextBus()
  return null
}

beforeEach(() => {
  observed = null
  h.getEntry.mockReset()
  ;(window as unknown as { electronAPI?: unknown }).electronAPI = {}
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('useAgentContextBus explicit captures', () => {
  it('captures a live terminal selection once and clears the xterm selection', () => {
    const clearSelection = vi.fn()
    h.getEntry.mockReturnValue({
      terminal: {
        hasSelection: () => true,
        getSelection: () => '  failing assertion  ',
        clearSelection,
      },
    })

    act(() => root.render(<Harness />))
    let staged = false
    act(() => {
      staged = observed!.stageTerminalSelection('panel-a', 'API worker — selected')
    })

    expect(staged).toBe(true)
    expect(clearSelection).toHaveBeenCalledTimes(1)
    expect(observed!.items).toHaveLength(1)
    const item = observed!.items[0] as AgentContextItem
    expect(item.kind).toBe('terminal-selection')
    expect(item.content).toBe('failing assertion')
    expect(observed!.prompt).toContain('failing assertion')
  })

  it('reports actionable errors when the terminal or selection is unavailable', () => {
    h.getEntry.mockReturnValue(undefined)

    act(() => root.render(<Harness />))
    act(() => {
      observed!.stageTerminalSelection('missing', 'Missing terminal')
    })
    expect(observed!.error).toBe('terminal-not-ready')

    h.getEntry.mockReturnValue({
      terminal: { hasSelection: () => false, getSelection: () => '', clearSelection: vi.fn() },
    })
    act(() => {
      observed!.stageTerminalSelection('panel-a', 'No selection')
    })
    expect(observed!.error).toBe('no-terminal-selection')
    expect(observed!.items).toHaveLength(0)
  })

  it('reads a workspace file through the scoped filesystem bridge', async () => {
    const fsReadFile = vi.fn().mockResolvedValue('export const ready = true')
    ;(window as unknown as { electronAPI: { fsReadFile: typeof fsReadFile } }).electronAPI = { fsReadFile }

    act(() => root.render(<Harness />))
    await act(async () => {
      await observed!.stageWorkspaceFile('ws', '/repo/src/ready.ts', 'src/ready.ts')
    })

    expect(fsReadFile).toHaveBeenCalledWith('/repo/src/ready.ts', 'ws')
    expect(observed!.items).toEqual([
      expect.objectContaining({
        kind: 'file',
        title: 'ready.ts',
        source: 'src/ready.ts',
        content: 'export const ready = true',
      }),
    ])
  })

  it('stages a calculated worktree diff with its base branch provenance', async () => {
    act(() => root.render(<Harness />))
    await act(async () => {
      await observed!.stageWorktreeDiff('/repo/.cate/worktrees/feature', 'main', 'diff --git a/app.ts b/app.ts')
    })

    expect(observed!.items).toEqual([
      expect.objectContaining({
        kind: 'diff',
        title: 'Diff feature',
        source: 'main..working',
        content: 'diff --git a/app.ts b/app.ts',
      }),
    ])
  })
})
