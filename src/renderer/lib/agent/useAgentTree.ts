import { useEffect, useMemo, useState } from 'react'
import type { CodingAgentRunSnapshot } from '../../../shared/codingAgentRuns'
import type { PanelState, WindowPanelInfo } from '../../../shared/types'
import { codingAgentSnapshot } from './codingAgentDriver'
import { buildAgentTree, type AgentTree } from './agentTree'

export interface UseAgentTreeInput {
  workspaceId: string
  /** Every local panel, including stashed ones. */
  localPanels: ReadonlyArray<PanelState>
  /** Owner-window reports for workers living in another window. */
  detachedPanels?: ReadonlyArray<WindowPanelInfo>
  /** Milliseconds between live local-status re-derivations. Defaults to 1s. */
  refreshIntervalMs?: number
}

/** Subscribe only to the facts the sidebar actually needs. App-store changes
 *  already cover mission add/remove; a bounded clock covers terminal lifecycle,
 *  agent hooks, activity timestamps and stalled derivation. */
export function useAgentTree(input: UseAgentTreeInput): AgentTree {
  const { workspaceId, localPanels, detachedPanels, refreshIntervalMs } = input
  const [, setTick] = useState(0)
  // The clock intentionally re-derives snapshots even when store object
  // identities have not changed. It does not need to participate in the memo.
  const [intervalMs] = useState(Math.max(250, refreshIntervalMs ?? 1_000))

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])

  return useMemo(() => {
    const localRuns = localPanels.flatMap((panel) => {
      const run = panel.codingAgentRun
      return run ? codingAgentSnapshot(workspaceId, run.ownerPanelId, run.id) : null
    }).filter((snapshot): snapshot is CodingAgentRunSnapshot => snapshot !== null)
    return buildAgentTree({ localPanels, localRuns, detachedPanels })
  }, [workspaceId, localPanels, detachedPanels])
}
