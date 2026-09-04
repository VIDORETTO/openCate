import React from 'react'
import type { CanvasArrowDecoration, CanvasDecoration } from '../../shared/types'
import { useCanvasStoreContext } from '../stores/CanvasStoreContext'

const WAYPOINT_COLOR = '#f5b544'
const NOTE_COLOR = '#f5d67a'
const GROUP_COLOR = '#8b9cff'

function arrowBounds(arrow: CanvasArrowDecoration): { left: number; top: number; width: number; height: number } {
  return {
    left: Math.min(arrow.from.x, arrow.to.x),
    top: Math.min(arrow.from.y, arrow.to.y),
    width: Math.max(1, Math.abs(arrow.to.x - arrow.from.x)),
    height: Math.max(1, Math.abs(arrow.to.y - arrow.from.y)),
  }
}
function Arrow({ arrow }: { arrow: CanvasArrowDecoration }): React.ReactElement {
  const bounds = arrowBounds(arrow)
  const x1 = arrow.from.x - bounds.left
  const y1 = arrow.from.y - bounds.top
  const x2 = arrow.to.x - bounds.left
  const y2 = arrow.to.y - bounds.top
  const markerId = `canvas-arrow-${arrow.id}`
  const color = arrow.color ?? GROUP_COLOR
  return (
    <svg
      data-canvas-arrow={arrow.id}
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        overflow: 'visible',
        pointerEvents: 'none',
      }}
    >
      <defs>
        <marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L8,4 L0,8 z" fill={color} />
        </marker>
      </defs>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={2}
        strokeDasharray="7 5"
        markerEnd={`url(#${markerId})`}
        opacity={0.8}
      />
      {arrow.label && (
        <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 7} fill={color} fontSize="12" textAnchor="middle">
          {arrow.label}
        </text>
      )}
    </svg>
  )
}

function Decoration({ decoration }: { decoration: CanvasDecoration }): React.ReactElement {
  if (decoration.type === 'arrow') return <Arrow arrow={decoration} />
  if (decoration.type === 'group') {
    return (
      <div
        data-canvas-group={decoration.id}
        style={{
          position: 'absolute',
          left: decoration.origin.x,
          top: decoration.origin.y,
          width: decoration.size.width,
          height: decoration.size.height,
          border: `1px dashed ${decoration.color ?? GROUP_COLOR}`,
          borderRadius: 12,
          background: 'color-mix(in srgb, var(--surface-2) 28%, transparent)',
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${decoration.color ?? GROUP_COLOR} 18%, transparent)`,
          pointerEvents: 'none',
          zIndex: 1,
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: 12,
            top: 8,
            color: decoration.color ?? GROUP_COLOR,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.02em',
          }}
        >
          {decoration.label}
        </span>
      </div>
    )
  }
  return (
    <div
      data-canvas-note={decoration.id}
      style={{
        position: 'absolute',
        left: decoration.origin.x,
        top: decoration.origin.y,
        width: decoration.size.width,
        height: decoration.size.height,
        padding: 14,
        boxSizing: 'border-box',
        border: `1px solid color-mix(in srgb, ${decoration.color ?? NOTE_COLOR} 70%, transparent)`,
        borderRadius: 10,
        background: `color-mix(in srgb, ${decoration.color ?? NOTE_COLOR} 14%, var(--surface-2))`,
        color: 'var(--text-primary)',
        whiteSpace: 'pre-wrap',
        overflow: 'hidden',
        fontSize: 13,
        lineHeight: 1.45,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      {decoration.text}
    </div>
  )
}

/** World-space visual memory: cheap DOM for sparse annotations, groups and
 * waypoints. It has no pointer ownership; canvas/panel interaction stays above
 * it, and the geometry is transformed by the existing world layer. */
export default function CanvasMemoryLayer(): React.ReactElement {
  const waypoints = useCanvasStoreContext((state) => state.waypoints)
  const decorations = useCanvasStoreContext((state) => state.decorations)
  return (
    <div
      data-canvas-memory-layer
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 1,
        height: 1,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {decorations.filter((decoration) => decoration.type === 'group').map((decoration) => (
        <Decoration key={decoration.id} decoration={decoration} />
      ))}
      {decorations.filter((decoration) => decoration.type === 'arrow').map((decoration) => (
        <Decoration key={decoration.id} decoration={decoration} />
      ))}
      {decorations.filter((decoration) => decoration.type === 'note').map((decoration) => (
        <Decoration key={decoration.id} decoration={decoration} />
      ))}
      {waypoints.map((waypoint) => (
        <div
          key={waypoint.id}
          data-canvas-waypoint={waypoint.id}
          style={{
            position: 'absolute',
            left: waypoint.point.x - 7,
            top: waypoint.point.y - 7,
            width: 14,
            height: 14,
            borderRadius: '50% 50% 50% 0',
            transform: 'rotate(-45deg)',
            background: WAYPOINT_COLOR,
            boxShadow: `0 0 0 3px color-mix(in srgb, ${WAYPOINT_COLOR} 22%, transparent)`,
            pointerEvents: 'none',
            zIndex: 3,
          }}
          title={waypoint.name}
        >
          <span
            style={{
              position: 'absolute',
              left: 14,
              top: -9,
              transform: 'rotate(45deg)',
              color: WAYPOINT_COLOR,
              fontSize: 11,
              whiteSpace: 'nowrap',
              fontWeight: 600,
            }}
          >
            {waypoint.name}
          </span>
        </div>
      ))}
    </div>
  )
}
