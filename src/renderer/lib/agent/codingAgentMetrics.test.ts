import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  app: {} as any,
  panelId: 'panel-1' as string | null,
}))

vi.mock('../../stores/appStore', () => ({
  useAppStore: { getState: () => state.app },
}))

vi.mock('../terminal/terminalRegistry', () => ({
  terminalRegistry: { panelIdForPty: () => state.panelId },
}))

import { ptyToPanel, setPtyForPanel } from '../terminal/registryState'
import { noteCodingAgentActivityEvent, noteCodingAgentUsageEvent } from './codingAgentMetrics'

describe('coding-agent usage event bridge', () => {
  beforeEach(() => {
    const panel: any = {
      id: 'panel-1',
      type: 'terminal',
      codingAgentRun: {
        id: 'run-1',
        agentId: 'codex',
        panelId: 'panel-1',
        ownerPanelId: 'owner-1',
        prompt: 'task',
        createdAt: 1,
        usage: { inputTokens: 10, observedAt: 1, source: 'hook' },
      },
    }
    state.app = {
      workspaces: [{ id: 'ws-1', panels: { 'panel-1': panel } }],
      setPanelCodingAgentRun: vi.fn((_workspaceId: string, _panelId: string, run: unknown) => {
        panel.codingAgentRun = run
      }),
    }
  })

  it('routes structured hook usage to the owning mission and preserves earlier fields', () => {
    noteCodingAgentUsageEvent({
      terminalId: 'pty-1',
      agentId: 'codex',
      kind: 'turn-end',
      sessionId: 'session-1',
      raw: {
        usage: { output_tokens: 25, total_tokens: 35, context_tokens: 80, context_window: 100 },
      },
    })

    expect(state.app.setPanelCodingAgentRun).toHaveBeenCalledWith(
      'ws-1',
      'panel-1',
      expect.objectContaining({
        usage: expect.objectContaining({
          inputTokens: 10,
          outputTokens: 25,
          totalTokens: 35,
          contextTokens: 80,
          contextWindow: 100,
        }),
      }),
    )
  })

  it('ignores usage from a different agent or an unowned terminal', () => {
    noteCodingAgentUsageEvent({
      terminalId: 'pty-1',
      agentId: 'claude-code',
      kind: 'turn-end',
      sessionId: 'session-1',
      raw: { usage: { input_tokens: 99 } },
    })
    expect(state.app.setPanelCodingAgentRun).not.toHaveBeenCalled()

    state.panelId = null
    noteCodingAgentUsageEvent({
      terminalId: 'pty-unknown',
      agentId: 'codex',
      kind: 'turn-end',
      sessionId: 'session-2',
      raw: { usage: { input_tokens: 99 } },
    })
    expect(state.app.setPanelCodingAgentRun).not.toHaveBeenCalled()
  })
})

describe('coding-agent activity event bridge', () => {
  beforeEach(() => {
    state.panelId = 'panel-1'
    setPtyForPanel('panel-1', 'pty-1')
    const panel: any = {
      id: 'panel-1',
      type: 'terminal',
      codingAgentRun: {
        id: 'run-1',
        agentId: 'codex',
        panelId: 'panel-1',
        ownerPanelId: 'owner-1',
        prompt: 'task',
        createdAt: 1,
        filesTouched: [{ path: '/old/file.ts', lastObservedAt: 5 }],
      },
    }
    state.app = {
      workspaces: [{ id: 'ws-1', panels: { 'panel-1': panel } }],
      setPanelCodingAgentRun: vi.fn((_workspaceId: string, _panelId: string, run: unknown) => {
        panel.codingAgentRun = run
      }),
    }
  })

  it('routes PostToolUse facts into the durable run record', () => {
    noteCodingAgentActivityEvent({
      terminalId: 'pty-1',
      agentId: 'codex',
      kind: 'turn-resume',
      sessionId: 'session-1',
      raw: {
        tool_name: 'Edit',
        tool_input: { file_path: '/repo/src/app.ts' },
      },
    })

    const run = state.app.workspaces[0].panels['panel-1'].codingAgentRun
    expect(state.app.setPanelCodingAgentRun).toHaveBeenCalledTimes(1)
    expect(state.panelId).toBe('panel-1')
    expect(run.lastToolCall).toEqual({
      name: 'Edit',
      detail: '/repo/src/app.ts',
      observedAt: expect.any(Number),
    })
    expect(run.filesTouched.map((file: any) => file.path)).toEqual([
      '/repo/src/app.ts',
      '/old/file.ts',
    ])
  })

  it('ignores lifecycle-only hooks and other agents', () => {
    noteCodingAgentActivityEvent({
      terminalId: 'pty-1',
      agentId: 'codex',
      kind: 'turn-end',
      sessionId: 'session-1',
      raw: { tool_name: 'Edit', tool_input: { file_path: '/repo/nope.ts' } },
    })
    noteCodingAgentActivityEvent({
      terminalId: 'pty-1',
      agentId: 'claude-code',
      kind: 'turn-resume',
      sessionId: 'session-1',
      raw: { tool_name: 'Edit', tool_input: { file_path: '/repo/wrong-agent.ts' } },
    })

    expect(state.app.setPanelCodingAgentRun).not.toHaveBeenCalled()
    ptyToPanel.delete('pty-1')
  })
})
