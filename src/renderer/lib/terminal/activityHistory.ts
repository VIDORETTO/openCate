// =============================================================================
// activityHistory — lightweight output-activity history for terminal tiles.
//
// PTY traffic is high-frequency, so this deliberately avoids Zustand. Writers
// mutate small circular buckets; readers subscribe to immutable snapshots that
// change only on a new event or bucket rotation. This keeps an output burst
// from re-rendering the canvas while preserving a stable recent "shape".
// =============================================================================

export const ACTIVITY_BUCKET_MS = 5_000
export const ACTIVITY_HISTORY_BUCKETS = 24
const IDLE_CLEANUP_DELAY_MS = 60_000

export interface ActivitySnapshot {
  /** Bucket start timestamps, oldest → newest. */
  bucketStartedAt: number[]
  bytes: number[]
  events: number[]
  /** Epoch milliseconds of the last observed output burst; 0 means none yet. */
  lastOutputAt: number
  updatedAt: number
  version: number
}

interface ActivityBucket {
  startedAt: number
  bytes: number
  events: number
}

interface ActivityHistoryState {
  buckets: Array<ActivityBucket | undefined>
  /** Epoch milliseconds of the last output burst; 0 means none yet. */
  lastOutputAt: number
  /** Index of the oldest occupied slot (when count > 0). */
  head: number
  count: number
  snapshot: ActivitySnapshot
  listeners: Set<() => void>
  version: number
}

const histories = new Map<string, ActivityHistoryState>()
const idleCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>()
let globalTimer: ReturnType<typeof setInterval> | null = null

const EMPTY_SNAPSHOT: ActivitySnapshot = {
  bucketStartedAt: [],
  bytes: [],
  events: [],
  lastOutputAt: 0,
  updatedAt: 0,
  version: 0,
}

function emptyState(): ActivityHistoryState {
  return {
    buckets: new Array<ActivityBucket | undefined>(ACTIVITY_HISTORY_BUCKETS).fill(undefined),
    lastOutputAt: 0,
    head: 0,
    count: 0,
    snapshot: EMPTY_SNAPSHOT,
    listeners: new Set(),
    version: 0,
  }
}

function getState(panelId: string): ActivityHistoryState {
  let state = histories.get(panelId)
  if (!state) {
    state = emptyState()
    histories.set(panelId, state)
  }
  return state
}

function floorToBucket(timestamp: number): number {
  return Math.floor(timestamp / ACTIVITY_BUCKET_MS) * ACTIVITY_BUCKET_MS
}

function latestBucket(state: ActivityHistoryState): ActivityBucket | undefined {
  if (state.count === 0) return undefined
  return state.buckets[(state.head + state.count - 1) % ACTIVITY_HISTORY_BUCKETS]
}

/** Append the current bucket, evicting the oldest sample when full. */
function appendCurrentBucket(state: ActivityHistoryState, timestamp: number): ActivityBucket {
  if (state.count === ACTIVITY_HISTORY_BUCKETS) {
    state.buckets[state.head] = undefined
    state.head = (state.head + 1) % ACTIVITY_HISTORY_BUCKETS
    state.count -= 1
  }

  // A timestamp far in the past can arrive after newer samples (for example,
  // from a restored/replayed source). Never let it overwrite occupied slots.
  if (state.count >= ACTIVITY_HISTORY_BUCKETS) {
    return latestBucket(state) ?? { startedAt: floorToBucket(timestamp), bytes: 0, events: 0 }
  }

  const slot = (state.head + state.count) % ACTIVITY_HISTORY_BUCKETS
  const bucket: ActivityBucket = {
    startedAt: floorToBucket(timestamp),
    bytes: 0,
    events: 0,
  }
  state.buckets[slot] = bucket
  state.count += 1
  return bucket
}

/**
 * Ensure that time has reached the newest bucket. Gaps remain sparse rather
 * than materializing thousands of empty samples after a long sleep.
 */
function rotateToTime(state: ActivityHistoryState, timestamp: number): void {
  const latest = latestBucket(state)
  if (!latest || floorToBucket(timestamp) > latest.startedAt) {
    appendCurrentBucket(state, timestamp)
  }
}

function buildSnapshot(state: ActivityHistoryState, updatedAt: number): ActivitySnapshot {
  const ordered: ActivityBucket[] = []
  for (const bucket of state.buckets) {
    if (bucket) ordered.push(bucket)
  }
  ordered.sort((a, b) => a.startedAt - b.startedAt)

  return {
    bucketStartedAt: ordered.map((bucket) => bucket.startedAt),
    bytes: ordered.map((bucket) => bucket.bytes),
    events: ordered.map((bucket) => bucket.events),
    lastOutputAt: state.lastOutputAt,
    updatedAt,
    version: state.version,
  }
}

