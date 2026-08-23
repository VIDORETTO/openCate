import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACTIVITY_BUCKET_MS,
  ACTIVITY_HISTORY_BUCKETS,
  clearActivityHistory,
  getActivitySnapshot,
  noteTerminalActivity,
  resetActivityHistoriesForTests,
  subscribeActivity,
} from './activityHistory'

const BASE_TIME = 1_770_000_000_000

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(BASE_TIME)
  resetActivityHistoriesForTests()
})

afterEach(() => {
  resetActivityHistoriesForTests()
  vi.useRealTimers()
})

describe('terminal activity history', () => {
  it('aggregates output bursts inside the same time bucket', () => {
    noteTerminalActivity('p1', 12, BASE_TIME)
    noteTerminalActivity('p1', 8, BASE_TIME + ACTIVITY_BUCKET_MS - 1)

    const snapshot = getActivitySnapshot('p1')
    expect(snapshot.bytes).toEqual([20])
    expect(snapshot.events).toEqual([2])
    expect(snapshot.bucketStartedAt).toEqual([BASE_TIME])
  })

  it('creates chronological buckets and keeps the circular buffer bounded', () => {
    for (let index = 0; index < ACTIVITY_HISTORY_BUCKETS + 6; index += 1) {
      noteTerminalActivity('p1', index + 1, BASE_TIME + index * ACTIVITY_BUCKET_MS)
    }

    const snapshot = getActivitySnapshot('p1')
    expect(snapshot.bytes).toHaveLength(ACTIVITY_HISTORY_BUCKETS)
    // The six oldest samples were evicted; the newest sample remains last.
    expect(snapshot.bytes.at(-1)).toBe(ACTIVITY_HISTORY_BUCKETS + 6)
    expect(snapshot.bytes.at(0)).toBe(7)
    expect(snapshot.bucketStartedAt[0]).toBe(BASE_TIME + 6 * ACTIVITY_BUCKET_MS)
    for (let index = 1; index < snapshot.bucketStartedAt.length; index += 1) {
      expect(snapshot.bucketStartedAt[index]).toBe(
        snapshot.bucketStartedAt[index - 1] + ACTIVITY_BUCKET_MS,
      )
    }
  })

  it('notifies subscribers for new activity and periodic idle rotation', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeActivity('p1', listener)

    actExternally(() => noteTerminalActivity('p1', 3))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getActivitySnapshot('p1').bytes).toEqual([3])

    // The ticker publishes an all-zero newest bucket once time crosses the
    // boundary — this is what lets an active sparkline visibly decay.
    vi.advanceTimersByTime(ACTIVITY_BUCKET_MS)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(getActivitySnapshot('p1').bytes).toEqual([3, 0])

    unsubscribe()
  })

  it('clears a disposed terminal history and notifies remaining readers', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeActivity('p1', listener)
    noteTerminalActivity('p1', 5)
    listener.mockClear()

    clearActivityHistory('p1')

    expect(getActivitySnapshot('p1').bytes).toEqual([])
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
})

/** Make an external-store mutation explicit for React/useSyncExternalStore tests. */
function actExternally(fn: () => void): void {
  fn()
}
