// =============================================================================
// attentionQueue — the sidebar's "Needs attention" section must derive from the
// same status facts that drive terminal indicators, and clicking an entry must
// reveal its panel.
// =============================================================================

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../lib/logger', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
vi.mock('../lib/terminal/terminalRegistry', () => ({
  terminalRegistry: {
    entries: () => [],
    ptyIdForPanel: (panelId: string) => panelId,
    panelIdForPty: (ptyId: string) => ptyId,
    workspaceIdForPty: () => WS,
    dispose: vi.fn(),
    release: vi.fn(),
    disposeWorkspace: vi.fn(),
    has: () => false,
    getEntry: () => undefined,
  },
}))

import { WorkspaceTab } from './WorkspaceTab'
import { useAppStore } from '../stores/appStore'
import { useStatusStore } from '../stores/statusStore'
import type { PanelState, WorkspaceState } from '../../shared/types'

const WS = 'ws-attention'

function panel(id: string, extra: Partial<PanelState> = {}): PanelState {
  return { id, type: 'terminal', title: id, isDirty: false, ...extra } as PanelState
}

function workspace(panels: PanelState[]): WorkspaceState {
  return {
    id: WS,
    name: 'Attention',
    color: '',
    rootPath: '/tmp/attention',
    rootPathError: null,
    isRootPathPending: false,
    worktrees: [],
    panels: Object.fromEntries(panels.map((p) => [p.id, p])),
  } as unknown as WorkspaceState
}

function terminalStatus(state: 'waitingForInput' | 'finished') {
  return {
    activity: { type: 'idle' } as const,
    agentState: state,
    agentName: null,
    agentPresent: true,
    listeningPorts: [],
    cwd: '',
  }
}

describe('sidebar attention queue', () => {
  let host: HTMLDivElement
  let root: Root
  const initialState = useAppStore.getState()

  beforeEach(() => {
    useStatusStore.setState({ workspaces: {} })
    ;(window as unknown as { electronAPI?: unknown }).electronAPI = {
      skillsListInstalled: vi.fn().mockResolvedValue([]),
    }
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => { root.unmount() })
    host.remove()
    useAppStore.setState(initialState, true)
  })

  it('lists only waiting or finished agents with their reason', async () => {
    useStatusStore.setState({
      workspaces: {
        [WS]: { terminals: {
          running: { ...terminalStatus('finished'), agentState: 'running' },
          waiting: terminalStatus('waitingForInput'),
          done: terminalStatus('finished'),
        } },
      },
    })
    const ws = workspace([panel('canvas', { type: 'canvas' }), panel('running'), panel('waiting'), panel('done')])
    useAppStore.setState({ workspaces: [ws], selectedWorkspaceId: WS } as never)

    await act(async () => {
      root.render(<WorkspaceTab workspace={ws} isSelected isExpanded onToggleExpand={() => {}} onClick={() => {}} />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(host.textContent).toContain('Needs attention')
    expect(host.textContent).toContain('Input')
    expect(host.textContent).toContain('Done')
    expect(host.textContent).toContain('1 running · 1 input · 1 done')
    const labels = Array.from(host.querySelectorAll('[title$="waiting for input"], [title$="finished"]'))
      .map((element) => element.getAttribute('title'))
    expect(labels).toHaveLength(2)
    expect(labels).toEqual([
      'done — finished',
      'waiting — waiting for input',
    ])
  })
})
