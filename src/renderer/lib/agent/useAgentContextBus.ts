import { useCallback, useMemo, useState } from 'react'

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

  return { items, prompt, error, stage, remove, clear }
}
