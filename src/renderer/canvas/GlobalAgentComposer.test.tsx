import React from 'react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import type { CodingAgentRunSnapshot } from '../../shared/codingAgentRuns'

const h = vi.hoisted(() => {
  const snapshots: Record<string, CodingAgentRunSnapshot> = {}
  const appState = {
    workspaces: [{
      id: 'ws',
      panels: {
        panelA: { id: 'panelA', type: 'terminal', codingAgentRun: { id: 'run-a', ownerPanelId: 'owner-a' } },
        panelB: { id: 'panelB', type: 'terminal', codingAgentRun: { id: 'run-b', ownerPanelId: 'owner-b' } },
      },
    }],
  }
  return {
    appState,
    snapshots,
    useAppStore: vi.fn((selector: (state: typeof appState) => unknown) => selector(appState)),
    codingAgentSnapshot: vi.fn((_workspaceId: string, _ownerPanelId: string, runId: string) => snapshots[runId] ?? null),
    sendCodingAgentFollowUp: vi.fn(async (_workspaceId: string, _ownerPanelId: string, _runId: string, _prompt: string) => ({ ok: true, result: null })),
  }
})

vi.mock('../stores/appStore', () => ({ useAppStore: h.useAppStore }))
vi.mock('../lib/agent/codingAgentDriver', () => ({
  codingAgentSnapshot: h.codingAgentSnapshot,
  sendCodingAgentFollowUp: h.sendCodingAgentFollowUp,
}))
vi.mock('../ui/Tooltip', () => ({ Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</> }))

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
    expect(h.sendCodingAgentFollowUp).toHaveBeenNthCalledWith(1, 'ws', 'owner-a', 'run-a', 'Run the focused tests')
    expect(h.sendCodingAgentFollowUp).toHaveBeenNthCalledWith(2, 'ws', 'owner-b', 'run-b', 'Run the focused tests')
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
})
