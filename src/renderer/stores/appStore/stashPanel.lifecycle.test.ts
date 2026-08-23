// =============================================================================
// stashPanel lifecycle — stash must be the non-destructive sibling of close:
// remove the panel's placement, keep its registry entry (and therefore PTY),
// and restore it through the normal placement path.
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => {
  const entries = new Map<string, { ptyId: string; workspaceId: string }>()
  return { entries }
})

vi.mock('../../lib/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}))

vi.mock('../../lib/terminal/terminalRegistry', () => ({
  terminalRegistry: {
    dispose: (panelId: string) => {
      h.entries.delete(panelId)
    },
    release: (panelId: string) => {
      h.entries.delete(panelId)
    },
    disposeWorkspace: (workspaceId: string) => {
      for (const [panelId, entry] of [...h.entries]) {
        if (entry.workspaceId === workspaceId) h.entries.delete(panelId)
      }
    },
    has: (panelId: string) => h.entries.has(panelId),
    getEntry: (panelId: string) => h.entries.get(panelId),
  },
}))

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
  }
})

import { useAppStore } from './index'
import { getOrCreateCanvasStoreForPanel } from '../canvasStore'
import { setActivePanel, getActivePanelId } from '../../lib/activePanel'

let seq = 0

beforeEach(() => {
  for (const ws of [...useAppStore.getState().workspaces]) {
    useAppStore.getState().removeWorkspace(ws.id)
  }
  h.entries.clear()
  setActivePanel(null)
  seq += 1
})

describe('stashPanel lifecycle', () => {
  function makeWorkspace(): { wsId: string; canvasId: string } {
    const suffix = `stash-${seq}`
    const wsId = useAppStore.getState().addWorkspace(suffix, `/tmp/${suffix}`, `ws-${suffix}`)
    const canvasId = useAppStore.getState().createCanvas(wsId)
    return { wsId, canvasId }
  }

  function spawnPty(panelId: string, workspaceId: string): void {
    h.entries.set(panelId, { ptyId: `${panelId}-pty`, workspaceId })
  }

  it('keeps the record and live terminal while removing the canvas placement', () => {
    const { wsId, canvasId } = makeWorkspace()
    const panelId = useAppStore.getState().createTerminal(wsId, undefined, { x: 10, y: 10 })
    spawnPty(panelId, wsId)
    const canvas = getOrCreateCanvasStoreForPanel(canvasId)
    setActivePanel(panelId)

    useAppStore.getState().stashPanel(wsId, panelId)

    expect(useAppStore.getState().workspaces.find((ws) => ws.id === wsId)?.panels[panelId]).toMatchObject({
      stashed: true,
      type: 'terminal',
    })
    expect(h.entries.has(panelId)).toBe(true)
    expect(getActivePanelId()).toBeNull()
    const removedNode = canvas.getState().nodeForPanel(panelId)
    expect(removedNode === null || canvas.getState().nodes[removedNode]?.animationState === 'exiting').toBe(true)
  })

  it('restores through the normal canvas placement path', () => {
    const { wsId, canvasId } = makeWorkspace()
    const panelId = useAppStore.getState().createTerminal(wsId, undefined, { x: 10, y: 10 })
    spawnPty(panelId, wsId)
    const canvas = getOrCreateCanvasStoreForPanel(canvasId)
    useAppStore.getState().stashPanel(wsId, panelId)

    useAppStore.getState().unstashPanel(wsId, panelId)

    const panel = useAppStore.getState().workspaces.find((ws) => ws.id === wsId)?.panels[panelId]
    expect(panel).toBeDefined()
    expect(panel?.stashed).toBeUndefined()
    expect(h.entries.has(panelId)).toBe(true)
    expect(canvas.getState().nodeForPanel(panelId)).toBeTruthy()
  })
})
