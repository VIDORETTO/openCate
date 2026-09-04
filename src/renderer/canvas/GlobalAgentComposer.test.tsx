import React from 'react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import type { AgentContextItem } from '../../shared/agentContextBus'
import type { CodingAgentRunSnapshot } from '../../shared/codingAgentRuns'

const h = vi.hoisted(() => {
  const snapshots: Record<string, CodingAgentRunSnapshot> = {}
  const appState = {
    workspaces: [{
      id: 'ws',
      rootPath: '/repo',
      panels: {
        panelA: { id: 'panelA', type: 'terminal', codingAgentRun: { id: 'run-a', ownerPanelId: 'owner-a' } },
        panelB: { id: 'panelB', type: 'terminal', title: 'UI worker', codingAgentRun: { id: 'run-b', ownerPanelId: 'owner-b' } },
      },
    }],
  }
  return {
    appState,
    snapshots,
    useAppStore: vi.fn((selector: (state: typeof appState) => unknown) => selector(appState)),
    codingAgentSnapshot: vi.fn((_workspaceId: string, _ownerPanelId: string, runId: string) => snapshots[runId] ?? null),
    sendCodingAgentFollowUp: vi.fn(async (_workspaceId: string, _ownerPanelId: string, _runId: string, _prompt: string) => ({ ok: true, result: null })),
    useWorktrees: vi.fn((): Array<Record<string, unknown>> => []),
    getActivePanelId: vi.fn((): string | null => null),
    getEntry: vi.fn((): unknown => undefined),
    recordDelivery: vi.fn(),
    useAgentContextBus: vi.fn(() => ({
      items: [] as Array<AgentContextItem>,
      prompt: '',
      error: null as string | null,
      stage: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    })),
  }
})

