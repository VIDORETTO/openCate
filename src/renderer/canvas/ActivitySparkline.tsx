import React from 'react'
import { useActivitySparkline } from '../hooks/useActivitySparkline'

export interface ActivitySparklineProps {
  panelId?: string
  height?: number
  width?: number
  className?: string
  style?: React.CSSProperties
}

/** Compact vertical-bar representation of recent terminal output. */
export const ActivitySparkline: React.FC<ActivitySparklineProps> = ({
  panelId,
  height = 10,
  width = 28,
  className,
  style,
}) => {
  const points = useActivitySparkline(panelId)
  const maxBytes = points.reduce((max, point) => Math.max(max, point.bytes), 0)

  return (
    <div
      data-activity-sparkline={panelId ?? ''}
      aria-hidden
      className={className}
      style={{
        alignItems: 'flex-end',
        display: 'flex',
        flexShrink: 0,
        gap: 1,
        height,
        opacity: maxBytes > 0 ? 1 : 0.3,
        width,
        ...style,
      }}
      title="Recent terminal activity"
    >
      {points.map((point, index) => {
        const intensity = maxBytes > 0 ? point.bytes / maxBytes : 0
        const opacity = point.bytes > 0 ? 0.45 + intensity * 0.55 : 0.25
        return (
          <span
            key={`${index}-${point.bytes}-${point.events}`}
            style={{
              backgroundColor: 'var(--activity-orange)',
              flex: 1,
              height: `${Math.max(12, Math.round(intensity * 100))}%`,
              minWidth: 1,
              opacity,
            }}
          />
        )
      })}
    </div>
  )
}
