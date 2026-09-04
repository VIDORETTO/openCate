import type { PanelType, Size } from '../../shared/types'
import {
  panelSizePreferenceKey,
  sanitizePanelSizePreference,
  type PanelSizeContext,
} from '../../shared/panels'
import { useSettingsStore } from '../stores/settingsStore'

/** Persist a size only after an intentional resize gesture. Creation and
 * restore paths call the shared resolver, so this helper never changes an
 * existing node while a session is being restored. */
export function rememberPanelSize(
  type: PanelType,
  size: Size,
  context: PanelSizeContext,
): void {
  const normalized = sanitizePanelSizePreference(type, size)
  if (!normalized) return

  const key = context.agentId
    ? panelSizePreferenceKey('agent', type, context.agentId)
    : context.worktreeId
      ? panelSizePreferenceKey('worktree', type, context.worktreeId)
      : context.workspaceId
        ? panelSizePreferenceKey('workspace', type, context.workspaceId)
        : panelSizePreferenceKey('type', type)
  const settings = useSettingsStore.getState()
  const current = settings.panelSizePreferences ?? {}
  const previous = current[key]
  if (previous?.width === normalized.width && previous.height === normalized.height) return
  settings.setSetting('panelSizePreferences', { ...current, [key]: normalized })
}
