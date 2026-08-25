// Coding-agent usage bridge — turns structured hook payloads into durable
// mission observations. Terminal text is intentionally not parsed here: a
// spinner or an agent-authored sentence is not reliable accounting data.

import type { AgentHookEvent } from '../../../shared/agentHooks'
import {
  extractToolCallFromHook,
  mergeCodingAgentUsage,
  mergeCodingAgentActivity,
  normalizeCodingAgentUsage,
} from '../../../shared/codingAgentRuns'
import { useAppStore } from '../../stores/appStore'
import { terminalRegistry } from '../terminal/terminalRegistry'

function applyCodingAgentHookObservation(
  event: AgentHookEvent,
  apply: (run: any, observedAt: number) => any,
): void {
  const panelId = terminalRegistry.panelIdForPty(event.terminalId)
  if (!panelId) return

  const state = useAppStore.getState()
  for (const workspace of state.workspaces) {
    const panel = workspace.panels[panelId]
    const run = panel?.codingAgentRun
    if (!run || run.agentId !== event.agentId) continue
    const next = apply(run, Date.now())
    if (next) state.setPanelCodingAgentRun(workspace.id, panelId, { ...run, ...next })
    return
  }
}

/** Apply usage from a hook event to the mission that owns its PTY. The event
 * may be delivered in a detached window, so resolve the panel through the
 * terminal registry rather than assuming the selected workspace. */
export function noteCodingAgentUsageEvent(event: AgentHookEvent): void {
  const usage = normalizeCodingAgentUsage(event.raw)
  if (!usage) return
  applyCodingAgentHookObservation(event, (_run, observedAt) => ({
    usage: mergeCodingAgentUsage(_run.usage, { ...usage, observedAt }),
  }))
}

/** Apply PostToolUse activity to the owning mission. This is the same trusted,
 * structured stream as usage — terminal text is never parsed into tool facts. */
export function noteCodingAgentActivityEvent(event: AgentHookEvent): void {
  if (event.kind !== 'turn-resume') return
  const activity = extractToolCallFromHook(event.raw)
  if (!activity) return
  applyCodingAgentHookObservation(event, (run, observedAt) => {
    const merged = mergeCodingAgentActivity(run, {
      ...activity,
      observedAt,
    })
    // Avoid churn when an out-of-order duplicate arrives.
    return run.lastToolCall?.observedAt === merged.lastToolCall?.observedAt &&
      run.filesTouched === merged.filesTouched
      ? null
      : merged
  })
}
