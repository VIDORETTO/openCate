import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  createCateAgent: vi.fn(),
  closePanel: vi.fn(),
}))
const placementForBackgroundPanel = vi.hoisted(() => vi.fn())
const handleCodingAgentMethod = vi.hoisted(() => vi.fn())
const seedAgentPanelWithWorktreeChat = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('../stores/appStore', () => ({
  useAppStore: { getState: () => state },
}))
vi.mock('./workspace/canvasAccess', () => ({ placementForBackgroundPanel }))
vi.mock('./agent/codingAgentDriver', () => ({ handleCodingAgentMethod }))
vi.mock('../../cateAgent/renderer/seedWorktreeChat', () => ({ seedAgentPanelWithWorktreeChat }))

import { startWorktreeMission } from './worktreeMission'

describe('startWorktreeMission', () => {
  beforeEach(() => {
    state.createCateAgent.mockReset()
    state.closePanel.mockReset()
    placementForBackgroundPanel.mockReset()
    handleCodingAgentMethod.mockReset()
    seedAgentPanelWithWorktreeChat.mockReset()
    seedAgentPanelWithWorktreeChat.mockResolvedValue(undefined)
    state.createCateAgent.mockReturnValue('supervisor-1')
    placementForBackgroundPanel.mockReturnValue({ target: 'canvas', placementGroupId: 'background' })
    handleCodingAgentMethod.mockResolvedValue({
      ok: true,
      result: { id: 'run-1', worktreeId: 'wt-1', status: 'starting' },
    })
  })

  it('composes the supervisor, driver mission and durable chat association', async () => {
    await expect(startWorktreeMission('ws', '/repo', {
      canvasPanelId: 'canvas-1',
      worktreeName: 'fix-login',
      prompt: 'Fix the login redirect',
      agentId: 'codex',
      baseRef: 'develop',
    })).resolves.toEqual({
      ownerPanelId: 'supervisor-1',
      worktreeId: 'wt-1',
      run: { id: 'run-1', worktreeId: 'wt-1', status: 'starting' },
    })

    expect(state.createCateAgent).toHaveBeenCalledWith('ws', undefined, {
      target: 'canvas',
      canvasPanelId: 'canvas-1',
      focus: false,
    })
    expect(handleCodingAgentMethod).toHaveBeenCalledWith(
      'ws',
      'supervisor-1',
      'cate.codingAgent.create',
      { prompt: 'Fix the login redirect', newWorktree: 'fix-login', agentId: 'codex', baseRef: 'develop' },
      expect.objectContaining({ origin: 'mission-launch' }),
    )
    expect(seedAgentPanelWithWorktreeChat).toHaveBeenCalledWith('ws', '/repo', 'supervisor-1', 'wt-1')
  })

  it('removes the supervisor when the worker cannot be started', async () => {
    handleCodingAgentMethod.mockResolvedValueOnce({ ok: false, error: 'agent-hooks-not-ready' })

    await expect(startWorktreeMission('ws', '/repo', {
      worktreeName: 'fix-login',
      prompt: 'Fix login',
    })).rejects.toThrow('agent-hooks-not-ready')

    expect(state.closePanel).toHaveBeenCalledWith('ws', 'supervisor-1')
    expect(seedAgentPanelWithWorktreeChat).not.toHaveBeenCalled()
  })
})
