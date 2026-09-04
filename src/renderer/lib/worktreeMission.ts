// =============================================================================
// worktreeMission — the user-facing one-click mission flow.
//
// A quick start creates a Cate Agent supervisor, asks the canonical coding-agent
// driver to create an isolated worktree + task + worker terminal, then tags the
// supervisor's first chat to that worktree. The driver remains the authority for
// hook readiness, task persistence, PTY startup, lifecycle, and cleanup; this
// module only composes those existing seams for the UI.
// =============================================================================

import { useAppStore } from '../stores/appStore'
import { placementForBackgroundPanel } from './workspace/canvasAccess'
import { seedAgentPanelWithWorktreeChat } from '../../cateAgent/renderer/seedWorktreeChat'
import { handleCodingAgentMethod } from './agent/codingAgentDriver'
import type { AgentId } from '../../shared/agents'

export interface WorktreeMissionOptions {
  worktreeName: string
  prompt: string
  agentId?: AgentId
  baseRef?: string
  canvasPanelId?: string
}

export interface WorktreeMissionResult {
  ownerPanelId: string
  worktreeId: string
  run: Record<string, unknown>
}

function resultObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

/** Start a complete isolated mission from a user-facing canvas action. */
export async function startWorktreeMission(
  workspaceId: string,
  rootPath: string,
  options: WorktreeMissionOptions,
): Promise<WorktreeMissionResult> {
  const store = useAppStore.getState()
  const prompt = options.prompt.trim()
  const worktreeName = options.worktreeName.trim()
  if (!worktreeName) throw new Error('Enter a worktree name.')
  if (!prompt) throw new Error('Enter an initial task.')

  // The owner is a real Cate Agent panel so the mission is visible in the
  // existing supervisor → worker tree instead of inventing a hidden owner id.
  const placement = options.canvasPanelId
    ? { target: 'canvas' as const, canvasPanelId: options.canvasPanelId, focus: false }
    : placementForBackgroundPanel(workspaceId)
  const ownerPanelId = store.createCateAgent(workspaceId, undefined, placement)
  if (!ownerPanelId) throw new Error('Could not create the mission panel.')

  try {
    const outcome = await handleCodingAgentMethod(
      workspaceId,
      ownerPanelId,
      'cate.codingAgent.create',
      {
        prompt,
        newWorktree: worktreeName,
        ...(options.agentId ? { agentId: options.agentId } : {}),
        ...(options.baseRef ? { baseRef: options.baseRef } : {}),
      },
      {
        kind: 'human',
        id: 'local-user',
        label: 'Worktree quick start',
        origin: 'mission-launch',
      },
    )
    if (!outcome.ok) throw new Error(outcome.error)

    const run = resultObject(outcome.result)
    const worktreeId = typeof run?.worktreeId === 'string' ? run.worktreeId : ''
    if (!run || !worktreeId) throw new Error('The mission started without a worktree.')

    // The first chat is only a durable worktree association; the initial task
    // itself was already sent to the coding-agent PTY by the driver.
    await seedAgentPanelWithWorktreeChat(workspaceId, rootPath, ownerPanelId, worktreeId)
    return { ownerPanelId, worktreeId, run }
  } catch (error) {
    // The driver rolls back a worktree it owns when its preflight fails. The
    // supervisor panel is UI-only, so it must be removed here on every failure.
    useAppStore.getState().closePanel(workspaceId, ownerPanelId)
    throw error
  }
}
