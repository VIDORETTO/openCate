/** Explicit context relations for the canvas overlay.
 *
 * A relation exists only after a guarded delivery: selected evidence from a
 * known origin panel was sent to a destination agent. The overlay never infers
 * edges from scrollback, proximity, or shared worktrees.
 */

import { collectPanelIds } from './collectPanelIds'
import type { AgentContextKind, AgentContextItem } from './agentContextBus'
import type { CanvasNodeState, Point } from './types'

export const MAX_AGENT_CONTEXT_RELATIONS = 40

export interface AgentContextRelation {
  id: string
  originPanelId: string
  destPanelId: string
  kind: AgentContextKind
  title: string
  createdAt: number
}

export interface CanvasContextEdge {
  id: string
  originNodeId: string
  destNodeId: string
  kind: AgentContextKind
  title: string
  from: Point
  to: Point
}

export class AgentContextGraphError extends Error {}

function assertPanelId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AgentContextGraphError(`${label} must be a panel id`)
  }
  if (value.includes('\0')) throw new AgentContextGraphError(`${label} contains NUL`)
  return value.trim()
}

export function createAgentContextRelation(input: {
  id?: string
  originPanelId: string
  destPanelId: string
  kind: AgentContextKind
  title: string
  now?: number
}): AgentContextRelation {
  const originPanelId = assertPanelId(input.originPanelId, 'origin panel')
  const destPanelId = assertPanelId(input.destPanelId, 'destination panel')
  if (originPanelId === destPanelId) {
    throw new AgentContextGraphError('self-relation')
  }
  const id = typeof input.id === 'string' && /^[\w-]{8,}$/.test(input.id)
    ? input.id
    : `${originPanelId}>${destPanelId}:${input.kind}`
  return {
    id: id.slice(0, 240),
    originPanelId,
    destPanelId,
    kind: input.kind,
    title: input.title.replace(/\s+/g, ' ').trim().slice(0, 120) || 'Context',
    createdAt: typeof input.now === 'number' && Number.isFinite(input.now) ? input.now : Date.now(),
  }
}

/** Bounded delivery log. Newer relations replace older ones with the same id. */
export function appendAgentContextRelations(
  current: readonly AgentContextRelation[],
  incoming: readonly AgentContextRelation[],
): AgentContextRelation[] {
  const byId = new Map(current.map((relation) => [relation.id, relation]))
  for (const relation of incoming) byId.set(relation.id, relation)
  return [...byId.values()].slice(-MAX_AGENT_CONTEXT_RELATIONS)
}

export function relationsFromDelivery(input: {
  items: readonly AgentContextItem[]
  destPanelIds: readonly string[]
  now?: number
}): AgentContextRelation[] {
  const destIds = [...new Set(input.destPanelIds.map((id) => id.trim()).filter(Boolean))]
  const relations: AgentContextRelation[] = []
  for (const item of input.items) {
    const originPanelId = item.originPanelId?.trim()
    if (!originPanelId) continue
    for (const destPanelId of destIds) {
      if (destPanelId === originPanelId) continue
      relations.push(createAgentContextRelation({
        originPanelId,
        destPanelId,
        kind: item.kind,
        title: item.title,
        now: input.now,
      }))
    }
  }
  return relations
}

function nodeForPanel(
  nodes: Record<string, CanvasNodeState>,
  panelId: string,
): CanvasNodeState | undefined {
  return Object.values(nodes).find((node) => collectPanelIds(node.dockLayout).includes(panelId))
}

/** Closest points on the two node rectangles, so the edge meets the facing sides. */
export function facingEdgePoints(from: CanvasNodeState, to: CanvasNodeState): { from: Point; to: Point } {
  const a = {
    left: from.origin.x,
    right: from.origin.x + from.size.width,
    top: from.origin.y,
    bottom: from.origin.y + from.size.height,
    cx: from.origin.x + from.size.width / 2,
    cy: from.origin.y + from.size.height / 2,
  }
  const b = {
    left: to.origin.x,
    right: to.origin.x + to.size.width,
    top: to.origin.y,
    bottom: to.origin.y + to.size.height,
    cx: to.origin.x + to.size.width / 2,
    cy: to.origin.y + to.size.height / 2,
  }
  const dx = b.cx - a.cx
  const dy = b.cy - a.cy
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { from: { x: a.right, y: a.cy }, to: { x: b.left, y: b.cy } }
      : { from: { x: a.left, y: a.cy }, to: { x: b.right, y: b.cy } }
  }
  return dy >= 0
    ? { from: { x: a.cx, y: a.bottom }, to: { x: b.cx, y: b.top } }
    : { from: { x: a.cx, y: a.top }, to: { x: b.cx, y: b.bottom } }
}

export function canvasContextEdges(
  relations: readonly AgentContextRelation[],
  nodes: Record<string, CanvasNodeState>,
): CanvasContextEdge[] {
  const edges: CanvasContextEdge[] = []
  const seen = new Set<string>()
  for (const relation of relations) {
    const origin = nodeForPanel(nodes, relation.originPanelId)
    const dest = nodeForPanel(nodes, relation.destPanelId)
    if (!origin || !dest || origin.id === dest.id) continue
    const key = `${origin.id}>${dest.id}:${relation.kind}`
    if (seen.has(key)) continue
    seen.add(key)
    const points = facingEdgePoints(origin, dest)
    edges.push({
      id: relation.id,
      originNodeId: origin.id,
      destNodeId: dest.id,
      kind: relation.kind,
      title: relation.title,
      ...points,
    })
  }
  return edges
}
