// =============================================================================
// Provider-neutral agent lifecycle vocabulary.
//
// The renderer keeps a few historical names for compatibility with persisted
// UI state (`notRunning`, `running`, `waitingForInput`) and the mission driver
// keeps durable workflow names (`starting`, `ready`, `failed`). This module is
// the small canonical bridge between those projections so each layer agrees
// on the six actual lifecycle meanings.
// =============================================================================

import type { AgentState } from './types'
import type { CodingAgentRunStatus } from './codingAgentRuns'

export type AgentLifecycleState =
  | 'working'
  | 'waiting'
  | 'idle'
  | 'finished'
  | 'error'
  | 'stalled'

export interface AgentLifecycleSignals {
  /** An agent/process is currently present. */
  present: boolean
  /** Presence was true at the previous observation. */
  wasPresent: boolean
  /** A turn is actively doing work. */
  active: boolean
  /** A trusted terminal/mission error takes precedence over all other edges. */
  error?: boolean
  /** Work is live but has crossed the explicit no-output threshold. */
  stalled?: boolean
}

/** Resolve the canonical state from orthogonal evidence, with explicit edge
 * precedence. Error and finished are terminal observations; a missing agent
 * that was never present is merely idle. */
export function resolveAgentLifecycleState(signals: AgentLifecycleSignals): AgentLifecycleState {
  if (signals.error) return 'error'
  if (!signals.present && signals.wasPresent) return 'finished'
  if (!signals.present) return 'idle'
  if (signals.stalled) return 'stalled'
  if (signals.active) return 'working'
  return 'waiting'
}

/** Project the canonical vocabulary into the renderer's stable terminal
 * contract. `error`/`stalled` are intentionally lossy here because callers
 * that need those distinctions use the mission status projection instead. */
export function terminalStateForLifecycle(state: AgentLifecycleState): AgentState {
  switch (state) {
    case 'working': return 'running'
    case 'waiting': return 'waitingForInput'
    case 'idle': return 'notRunning'
    case 'finished': return 'finished'
    case 'error': return 'finished'
    case 'stalled': return 'running'
  }
}

/** Convert the terminal projection back to canonical vocabulary. The optional
 * flags preserve the one legacy case where `notRunning + agentPresent` means
 * a process was found before a structured turn event arrived. */
export function lifecycleForTerminalState(
  state: AgentState,
  options: { agentPresent?: boolean; stalled?: boolean } = {},
): AgentLifecycleState {
  if (state === 'running' && options.stalled) return 'stalled'
  if (state === 'notRunning' && options.agentPresent) return 'working'
  switch (state) {
    case 'running': return 'working'
    case 'waitingForInput': return 'waiting'
    case 'notRunning': return 'idle'
    case 'finished': return 'finished'
  }
}

/** Normalize the mission driver's durable statuses into the same lifecycle
 * vocabulary. `stopped` is a terminal completion from the lifecycle's point
 * of view; the driver retains the more specific status for its UI/actions. */
export function lifecycleForCodingAgentStatus(status: CodingAgentRunStatus): AgentLifecycleState {
  switch (status) {
    case 'working': return 'working'
    case 'waiting': return 'waiting'
    case 'starting': return 'idle'
    case 'ready': return 'finished'
    case 'failed': return 'error'
    case 'stalled': return 'stalled'
    case 'stopped': return 'finished'
  }
}
