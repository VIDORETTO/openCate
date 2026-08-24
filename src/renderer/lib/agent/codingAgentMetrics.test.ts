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

import { noteCodingAgentUsageEvent } from './codingAgentMetrics'

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
