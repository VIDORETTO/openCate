import { create } from 'zustand'

import type { AgentContextItem } from '../../../shared/agentContextBus'
import {
  appendAgentContextRelations,
  relationsFromDelivery,
  type AgentContextRelation,
} from '../../../shared/agentContextGraph'

interface AgentContextGraphStore {
  relations: readonly AgentContextRelation[]
  recordDelivery: (items: readonly AgentContextItem[], destPanelIds: readonly string[]) => void
  clear: () => void
}

/** Window-local delivery log for explicit context edges. Relations exist only
 * after a guarded follow-up succeeds; the overlay never infers them. */
export const useAgentContextGraphStore = create<AgentContextGraphStore>((set) => ({
  relations: [],
  recordDelivery(items, destPanelIds) {
    const incoming = relationsFromDelivery({ items, destPanelIds })
    if (incoming.length === 0) return
    set((state) => ({ relations: appendAgentContextRelations(state.relations, incoming) }))
  },
  clear() {
    set({ relations: [] })
  },
}))