function publishIfChanged(state: ActivityHistoryState, timestamp: number): void {
  const previous = state.snapshot
  const next = buildSnapshot(state, timestamp)
  const unchanged =
    previous.bytes.length === next.bytes.length &&
    previous.updatedAt !== 0 &&
    timestamp - previous.updatedAt < ACTIVITY_BUCKET_MS &&
    previous.bytes.every((value, index) => value === next.bytes[index]) &&
    previous.events.every((value, index) => value === next.events[index]) &&
    previous.lastOutputAt === next.lastOutputAt

  if (unchanged) return

  state.version += 1
  next.version = state.version
  state.snapshot = next
  for (const listener of state.listeners) listener()
}

/** Record one output burst. Byte length provides intensity; events provide diagnostics. */
export function noteTerminalActivity(
  panelId: string,
  byteLength = 1,
  timestamp = Date.now(),
): void {
  const safeBytes = Number.isFinite(byteLength) ? Math.max(0, Math.floor(byteLength)) : 0
  if (safeBytes === 0) return

  const state = getState(panelId)
  rotateToTime(state, timestamp)
  state.lastOutputAt = timestamp
  const bucket = latestBucket(state)
  if (!bucket) return

  bucket.bytes += safeBytes
  bucket.events += 1
  publishIfChanged(state, timestamp)
}

/** External-store subscription used by useSyncExternalStore consumers. */
export function subscribeActivity(panelId: string, listener: () => void): () => void {
  const state = getState(panelId)
  state.listeners.add(listener)
  ensureTicker()

  return () => {
    state.listeners.delete(listener)
    maybeStopTicker()
    if (state.listeners.size === 0) scheduleIdleCleanup(panelId)
  }
}

export function getActivitySnapshot(panelId: string): ActivitySnapshot {
  return histories.get(panelId)?.snapshot ?? EMPTY_SNAPSHOT
}

/** Last observed output time without subscribing or creating a history. */
export function getLastTerminalActivity(panelId: string): number | undefined {
  const timestamp = histories.get(panelId)?.lastOutputAt ?? 0
  return timestamp > 0 ? timestamp : undefined
}

/** Remove history when a terminal is disposed (or its last reader goes away). */
export function clearActivityHistory(panelId: string): void {
  const pendingCleanup = idleCleanupTimers.get(panelId)
  if (pendingCleanup) {
    clearTimeout(pendingCleanup)
    idleCleanupTimers.delete(panelId)
  }

  const state = histories.get(panelId)
  if (!state) return
  for (const listener of [...state.listeners]) listener()
  histories.delete(panelId)
}

function tick(): void {
  const timestamp = Date.now()
  for (const [panelId, state] of histories) {
    if (state.listeners.size > 0) {
      rotateToTime(state, timestamp)
      publishIfChanged(state, timestamp)
    } else {
      scheduleIdleCleanup(panelId)
    }
  }
}

function ensureTicker(): void {
  if (globalTimer) return
  globalTimer = setInterval(tick, ACTIVITY_BUCKET_MS)
  if (typeof globalTimer.unref === 'function') globalTimer.unref()
}

function maybeStopTicker(): boolean {
  if (globalTimer === null) return false
  for (const state of histories.values()) {
    if (state.listeners.size > 0) return false
  }

  clearInterval(globalTimer)
  globalTimer = null
  return true
}

function scheduleIdleCleanup(panelId: string): void {
  if (idleCleanupTimers.has(panelId)) return
  const timer = setTimeout(() => {
    idleCleanupTimers.delete(panelId)
    const state = histories.get(panelId)
    if (state?.listeners.size === 0) histories.delete(panelId)
  }, IDLE_CLEANUP_DELAY_MS)
  if (typeof timer.unref === 'function') timer.unref()
  idleCleanupTimers.set(panelId, timer)
}

/** Isolate module-singleton state between Vitest cases. */
export function resetActivityHistoriesForTests(): void {
  for (const timer of idleCleanupTimers.values()) clearTimeout(timer)
  idleCleanupTimers.clear()
  for (const panelId of [...histories.keys()]) clearActivityHistory(panelId)
  if (globalTimer !== null) {
    clearInterval(globalTimer)
    globalTimer = null
  }
}
