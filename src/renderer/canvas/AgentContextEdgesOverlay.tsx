import React, { useMemo } from 'react'

import { canvasContextEdges } from '../../shared/agentContextGraph'
import type { AgentContextKind } from '../../shared/agentContextBus'
import { useAgentContextGraphStore } from '../lib/agent/agentContextGraphStore'
import { useCanvasStoreContext } from '../stores/CanvasStoreContext'

const KIND_STROKE: Record<AgentContextKind, string> = {
  'terminal-selection': 'rgba(74, 158, 255, 0.9)',
  file: 'rgba(74, 158, 255, 0.75)',
  diff: 'rgba(232, 140, 48, 0.9)',
  note: 'rgba(148, 148, 160, 0.85)',
  artifact: 'rgba(148, 148, 160, 0.85)',
}

/** World-space overlay of explicit context deliveries. Edges exist only after a
 *  guarded follow-up; this layer never infers relations from layout or scrollback. */
const AgentContextEdgesOverlay: React.FC = () => {
  const relations = useAgentContextGraphStore((state) => state.relations)
  const nodes = useCanvasStoreContext((state) => state.nodes)
  const edges = useMemo(() => canvasContextEdges(relations, nodes), [nodes, relations])

  if (edges.length === 0) return null

  return (
    <svg
      aria-hidden
      data-agent-context-edges
      style={{
        height: 1,
        left: 0,
        overflow: 'visible',
        pointerEvents: 'none',
        position: 'absolute',
        top: 0,
        width: 1,
        zIndex: 500,
      }}
    >
      <defs>
        <marker id="agent-context-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="8" refY="4">
          <path d="M0,0 L8,4 L0,8 Z" fill="rgba(74, 158, 255, 0.9)" />
        </marker>
      </defs>
      {edges.map((edge) => {
        const stroke = KIND_STROKE[edge.kind]
        const midX = (edge.from.x + edge.to.x) / 2
        const midY = (edge.from.y + edge.to.y) / 2
        return (
          <g key={edge.id} data-context-edge={edge.id} data-context-kind={edge.kind}>
            <line
              markerEnd="url(#agent-context-arrow)"
              stroke={stroke}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              x1={edge.from.x}
              x2={edge.to.x}
              y1={edge.from.y}
              y2={edge.to.y}
            />
            <text
              fill={stroke}
              fontSize={10}
              paintOrder="stroke"
              stroke="rgba(20, 20, 24, 0.75)"
              strokeWidth={3}
              textAnchor="middle"
              x={midX}
              y={midY - 6}
            >
              {edge.title}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default AgentContextEdgesOverlay
