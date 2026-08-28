import { describe, expect, it } from 'vitest'

import { createAgentContextItem } from './agentContextBus'
import {
  appendAgentContextRelations,
  canvasContextEdges,
  createAgentContextRelation,
  MAX_AGENT_CONTEXT_RELATIONS,
  relationsFromDelivery,
} from './agentContextGraph'
import type { CanvasNodeState } from './types'

function node(id: string, panelId: string, x: number, y: number): CanvasNodeState {
  return {
    id,
    origin: { x, y },
    size: { width: 200, height: 100 },
    zOrder: 1,
    creationIndex: 1,
    dockLayout: { type: 'tabs', id: `tabs-${id}`, panelIds: [panelId], activeIndex: 0 },
  }
}

describe('explicit agent context graph', () => {
  it('rejects self-relations and missing panel ids', () => {
    expect(() => createAgentContextRelation({
      originPanelId: 'panel-a',
      destPanelId: 'panel-a',
      kind: 'terminal-selection',
      title: 'loop',
    })).toThrow('self-relation')
    expect(() => createAgentContextRelation({
      originPanelId: '',
      destPanelId: 'panel-b',
      kind: 'note',
      title: 'empty',
    })).toThrow('origin panel')
  })

  it('creates relations only from staged items that name an origin panel', () => {
    const withOrigin = createAgentContextItem({
      id: 'term-sel-1',
      kind: 'terminal-selection',
      title: 'API selection',
      content: 'failing assertion',
      originPanelId: 'panel-a',
    })
    const note = createAgentContextItem({
      id: 'note-item-1',
      kind: 'note',
      title: 'Note',
      content: 'remember this',
    })
    const relations = relationsFromDelivery({
      items: [withOrigin, note],
      destPanelIds: ['panel-b', 'panel-a', 'panel-c'],
      now: 10,
    })
    expect(relations).toEqual([
      expect.objectContaining({
        originPanelId: 'panel-a',
        destPanelId: 'panel-b',
        kind: 'terminal-selection',
        title: 'API selection',
      }),
      expect.objectContaining({
        originPanelId: 'panel-a',
        destPanelId: 'panel-c',
        kind: 'terminal-selection',
      }),
    ])
  })

  it('keeps a bounded delivery log and replaces relations with the same id', () => {
    const first = createAgentContextRelation({
      originPanelId: 'panel-a',
      destPanelId: 'panel-b',
      kind: 'file',
      title: 'old',
      now: 1,
    })
    const next = createAgentContextRelation({
      originPanelId: 'panel-a',
      destPanelId: 'panel-b',
      kind: 'file',
      title: 'new',
      now: 2,
    })
    const extras = Array.from({ length: MAX_AGENT_CONTEXT_RELATIONS }, (_, index) => (
      createAgentContextRelation({
        originPanelId: 'origin',
        destPanelId: `dest-${index}`,
        kind: 'artifact',
        title: `extra ${index}`,
        now: index,
      })
    ))
    const replaced = appendAgentContextRelations([first], [next])
    expect(replaced).toHaveLength(1)
    expect(replaced[0].title).toBe('new')
    const overflow = appendAgentContextRelations(replaced, extras)
    expect(overflow).toHaveLength(MAX_AGENT_CONTEXT_RELATIONS)
    expect(overflow.find((relation) => relation.originPanelId === 'panel-a')).toBeUndefined()
  })

  it('draws edges only when both panels exist as distinct canvas nodes', () => {
    const relation = createAgentContextRelation({
      originPanelId: 'panel-a',
      destPanelId: 'panel-b',
      kind: 'terminal-selection',
      title: 'API selection',
    })
    const missingDest = canvasContextEdges([relation], {
      'node-a': node('node-a', 'panel-a', 0, 0),
    })
    expect(missingDest).toEqual([])

    const sameNode = canvasContextEdges([relation], {
      shared: {
        ...node('shared', 'panel-a', 0, 0),
        dockLayout: { type: 'tabs', id: 'tabs-shared', panelIds: ['panel-a', 'panel-b'], activeIndex: 0 },
      },
    })
    expect(sameNode).toEqual([])

    const edges = canvasContextEdges([relation], {
      'node-a': node('node-a', 'panel-a', 0, 0),
      'node-b': node('node-b', 'panel-b', 400, 0),
    })
    expect(edges).toEqual([
      expect.objectContaining({
        originNodeId: 'node-a',
        destNodeId: 'node-b',
        from: { x: 200, y: 50 },
        to: { x: 400, y: 50 },
      }),
    ])
  })
})
