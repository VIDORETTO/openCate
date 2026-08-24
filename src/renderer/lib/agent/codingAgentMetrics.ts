// Coding-agent usage bridge — turns structured hook payloads into durable
// mission observations. Terminal text is intentionally not parsed here: a
// spinner or an agent-authored sentence is not reliable accounting data.

import type { AgentHookEvent } from '../../../shared/agentHooks'
import {
  mergeCodingAgentUsage,
  normalizeCodingAgentUsage,
} from '../../../shared/codingAgentRuns'
import { useAppStore } from '../../stores/appStore'
import { terminalRegistry } from '../terminal/terminalRegistry'

/** Apply usage from a hook event to the mission that owns its PTY. The event
 * may be delivered in a detached window, so resolve the panel through the
 * terminal registry rather than assuming the selected workspace. */
export function noteCodingAgentUsageEvent(event: AgentHookEvent): void {
  const usage = normalizeCodingAgentUsage(event.raw)
  if (!usage) return

  const panelId = terminalRegistry.panelIdForPty(event.terminalId)
  if (!panelId) return

  const state = useAppStore.getState()
  for (const workspace of state.workspaces) {
    const panel = workspace.panels[panelId]
    const run = panel?.codingAgentRun
    if (!run || run.agentId !== event.agentId) continue
    state.setPanelCodingAgentRun(workspace.id, panelId, {
      ...run,
      usage: mergeCodingAgentUsage(run.usage, usage),
    })
    return
  }
}
