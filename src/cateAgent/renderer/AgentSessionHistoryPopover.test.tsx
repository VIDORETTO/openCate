// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentSessionHistoryPopover } from './AgentSessionHistoryPopover'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

const session = {
  runtimeId: 'local',
  agentId: 'codex' as const,
  sessionId: 'session-1',
  cwd: '/repo',
  transcriptPath: '/home/user/.codex/rollout.jsonl',
  resumable: true,
  createdAt: 100,
  updatedAt: 200,
  lastEvent: 'turn-end' as const,
  source: 'native-transcript' as const,
}

beforeEach(() => {
  ;(window as unknown as { electronAPI: Record<string, unknown> }).electronAPI = {
    agentSessionHistoryList: vi.fn().mockResolvedValue([session]),
    agentSessionHistoryLoad: vi.fn().mockResolvedValue([
      { id: 'm1', role: 'user', text: 'Fix the auth flow' },
      { id: 'm2', role: 'assistant', text: 'Done' },
    ]),
  }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('AgentSessionHistoryPopover', () => {
  it('lists a known session and replays its canonical messages without relaunching a CLI', async () => {
    await act(async () => {
      root.render(<AgentSessionHistoryPopover rootPath="/repo" onClose={vi.fn()} />)
      await Promise.resolve()
    })

    expect(host.textContent).toContain('codex')
    expect(host.textContent).toContain('session-1')

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-agent-session-item]')!.click()
      await Promise.resolve()
    })

    expect(host.textContent).toContain('Fix the auth flow')
    expect(host.textContent).toContain('Done')
    expect(window.electronAPI.agentSessionHistoryLoad).toHaveBeenCalledWith('/repo', session)
  })
})
