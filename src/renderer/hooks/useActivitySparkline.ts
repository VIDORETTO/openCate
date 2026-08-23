import { useCallback, useMemo, useSyncExternalStore } from 'react'
import {
  type ActivitySnapshot,
  getActivitySnapshot,
  subscribeActivity,
} from '../lib/terminal/activityHistory'

export interface ActivityPoint {
  bytes: number
  events: number
}

const EMPTY_POINTS: ActivityPoint[] = []
const EMPTY_SNAPSHOT: ActivitySnapshot = {
  bucketStartedAt: [],
  bytes: [],
  events: [],
  lastOutputAt: 0,
  updatedAt: 0,
  version: 0,
}

/** Convert parallel immutable snapshot arrays into one render-stable series. */
export function normalizeActivityPoints(bytes: number[], events: number[]): ActivityPoint[] {
  const length = Math.min(bytes.length, events.length)
  if (length === 0) return EMPTY_POINTS

  const points = new Array<ActivityPoint>(length)
  for (let index = 0; index < length; index += 1) {
    points[index] = { bytes: bytes[index], events: events[index] }
  }
  return points
}

/**
 * Recent terminal-output history, oldest → newest. Values are raw byte counts;
 * visual components normalize against the recent maximum.
 */
export function useActivitySparkline(panelId: string | undefined): ActivityPoint[] {
  const subscribe = useCallback(
    (onStoreChange: () => void) => (
      panelId ? subscribeActivity(panelId, onStoreChange) : () => {}
    ),
    [panelId],
  )
  const getSnapshot = useCallback(
    () => (panelId ? getActivitySnapshot(panelId) : EMPTY_SNAPSHOT),
    [panelId],
  )
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  return useMemo(
    () => normalizeActivityPoints(snapshot.bytes, snapshot.events),
    [snapshot],
  )
}

export function useLastTerminalActivity(panelId: string | undefined): number | undefined {
  const subscribe = useCallback(
    (onStoreChange: () => void) => (
      panelId ? subscribeActivity(panelId, onStoreChange) : () => {}
    ),
    [panelId],
  )
  const getSnapshot = useCallback(
    () => (panelId ? getActivitySnapshot(panelId) : EMPTY_SNAPSHOT),
    [panelId],
  )
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return snapshot.lastOutputAt > 0 ? snapshot.lastOutputAt : undefined
}