vi.mock('../stores/appStore', () => ({ useAppStore: h.useAppStore }))
vi.mock('../lib/agent/codingAgentDriver', () => ({
  codingAgentSnapshot: h.codingAgentSnapshot,
  sendCodingAgentFollowUp: h.sendCodingAgentFollowUp,
}))
vi.mock('../lib/agent/useAgentContextBus', () => ({ useAgentContextBus: h.useAgentContextBus }))
vi.mock('../lib/agent/agentContextGraphStore', () => ({
  useAgentContextGraphStore: (selector: (state: { recordDelivery: typeof h.recordDelivery }) => unknown) => selector({ recordDelivery: h.recordDelivery }),
}))
vi.mock('../stores/useWorktrees', () => ({ useWorktrees: h.useWorktrees }))
vi.mock('../ui/Tooltip', () => ({ Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../lib/activePanel', () => ({ getActivePanelId: h.getActivePanelId }))
vi.mock('../lib/terminal/registryState', () => ({ getEntry: h.getEntry }))

import { GlobalAgentComposer } from './GlobalAgentComposer'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const snapshot = (id: string, title: string, ownerPanelId: string): CodingAgentRunSnapshot => ({
  id,
  agentId: 'codex',
  panelId: id.replace('run', 'panel'),
  ownerPanelId,
  title,
  prompt: 'task',
  createdAt: 1,
  status: 'waiting',
  agentName: 'Codex',
  cwd: '/repo',
  alive: true,
  durationMs: 1,
  followUpSupported: true,
})

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  h.snapshots['run-a'] = snapshot('run-a', 'API worker', 'owner-a')
  h.snapshots['run-b'] = snapshot('run-b', 'UI worker', 'owner-b')
  h.codingAgentSnapshot.mockClear()
  h.sendCodingAgentFollowUp.mockClear()
  h.recordDelivery.mockClear()
  h.useWorktrees.mockReturnValue([
    { id: 'wt-feature', path: '/repo/.cate/worktrees/feature', branch: 'feature', label: 'Feature' },
  ])
  h.getActivePanelId.mockReturnValue(null)
  h.getEntry.mockReturnValue(undefined)
  ;(window as unknown as { electronAPI?: Record<string, unknown> }).electronAPI = {
    fsSearch: vi.fn(async () => []),
    fsReadFile: vi.fn(async () => ''),
    gitStatus: vi.fn(async () => ({ current: 'main' })),
    gitWorktreeReview: vi.fn(async () => ({ diff: 'diff --git a/app.ts b/app.ts' })),
  }
  h.useAgentContextBus.mockImplementation(() => ({
    items: [],
    prompt: '',
    error: null,
    stage: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  }))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  document.body.querySelector('[data-global-agent-composer]')?.remove()
})

function inputPrompt(value: string): void {
  const textarea = document.body.querySelector('textarea') as HTMLTextAreaElement
  act(() => {
    // Bypass React's value tracker just like a real user edit so the
    // controlled textarea receives the synthetic input event.
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function setInputValue(selector: string, value: string): void {
  const input = document.body.querySelector<HTMLInputElement>(selector)
  expect(input).toBeTruthy()
  if (!input) return
  const prototype = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('GlobalAgentComposer', () => {
  it('requires confirmation before broadcasting and sends only selected sessions', async () => {
    act(() => root.render(<GlobalAgentComposer workspaceId="ws" />))
    act(() => document.body.querySelector<HTMLButtonElement>('[aria-label="Broadcast prompt to agent sessions"]')?.click())

    inputPrompt('Run the focused tests')
    const send = () => document.body.querySelector<HTMLButtonElement>('[aria-label="Send broadcast"]')
    expect(send()).toBeTruthy()

    await act(async () => send()?.click())
    expect(document.body.querySelector('[aria-label="Confirm broadcast to 2 agents"]')).toBeTruthy()
    expect(h.sendCodingAgentFollowUp).not.toHaveBeenCalled()

    await act(async () => document.body.querySelector<HTMLButtonElement>('[aria-label="Confirm broadcast to 2 agents"]')?.click())
    expect(h.sendCodingAgentFollowUp).toHaveBeenCalledTimes(2)
    expect(h.sendCodingAgentFollowUp).toHaveBeenNthCalledWith(
      1,
      'ws',
      'owner-a',
      'run-a',
      'Run the focused tests',
      expect.objectContaining({
        enabled: true,
        kind: 'prompt',
        contentChars: 'Run the focused tests'.length,
        actor: expect.objectContaining({
          kind: 'human',
          id: 'local-user',
          origin: 'global-composer',
        }),
        correlationId: expect.any(String),
      }),
    )
    expect(h.sendCodingAgentFollowUp).toHaveBeenNthCalledWith(
      2,
      'ws',
      'owner-b',
      'run-b',
      'Run the focused tests',
      expect.objectContaining({
        enabled: true,
        kind: 'prompt',
        actor: expect.objectContaining({ origin: 'global-composer' }),
        correlationId: expect.any(String),
      }),
    )
  })

  it('does not select a finished or unsupported target', () => {
    h.snapshots['run-b'] = snapshot('run-b', 'Finished worker', 'owner-b')
    h.snapshots['run-b'].status = 'ready'
    act(() => root.render(<GlobalAgentComposer workspaceId="ws" />))
    act(() => document.body.querySelector<HTMLButtonElement>('[aria-label="Broadcast prompt to agent sessions"]')?.click())

    const checkbox = document.body.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]
    expect(checkbox.disabled).toBe(true)
    expect(document.body.textContent).toContain('finished')
  })

  it('prepends staged explicit context to the guarded follow-up prompt', async () => {
    let stageEvidence = ''
    h.useAgentContextBus.mockImplementation(() => ({
      items: [{ id: 'context-1', kind: 'artifact', title: 'failure.log', createdAt: 1, source: 'failure.log', content: 'boom' }],
      prompt: '--- Context 1: failure.log (failure.log) ---\n\nboom',
      error: null,
      stage: Object.assign(vi.fn((input: { content?: string }) => {
        stageEvidence = input.content ?? ''
        return true
      }), {}),
      remove: vi.fn(),
      clear: vi.fn(),
    }))

    act(() => root.render(<GlobalAgentComposer workspaceId="ws" />))
    act(() => document.body.querySelector<HTMLButtonElement>('[aria-label="Broadcast prompt to agent sessions"]')?.click())
    inputPrompt('Fix the failing test')
    await act(async () => {
      await Promise.resolve()
    })
    act(() => document.body.querySelector<HTMLButtonElement>('[aria-label="Stage note as explicit context"]')?.click())
    expect(stageEvidence).toBe('Fix the failing test')

    await act(async () => document.body.querySelector<HTMLButtonElement>('[aria-label="Send broadcast"]')?.click())
    await act(async () => document.body.querySelector<HTMLButtonElement>('[aria-label="Confirm broadcast to 2 agents"]')?.click())
    expect(h.sendCodingAgentFollowUp).toHaveBeenCalledWith(
      'ws',
      'owner-a',
      'run-a',
      expect.stringContaining('--- Context 1: failure.log'),
      expect.objectContaining({
        kind: 'prompt',
        actor: expect.objectContaining({ origin: 'global-composer' }),
        correlationId: expect.any(String),
      }),
    )
    expect(h.sendCodingAgentFollowUp).toHaveBeenCalledWith(
      'ws',
      'owner-b',
      'run-b',
      expect.stringContaining('Fix the failing test'),
      expect.objectContaining({
        kind: 'prompt',
        actor: expect.objectContaining({ origin: 'global-composer' }),
        correlationId: expect.any(String),
      }),
    )
  })

  it('records only successful explicit context deliveries for the visual graph', async () => {
    h.snapshots['run-b'] = snapshot('run-b', 'Finished worker', 'owner-b')
    h.snapshots['run-b'].status = 'ready'
    const contextItems: AgentContextItem[] = [{
      id: 'selection-1',
      kind: 'terminal-selection',
      title: 'API selection',
      createdAt: 1,
      source: 'API worker',
      originPanelId: 'panel-source',
      content: 'failing assertion',
    }]
    h.useAgentContextBus.mockImplementation(() => ({
      items: contextItems,
      prompt: '--- Context 1: API selection (API worker) ---\n\nfailing assertion',
      error: null,
      stage: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    }))

    act(() => root.render(<GlobalAgentComposer workspaceId="ws" />))
    act(() => document.body.querySelector<HTMLButtonElement>('[aria-label="Broadcast prompt to agent sessions"]')?.click())
    inputPrompt('Investigate this failure')
    await act(async () => document.body.querySelector<HTMLButtonElement>('[aria-label="Send broadcast"]')?.click())

    expect(h.sendCodingAgentFollowUp).toHaveBeenCalledWith(
      'ws',
      'owner-a',
      'run-a',
      expect.stringContaining('failing assertion'),
      expect.objectContaining({
        kind: 'prompt',
        actor: expect.objectContaining({ origin: 'global-composer' }),
        correlationId: expect.any(String),
      }),
    )
    expect(h.recordDelivery).toHaveBeenCalledTimes(1)
    expect(h.recordDelivery).toHaveBeenCalledWith(contextItems, ['panel-a'])
  })

  it('captures the focused terminal selection explicitly', () => {
    const stageTerminalSelection = vi.fn(() => true)
    h.useAgentContextBus.mockImplementation(() => ({
      items: [],
      prompt: '',
      error: null,
      stage: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
      stageTerminalSelection,
    }))
    h.getActivePanelId.mockReturnValue('panelB')
    h.getEntry.mockReturnValue({
      terminal: { hasSelection: () => true },
    })

    act(() => root.render(<GlobalAgentComposer workspaceId="ws" />))
    act(() => document.body.querySelector<HTMLButtonElement>('[aria-label="Broadcast prompt to agent sessions"]')?.click())
    act(() => document.body.querySelector<HTMLButtonElement>('[aria-label="Stage focused terminal selection as explicit context"]')?.click())

    expect(stageTerminalSelection).toHaveBeenCalledWith('panelB', 'UI worker — selected')
  })

  it('searches and stages an explicit workspace file', async () => {
    const stageWorkspaceFile = vi.fn(async () => true)
    h.useAgentContextBus.mockImplementation(() => ({
      items: [],
      prompt: '',
      error: null,
      stage: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
      stageWorkspaceFile,
    }))
    const fsSearch = vi.fn(async () => [{
      path: '/repo/src/app.ts',
      name: 'app.ts',
      relativePath: 'src/app.ts',
      isDirectory: false,
    }])
    ;(window as unknown as { electronAPI: { fsSearch: typeof fsSearch } }).electronAPI = { fsSearch }

    act(() => root.render(<GlobalAgentComposer workspaceId="ws" />))
    act(() => document.body.querySelector<HTMLButtonElement>('[aria-label="Broadcast prompt to agent sessions"]')?.click())
    setInputValue('[aria-label="Search workspace file to stage"]', 'app')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 190))
    })

    const choice = document.body.querySelector<HTMLButtonElement>('[data-workspace-file-choice]')
    expect(choice).toBeTruthy()
    await act(async () => choice?.click())

    expect(fsSearch).toHaveBeenCalledWith('/repo', 'app', { maxResults: 8 }, 'ws')
    expect(stageWorkspaceFile).toHaveBeenCalledWith('ws', '/repo/src/app.ts', 'src/app.ts')
  })

  it('reviews the selected worktree and stages its diff against the primary branch', async () => {
    const stageWorktreeDiff = vi.fn(async () => true)
    h.useAgentContextBus.mockImplementation(() => ({
      items: [],
      prompt: '',
      error: null,
      stage: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
      stageWorktreeDiff,
    }))
    const gitStatus = vi.fn(async () => ({ current: 'main' }))
    const gitWorktreeReview = vi.fn(async () => ({ diff: 'diff --git a/app.ts b/app.ts' }))
    ;(window as unknown as { electronAPI: { gitStatus: typeof gitStatus; gitWorktreeReview: typeof gitWorktreeReview } }).electronAPI = {
      gitStatus,
      gitWorktreeReview,
    }

    act(() => root.render(<GlobalAgentComposer workspaceId="ws" />))
    act(() => document.body.querySelector<HTMLButtonElement>('[aria-label="Broadcast prompt to agent sessions"]')?.click())
    setInputValue('[aria-label="Select worktree for diff context"]', 'wt-feature')
    await act(async () => document.body.querySelector<HTMLButtonElement>('[aria-label="Stage worktree diff as explicit context"]')?.click())

    expect(gitStatus).toHaveBeenCalledWith('/repo', 'ws')
    expect(gitWorktreeReview).toHaveBeenCalledWith('/repo/.cate/worktrees/feature', 'main', 'ws')
    expect(stageWorktreeDiff).toHaveBeenCalledWith(
      '/repo/.cate/worktrees/feature',
      'main',
      'diff --git a/app.ts b/app.ts',
    )
  })
})
