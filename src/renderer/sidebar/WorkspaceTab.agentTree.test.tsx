import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

const codingAgentDriver = vi.hoisted(() => ({
  handleCodingAgentMethod: vi.fn(),
}))
vi.mock('../lib/agent/codingAgentDriver', async () => {
  const actual = await vi.importActual<typeof import('../lib/agent/codingAgentDriver')>(
    '../lib/agent/codingAgentDriver',
  )
  return { ...actual, handleCodingAgentMethod: codingAgentDriver.handleCodingAgentMethod }
})

import { WorkspaceTab } from './WorkspaceTab'
import type { CanvasSnapshot, DockStateSnapshot, WorkspaceState } from '../../shared/types'
import { createDockStore } from '../stores/dockStore'
import { releaseWorkspaceDockStore, registerWorkspaceDockStore } from '../lib/workspace/dockRegistry'
import { getOrCreateCanvasStoreForPanel, releaseCanvasStoreForPanel } from '../stores/canvasStore'
import { registerNodeDockStore, unregisterNodeDockStore } from '../panels/nodeDockRegistry'
import { useAppStore } from '../stores/appStore'

let host: HTMLDivElement
let root: Root

function coldDockSnapshot(canvasId: string, terminalIds: string[]): DockStateSnapshot {
  return {
    zones: {
      left: { position: 'left', visible: false, size: 240, layout: null },
      right: { position: 'right', visible: false, size: 280, layout: null },
      bottom: { position: 'bottom', visible: false, size: 220, layout: null },
      center: {
        position: 'center',
        visible: true,
        size: 0,
        layout: {
          type: 'tabs',
          id: 'mission-dock',
          panelIds: [canvasId, ...terminalIds],
          activeIndex: 0,
        },
      },
    },
  }
}

function coldCanvasSnapshot(canvasId: string, terminalIds: string[]): Record<string, CanvasSnapshot> {
  return {
    [canvasId]: {
      id: canvasId,
      canvasNodes: {
        'mission-node': {
          id: 'mission-node',
          origin: { x: 0, y: 0 },
          size: { width: 800, height: 500 },
          zOrder: 1,
          creationIndex: 0,
          dockLayout: {
            type: 'tabs',
            id: 'mission-node-dock',
            panelIds: [...terminalIds],
            activeIndex: 0,
          },
        },
      },
      zoomLevel: 1,
      viewportOffset: { x: 0, y: 0 },
    },
  }
}

/** Mount just enough live placement state for the sidebar partitioner: one
 *  workspace dock store, one canvas store, and the node's mini-dock. */
function mountMissionPlacement(workspaceId: string, canvasId: string, terminalIds: string[]): { workspaceId: string; canvasId: string; nodeId: string } {
  const dock = createDockStore(coldDockSnapshot(canvasId, terminalIds))
  registerWorkspaceDockStore(workspaceId, dock)
  const canvas = getOrCreateCanvasStoreForPanel(canvasId)
  canvas.getState().addNode(terminalIds[0], 'terminal', { x: 0, y: 0 }, { width: 800, height: 500 })
  const nodeId = Object.keys(canvas.getState().nodes)[0]!
  canvas.getState().setNodeDockLayout(nodeId, {
    type: 'tabs',
    id: 'mission-node-dock',
    panelIds: [...terminalIds],
    activeIndex: 0,
  })
  const nodeDock = createDockStore({
    zones: {
      ...coldDockSnapshot(canvasId, terminalIds).zones,
      center: {
        position: 'center',
        visible: true,
        size: 0,
        layout: {
          type: 'tabs',
          id: 'mission-live-node-dock',
          panelIds: [...terminalIds],
          activeIndex: 0,
        },
      },
    },
  })
  registerNodeDockStore(canvasId, nodeId, nodeDock)
  return { workspaceId, canvasId, nodeId }
}

function mountLiveMissionWorkspace(workspaceId: string, terminalIds: string[]): { canvasId: string; nodeId: string } {
  registerWorkspaceDockStore(workspaceId, createDockStore())
  const canvasId = useAppStore.getState().createCanvas(workspaceId)
  const canvas = getOrCreateCanvasStoreForPanel(canvasId)

  for (const [index, panelId] of terminalIds.entries()) {
    canvas.getState().addNode(panelId, 'terminal', { x: index * 40, y: index * 40 }, { width: 800, height: 500 })
    const nodeId = canvas.getState().nodeForPanel(panelId)!
    canvas.getState().setNodeDockLayout(nodeId, {
      type: 'tabs',
      id: `mission-live-node-dock-${panelId}`,
      panelIds: [panelId],
      activeIndex: 0,
    })
  }

  return { canvasId, nodeId: canvas.getState().nodeForPanel(terminalIds[0])! }
}

function unmountMissionPlacement(placement: { workspaceId: string; canvasId: string; nodeId: string }): void {
  unregisterNodeDockStore(placement.canvasId, placement.nodeId)
  releaseWorkspaceDockStore(placement.workspaceId)
  releaseCanvasStoreForPanel(placement.canvasId)
}

