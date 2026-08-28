import { useCallback, useMemo, useState } from 'react'

import { getEntry } from '../terminal/registryState'

import {
  appendAgentContextItems,
  createAgentContextItem,
  formatAgentContextForPrompt,
  type AgentContextItem,
} from '../../../shared/agentContextBus'

/** Local staging queue for explicit context. It intentionally does not persist
 * or cross windows yet: a selected item is captured once, and the user sends it
 * through the existing guarded follow-up composer in the same surface. */
export function useAgentContextBus() {
  const [items, setItems] = useState<readonly AgentContextItem[]>([])
  const [error, setError] = useState<string | null>(null)

  const stage = useCallback((input: Parameters<typeof createAgentContextItem>[0]) => {
    try {
      const item = createAgentContextItem(input)
      setError(null)
      setItems((current) => appendAgentContextItems(current, [item]))
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'context-invalid')
      return false
    }
  }, [])

  const remove = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id))
    setError(null)
  }, [])

  const clear = useCallback(() => {
    setItems([])
    setError(null)
  }, [])

  const prompt = useMemo(() => formatAgentContextForPrompt(items), [items])

  const stageTerminalSelection = useCallback((panelId: string, title: string): boolean => {
    const entry = getEntry(panelId)
    if (!entry) {
      setError('terminal-not-ready')
      return false
    }
    if (!entry.terminal.hasSelection()) {
      setError('no-terminal-selection')
      return false
    }
    const content = entry.terminal.getSelection()
    if (!content.trim()) {
      setError('no-terminal-selection')
      return false
    }
    const staged = stage({
      id: `${panelId}:${content}`,
      kind: 'terminal-selection',
      title,
      source: title,
      originPanelId: panelId,
      content,
    })
    if (staged) {
      entry.terminal.clearSelection()
      return true
    }
    return false
  }, [stage])

  const stageWorkspaceFile = useCallback(async (
    workspaceId: string,
    filePath: string,
    displayPath?: string,
  ): Promise<boolean> => {
    try {
      const content = await window.electronAPI.fsReadFile(filePath, workspaceId)
      const source = displayPath || filePath
      return stage({ kind: 'file', title: source.split(/[\\/]/).pop() || source, source, content })
    } catch {
      setError('workspace-file-unavailable')
      return false
    }
  }, [stage])

  const stageWorktreeDiff = useCallback(async (
    worktreePath: string,
    baseBranch: string,
    diff: string,
  ): Promise<boolean> => stage({
    kind: 'diff',
    title: `Diff ${worktreePath.split(/[\\/]/).pop() || worktreePath}`,
    source: `${baseBranch}..working`,
    content: diff,
  }), [stage])

  return {
    items,
    prompt,
    error,
    stage,
    remove,
    clear,
    stageTerminalSelection,
    stageWorkspaceFile,
    stageWorktreeDiff,
  }
}
