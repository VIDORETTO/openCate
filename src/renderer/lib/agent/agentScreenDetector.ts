// =============================================================================
// Agent activity coordinator: a hook-event FSM plus a registry-gated screen
// fallback and presence edges.
//
// Running/idle for all agents (claude/codex/cursor/pi/opencode) is driven by the
// normalized agent-hook event stream (SHELL_AGENT_HOOK_EVENT →
// noteAgentHookEvent): turn-start flips to 'running' immediately, turn-end
// flips back to 'waitingForInput' and fires the "needs input" notification,
// and session-end is treated like turn-end for state (the process may keep
// running after /clear). permission-wait (the CLI is blocked on tool approval)
// flips to 'waitingForInput' immediately with a "needs permission"
// notification whose body carries the blocked command; turn-resume (the
// CLI reported a permission reply or a tool completed) flips back to 'running'
// silently. For CLIs with no approval-reply hook, terminal Enter supplies the
// earlier resume edge. The signals are authoritative, so no settle timer is
// involved.
//
// Presence (noteAgentPresence, fed 1 Hz from main's activity scan) stays
// authoritative for EXISTENCE — but it is itself hook-anchored now: the
// daemon registers the agent's pid from its first hook post's lineage
// (runtime/capabilities/agentPresence.ts) and the scan reports that pid's
// liveness. Hooks can't report a crash or exit (codex never fires
// SessionEnd), so notRunning/finished still come from the scan's falling
// edge.
//
// Hook injection is best-effort. Hooks remain authoritative whenever they are
// observed; only an agent whose canonical registry entry explicitly enables
// `screenFallback` may use the tiny visible-screen classifier. That fallback is
// status-only: it never reads scrollback, creates a session identity, or
// produces an OS notification on its own.
// =============================================================================

import { useStatusStore, workspaceIdForTerminal } from '../../stores/statusStore'
import { sendOsNotification } from '../notifications/osNotificationSend'
import type { AgentHookEvent } from '../../../shared/agentHooks'
import type { AgentState } from '../../../shared/types'
import { AGENTS, type AgentId } from '../../../shared/agents'
import { resolveAgentLifecycleState, terminalStateForLifecycle } from '../../../shared/agentLifecycle'
import { resolveAgentScreenState, type HeuristicAgentState } from './agentScreenHeuristics'

export interface DetectorSignals {
  /** Main's process-tree scan found the agent CLI for this terminal. */
  present: boolean
  /** The agent was present on the previous observation (for finished edge). */
  wasPresent: boolean
  /** A turn is in flight (hook turn-start seen more recently than a turn-end)
   *  and not parked on a permission prompt. */
  active: boolean
  /** Reserved for callers that have a trusted terminal/mission error. */
  error?: boolean
  /** Reserved for the shared no-output/stall policy. */
  stalled?: boolean
}

export function resolveAgentState(s: DetectorSignals): AgentState {
  return terminalStateForLifecycle(resolveAgentLifecycleState(s))
}

// The Tracker holds hook/FSM-edge state plus ephemeral fallback evidence. The
// agent name remains owned by statusStore (the single home); the tracker reads
// it from there at commit time rather than caching a second copy that two
// writers could clobber on the same 1 Hz tick. `present/wasPresent/state`
// remain here because they are load-bearing FSM edge-detection memory
// (resolveAgentState's finished edge and commit's transition gate).
interface Tracker {
  /** Effective presence: hook presence OR an explicitly allowed screen agent. */
  present: boolean
  wasPresent: boolean
  /** Main's hook-registered liveness, kept separate from the screen fallback. */
  hookPresent: boolean
  /** Process/launch identity for the registry-enabled screen fallback. */
  fallbackPresent: boolean
  fallbackAgentId: AgentId | null
  fallbackScreenState: HeuristicAgentState | null
  /** Once true, the structured FSM owns state and screen samples are ignored. */
  hookObserved: boolean
  /** Current CLI session identity. Used to make a deferred/replayed
   *  session-start idempotent instead of letting it overwrite a turn event
   *  from the same session that already arrived. */
  sessionId: string | null
  /** turn-start seen more recently than turn-end/session-end. */
  hookTurnActive: boolean
  /** The in-flight turn is parked on a permission prompt (permission-wait seen
   *  more recently than turn-resume/turn-start/turn-end). Splits "turn active"
   *  from "turn active but blocked" so the 1 Hz presence tick keeps showing
   *  waitingForInput while blocked instead of flipping back to running. */
  hookPermissionWait: boolean
  state: AgentState
}

const trackers = new Map<string, Tracker>()
let started = false

function trackerFor(terminalId: string): Tracker {
  let t = trackers.get(terminalId)
  if (!t) {
    t = {
      present: false,
      wasPresent: false,
      hookPresent: false,
      fallbackPresent: false,
      fallbackAgentId: null,
      fallbackScreenState: null,
      hookObserved: false,
      sessionId: null,
      hookTurnActive: false,
      hookPermissionWait: false,
      state: 'notRunning',
    }
    trackers.set(terminalId, t)
  }
  return t
}

