import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

vi.mock('../lib/terminal/terminalRegistry', () => ({
  terminalRegistry: {
    entries: () => [],
    panelIdForPty: () => null,
    getEntry: () => undefined,
    getFailure: () => null,
  },
}))
vi.mock('../lib/logger', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
vi.mock('../lib/workspace/useWorkspacePanelTree', async () => {
  const actual = await vi.importActual<typeof import('../lib/workspace/useWorkspacePanelTree')>(
    '../lib/workspace/useWorkspacePanelTree',
  )
  return actual
})
vi.mock('./WorkspaceSkillsTree', () => ({ WorkspaceSkillsTree: () => null }))

import { WorkspaceTab } from './WorkspaceTab'
import type { WorkspaceState } from '../../shared/types'
import { useAppStore } from '../stores/appStore'

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  const g = globalThis as unknown as { window?: { electronAPI?: unknown } }
  g.window = g.window ?? {}
  g.window.electronAPI = {
    workspaceCreate: vi.fn(async () => ({ ok: true, workspace: {} })),
    workspaceUpdate: vi.fn(async () => ({ ok: true, workspace: {} })),
    workspaceRemove: vi.fn(async () => ({ ok: true })),
    recentProjectsAdd: vi.fn(),
    recentProjectsRemove: vi.fn(async () => undefined),
    agentDispose: vi.fn(async () => undefined),
    projectChatsLoad: vi.fn(async () => []),
    projectChatsSave: vi.fn(async () => undefined),
    focusWindowPanel: vi.fn(),
  }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => { root.unmount() })
  host.remove()
})

describe('WorkspaceTab mission tree', () => {
  it('renders supervisors, worker status and metrics', () => {
    const wsId = useAppStore.getState().addWorkspace('Project', '/tmp/project', 'workspace-tree')
    const supervisorId = useAppStore.getState().createTerminal(wsId)
    const workerId = useAppStore.getState().createTerminal(wsId)
    useAppStore.getState().renamePanelByUser(wsId, supervisorId, 'Orchestrator')
    useAppStore.getState().setPanelCodingAgentRun(wsId, workerId, {
      id: 'run-1',
      agentId: 'codex',
      panelId: workerId,
      title: 'Integration tests',
      ownerPanelId: supervisorId,
      prompt: 'Run tests',
      createdAt: Date.now(),
    })
    const workspace = useAppStore.getState().workspaces.find((ws) => ws.id === wsId)!
    act(() => {
      root.render(
        <WorkspaceTab
          workspace={workspace}
          isSelected
          isExpanded
          onToggleExpand={() => {}}
          onClick={() => {}}
        />,
      )
    })
    expect(host.textContent).toContain('Missions')
    expect(host.textContent).toContain('Orchestrator')
    expect(host.textContent).toContain('Integration tests')
  })
})
