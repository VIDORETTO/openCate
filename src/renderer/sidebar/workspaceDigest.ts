import { isWorktreePanelType } from '../../shared/panels'
import type { AgentState, PanelState, PanelType } from '../../shared/types'

/** Reasons currently promoted to the sidebar's "Needs attention" section. */
export type WorkspaceDigestAttentionReason = Extract<AgentState, 'waitingForInput' | 'finished'>

/** A compact, derived snapshot of the workspace's live terminal fleet. */
export interface WorkspaceDigest {
  /** Waiting + finished local agents, matching the attention queue. */
  attentionCount: number
  /** Panels hidden from the canvas while their process/content stays alive. */
  stashedCount: number
  runningAgents: number
  waitingAgents: number
  finishedAgents: number
  /** Worktree-bound panels (terminals and agent panels), including stashes. */
  totalTerminals: number
  /** Non-zero facts in stable presentation order; empty when nothing to say. */
  segments: string[]
}

export interface WorkspaceDigestInput {
  attentionQueue: ReadonlyArray<{ panel: PanelState; reason: WorkspaceDigestAttentionReason }>
  stashedPanels: readonly PanelState[]
  /** Local placement order from the canonical panel tree; excludes stashes. */
  orderedPanels: readonly PanelState[]
  /** Per-panel runtime state keyed by panel id. */
  agentInfoByPanel: Record<string, { state?: AgentState } | undefined>
  /** Panels living in other windows; their owner stamps the live state. */
  detachedPanels?: ReadonlyArray<{ type?: PanelType; agentState?: AgentState }>
}

/**
 * Aggregate existing sidebar signals without creating a second source of
 * truth. Only worktree-bound panels carry agent/runtime state, so other panel
 * types are deliberately excluded from terminal counts. Stashed panels are
 * absent from `orderedPanels`, but their PTY remains alive, so they still
 * contribute runtime facts while also being surfaced as "parked".
 */
export function buildWorkspaceDigest(input: WorkspaceDigestInput): WorkspaceDigest {
  const seenPanelIds = new Set<string>()
  let runningAgents = 0
  let waitingAgents = 0
  let finishedAgents = 0
  let totalTerminals = 0

  const considerPanel = (panel: PanelState): void => {
    if (!isWorktreePanelType(panel.type) || seenPanelIds.has(panel.id)) return
    seenPanelIds.add(panel.id)
    totalTerminals += 1

    const state = input.agentInfoByPanel[panel.id]?.state
    if (state === 'running') runningAgents += 1
    else if (state === 'waitingForInput') waitingAgents += 1
    else if (state === 'finished') finishedAgents += 1
  }

  input.orderedPanels.forEach(considerPanel)
  input.stashedPanels.forEach(considerPanel)

  for (const panel of input.detachedPanels ?? []) {
    if (!isWorktreePanelType(panel.type)) continue
    totalTerminals += 1
    if (panel.agentState === 'running') runningAgents += 1
    else if (panel.agentState === 'waitingForInput') waitingAgents += 1
    else if (panel.agentState === 'finished') finishedAgents += 1
  }

  const segments: string[] = []
  if (runningAgents > 0) segments.push(`${runningAgents} running`)
  if (waitingAgents > 0) segments.push(`${waitingAgents} input`)
  if (finishedAgents > 0) segments.push(`${finishedAgents} done`)

  // Plain-terminal workspaces still deserve a useful one-line summary.
  if (segments.length === 0 && totalTerminals > 0) {
    segments.push(totalTerminals === 1 ? '1 terminal' : `${totalTerminals} terminals`)
  }
  if (input.stashedPanels.length > 0) {
    segments.push(input.stashedPanels.length === 1 ? '1 parked' : `${input.stashedPanels.length} parked`)
  }

  return {
    attentionCount: input.attentionQueue.length,
    stashedCount: input.stashedPanels.length,
    runningAgents,
    waitingAgents,
    finishedAgents,
    totalTerminals,
    segments,
  }
}

/** Render the digest as a compact sidebar summary, e.g. "2 running · 1 done". */
export function formatWorkspaceDigest(digest: WorkspaceDigest): string {
  return digest.segments.join(' · ')
}