function screenFallbackAgent(agentId: AgentId | null): AgentId | null {
  if (!agentId) return null
  return AGENTS.find((agent) => agent.id === agentId && agent.screenFallback)?.id ?? null
}

function effectivePresent(t: Tracker): boolean {
  return t.hookPresent || t.fallbackPresent
}

function effectiveActive(t: Tracker): boolean {
  return t.hookObserved
    ? t.hookTurnActive && !t.hookPermissionWait
    : t.fallbackScreenState === 'running'
}

/** Update the finished-edge memory after either presence source changes. */
function reconcilePresence(t: Tracker): void {
  t.wasPresent = t.present
  t.present = effectivePresent(t)
  if (!t.present) {
    // The process is gone; any in-flight turn died with it. The next launch
    // starts idle and re-proves itself through fresh evidence.
    t.hookTurnActive = false
    t.hookPermissionWait = false
  }
}

function workspaceFor(terminalId: string): string | undefined {
  return workspaceIdForTerminal(terminalId)
}

/** Apply a resolved state to the store + mirror it to other windows. `notify`
 *  fires the OS notification; hook turn-end and permission-wait pass true.
 *  `permissionBody` switches the text to the "needs permission" variant
 *  carrying what the agent is blocked on. The agent name is read from
 *  statusStore (its single home) at commit time — the tracker doesn't cache a
 *  parallel copy. Notification is transition-gated: commit no-ops when the
 *  state didn't change, so a repeated permission-wait without an intervening
 *  resume cannot re-notify. */
function commit(terminalId: string, state: AgentState, notify: boolean, permissionBody?: string): void {
  const t = trackers.get(terminalId)
  if (!t || t.state === state) return
  const workspaceId = workspaceFor(terminalId)
  if (!workspaceId) return

  t.state = state
  const status = useStatusStore.getState()
  const agentName =
    status.workspaces[workspaceId]?.terminals[terminalId]?.agentName ??
    (t.fallbackAgentId
      ? AGENTS.find((agent) => agent.id === t.fallbackAgentId)?.displayName ?? null
      : null)
  status.setAgentState(workspaceId, terminalId, state, agentName)
  window.electronAPI?.shellReportAgentScreenState?.(terminalId, state)

  if (notify && state === 'waitingForInput') {
    const displayName = agentName ?? 'Agent'
    sendOsNotification({
      title: permissionBody ? `${displayName} needs permission` : `${displayName} needs input`,
      body: permissionBody ?? `${displayName} is waiting for your response.`,
      action: { type: 'focusTerminal', workspaceId, terminalId },
    })
  }
}

/** Short human line for the permission notification: WHAT the agent wants,
 *  from the per-CLI raw payload (pinned live in agentHookContracts.itest.ts). */
function permissionBodyFor(event: AgentHookEvent): string {
  const raw = event.raw
  let detail: unknown
  switch (event.agentId) {
    case 'claude-code':
      detail = raw.message // "Claude needs your permission"
      break
    case 'codex':
      detail = (raw.tool_input as { command?: unknown } | undefined)?.command ?? raw.tool_name
      break
    case 'opencode':
      detail = (raw.metadata as { command?: unknown } | undefined)?.command
      break
  }
  const text = typeof detail === 'string' && detail.trim() ? detail.trim() : 'Waiting for your approval.'
  return text.length > 120 ? `${text.slice(0, 119)}…` : text
}

/** `notifyOnIdle` is set only by hook turn-end and permission-wait: the event
 *  is authoritative, so a resulting flip to waitingForInput notifies
 *  immediately (commit no-ops when the state didn't actually change, so only
 *  the running→waiting edge fires). `permissionBody` rides along for the
 *  permission variant. */
function recompute(terminalId: string, notifyOnIdle = false, permissionBody?: string): void {
  const t = trackers.get(terminalId)
  if (!t || !started) return

  const raw = resolveAgentState({
    present: t.present,
    wasPresent: t.wasPresent,
    active: effectiveActive(t),
  })
  commit(terminalId, raw, notifyOnIdle, permissionBody)
}