beforeEach(() => {
  const g = globalThis as unknown as { window?: { electronAPI?: unknown } }
  g.window = g.window ?? {}
  g.window.electronAPI = {
    isE2E: false,
    workspaceCreate: vi.fn(async (input: { id?: string; name?: string; rootPath?: string }) => ({
      ok: true,
      workspace: {
        id: input.id,
        name: input.name ?? 'Workspace',
        color: '',
        rootPath: input.rootPath ?? '',
      },
    })),
    workspaceUpdate: vi.fn(async () => ({ ok: true, workspace: {} })),
    workspaceRemove: vi.fn(async () => ({ ok: true })),
    recentProjectsAdd: vi.fn(),
    recentProjectsRemove: vi.fn(async () => undefined),
    agentDispose: vi.fn(async () => undefined),
    projectChatsLoad: vi.fn(async () => []),
    projectChatsSave: vi.fn(async () => undefined),
    focusWindowPanel: vi.fn(),
    showContextMenu: vi.fn(async () => 'inspect'),
    openFolderDialog: vi.fn(async () => null),
    skillsListInstalled: vi.fn(async () => []),
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
      lastToolCall: { name: 'Edit', detail: '/src/app.ts', observedAt: Date.now() },
      filesTouched: [
        { path: '/src/app.ts', lastObservedAt: Date.now() },
        { path: '/src/app.test.ts', lastObservedAt: Date.now() },
      ],
    })
    useAppStore.getState().renamePanelByUser(wsId, supervisorId, 'Orchestrator')
    const workspace = useAppStore.getState().workspaces.find((ws) => ws.id === wsId)!
    workspace.dockState = coldDockSnapshot(supervisorId, [workerId])
    workspace.canvases = coldCanvasSnapshot(supervisorId, [supervisorId, workerId])
    const placement = mountMissionPlacement(wsId, supervisorId, [supervisorId, workerId])
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
    expect(host.textContent).toContain('Edit')
    expect(host.textContent).toContain('2 files')
    unmountMissionPlacement(placement)
  })

  it('offers canonical mission actions for a ready isolated worker and applies through the driver', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    codingAgentDriver.handleCodingAgentMethod.mockResolvedValue({ ok: true, result: {} })
    ;(window.electronAPI as { showContextMenu: unknown }).showContextMenu = vi.fn(async () => 'apply')
    const wsId = useAppStore.getState().addWorkspace('Project Actions', '/tmp/project-actions', 'workspace-actions')
    const supervisorId = useAppStore.getState().createTerminal(wsId)
    const workerId = useAppStore.getState().createTerminal(wsId)
    useAppStore.getState().setPanelCodingAgentRun(wsId, workerId, {
      id: 'run-ready',
      agentId: 'codex',
      panelId: workerId,
      title: 'Ready worker',
      ownerPanelId: supervisorId,
      prompt: 'Finish the task',
      createdAt: Date.now(),
      endedAt: Date.now(),
      exitCode: 0,
      worktreeId: 'wt-1',
    })
    const placement = mountMissionPlacement(wsId, supervisorId, [supervisorId, workerId])
    const workspace = useAppStore.getState().workspaces.find((ws) => ws.id === wsId)!
    workspace.dockState = coldDockSnapshot(supervisorId, [workerId])
    workspace.canvases = coldCanvasSnapshot(supervisorId, [supervisorId, workerId])
    useAppStore.getState().renamePanelByUser(wsId, supervisorId, 'Orchestrator')
    await act(async () => {
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

    const worker = Array.from(host.querySelectorAll<HTMLElement>('[data-testid="agent-tree-worker"]'))
      .find((row) => row.textContent?.includes('Ready worker'))!
    await act(async () => {
      worker.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    unmountMissionPlacement(placement)
    expect(confirm).toHaveBeenCalledWith('Apply "Ready worker" to the base branch?')
    expect(codingAgentDriver.handleCodingAgentMethod).toHaveBeenCalledWith(
      wsId,
      workerId,
      'cate.codingAgent.apply',
      { runId: 'run-ready' },
    )
    expect(alert).not.toHaveBeenCalled()
    expect(useAppStore.getState().workspaces.find((ws) => ws.id === wsId)).toBeTruthy()
    confirm.mockRestore()
    alert.mockRestore()
  })

  it('shows recent output in the inspect dialog', async () => {
    codingAgentDriver.handleCodingAgentMethod.mockResolvedValue({
      ok: true,
      result: { recentOutput: 'mission complete\nall checks passed' },
    })
    const wsId = useAppStore.getState().addWorkspace('Project Inspect', '/tmp/project-inspect', 'workspace-inspect')
    const supervisorId = useAppStore.getState().createTerminal(wsId)
    const workerId = useAppStore.getState().createTerminal(wsId)
    useAppStore.getState().setPanelCodingAgentRun(wsId, workerId, {
      id: 'run-inspect',
      agentId: 'codex',
      panelId: workerId,
      title: 'Inspect worker',
      ownerPanelId: supervisorId,
      prompt: 'Show output',
      createdAt: Date.now(),
    })
    const canvasId = useAppStore.getState().createCanvas(wsId)
    const placement = mountMissionPlacement(wsId, canvasId, [supervisorId, workerId])
    const workspace = useAppStore.getState().workspaces.find((ws) => ws.id === wsId)!
    useAppStore.getState().renamePanelByUser(wsId, supervisorId, 'Orchestrator')
    await act(async () => {
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
    const worker = host.querySelector<HTMLElement>('[data-testid="agent-tree-worker"]')!
    await act(async () => {
      worker.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(document.body.textContent).toContain('Inspect Mission')
    expect(document.body.querySelector('[data-testid="agent-worker-output"]')!.textContent).toContain('mission complete')
    unmountMissionPlacement(placement)
  })
})