/** A normalized agent-hook event arrived for a terminal this window owns. */
export function noteAgentHookEvent(event: AgentHookEvent): void {
  const t = trackerFor(event.terminalId)
  t.hookObserved = true
  switch (event.kind) {
    case 'turn-start':
      t.sessionId = event.sessionId
      t.hookTurnActive = true
      t.hookPermissionWait = false
      recompute(event.terminalId)
      break
    case 'turn-resume':
      // A permission reply arrived or a tool completed — either way the turn
      // is in flight. Idempotent and silent.
      t.hookTurnActive = true
      t.hookPermissionWait = false
      recompute(event.terminalId)
      break
    case 'turn-end':
      // Also lands after a DENIED permission: state is already waiting then,
      // so commit's transition gate swallows the would-be second notification.
      t.hookTurnActive = false
      t.hookPermissionWait = false
      recompute(event.terminalId, true)
      break
    case 'session-end':
      // Like turn-end for state (the process may keep running after /clear),
      // but silent — only a genuine turn end notifies.
      t.hookTurnActive = false
      t.hookPermissionWait = false
      recompute(event.terminalId)
      break
    case 'session-start':
      // Codex defers SessionStart until the first prompt and delivers it on a
      // separate hook post from UserPromptSubmit. If the prompt event won that
      // race, a SessionStart for the SAME session is only identity
      // confirmation; resetting it would flicker a running turn back to
      // waitingForInput. A genuinely new session (e.g. /clear) still starts
      // idle.
      if (t.sessionId === event.sessionId && t.hookTurnActive) break
      t.sessionId = event.sessionId
      t.hookTurnActive = false
      t.hookPermissionWait = false
      recompute(event.terminalId)
      break
    case 'permission-wait':
      // Mid-turn block on the user's approval: show waiting NOW and say what
      // is blocked. If the event races ahead of the first presence tick the
      // notification is skipped with the state change (same pre-presence
      // semantics as every other hook event); the model needs seconds to
      // reach a tool call, so in practice presence always lands first.
      t.hookPermissionWait = true
      recompute(event.terminalId, true, permissionBodyFor(event))
      break
  }
}

/** The user submitted a response while the CLI was parked on a permission
 *  prompt. Claude, Codex, and Grok do not expose an "approval answered" hook:
 *  their next hook is PostToolUse, after the approved tool has FINISHED. The
 *  terminal Enter is therefore the earliest truthful resume edge. A denial
 *  also resumes the agent while it processes that answer, before its Stop. */
export function noteAgentInputSubmitted(terminalId: string): void {
  const t = trackers.get(terminalId)
  if (!t) return
  if (t.hookPermissionWait) {
    t.hookTurnActive = true
    t.hookPermissionWait = false
    recompute(terminalId)
    return
  }
  // Aider has no lifecycle hooks. Enter is the earliest truthful signal that
  // its visible prompt was submitted; the next screen sample can settle it
  // back to waiting if the CLI rejects an empty/invalid answer.
  if (!t.hookObserved && t.fallbackPresent) {
    t.fallbackScreenState = 'running'
    recompute(terminalId)
  }
}

/** Main's scan reported whether the hook-registered agent pid is alive. The
 *  agent name is written to statusStore by the caller (useProcessMonitor)
 *  BEFORE this runs, so commit reads a current name. */
export function noteAgentPresence(terminalId: string, present: boolean): void {
  const t = trackerFor(terminalId)
  t.hookPresent = present
  reconcilePresence(t)
  recompute(terminalId)
}

/**
 * Main's process scan (or a trusted Cate-owned launch) identified the
 * foreground agent. Only registry entries with `screenFallback` participate;
 * hook-capable CLIs remain invisible here until their structured channel
 * speaks. Passing null clears the fallback and supplies the finished edge.
 */
export function noteAgentProcess(terminalId: string, agentId: AgentId | null): void {
  const t = trackerFor(terminalId)
  const nextAgentId = screenFallbackAgent(agentId)
  if (nextAgentId !== t.fallbackAgentId) t.fallbackScreenState = null
  t.fallbackAgentId = nextAgentId
  t.fallbackPresent = nextAgentId !== null
  reconcilePresence(t)
  recompute(terminalId)
}

/** Feed a status-only sample from the active xterm viewport into the fallback. */
export function noteAgentScreenSnapshot(terminalId: string, screenText: string): void {
  const t = trackers.get(terminalId)
  if (!t || t.hookObserved || !t.fallbackAgentId) return
  const nextState = resolveAgentScreenState(screenText, t.fallbackAgentId)
  if (!nextState || nextState === t.fallbackScreenState) return
  t.fallbackScreenState = nextState
  recompute(terminalId)
}

/** Drop a terminal's tracker (wire into statusStore.unregisterTerminal). */
export function forgetAgentTracker(terminalId: string): void {
  trackers.delete(terminalId)
}

export function startAgentScreenDetector(): void {
  started = true
  for (const terminalId of trackers.keys()) recompute(terminalId)
}

export function stopAgentScreenDetector(): void {
  started = false
  trackers.clear()
}

export function applyRemoteAgentScreenState(terminalId: string, state: AgentState): void {
  const status = useStatusStore.getState()
  const workspaceId = workspaceIdForTerminal(terminalId)
  if (!workspaceId) return
  const agentName = status.workspaces[workspaceId]?.terminals[terminalId]?.agentName ?? null
  status.setAgentState(workspaceId, terminalId, state, agentName)
}
