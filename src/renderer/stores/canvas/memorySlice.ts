import type {
  CanvasDecoration,
  CanvasLayoutHistoryEntry,
  CanvasMemorySnapshot,
  CanvasNodeState,
  CanvasWaypoint,
  Point,
} from '../../../shared/types'
import { ZOOM_MAX, ZOOM_MIN } from '../../../shared/types'
import type { CanvasGet, CanvasSet, CanvasStoreActions } from './storeTypes'
import { generateId } from './helpers'
import { sanitizeLoadedCanvasNodes } from './sanitizeNodes'

const MAX_WAYPOINTS = 100
const MAX_DECORATIONS = 200
const MAX_LAYOUT_HISTORY = 24
const MAX_TEXT = 4000
const MAX_LABEL = 160

type MemoryActions = Pick<
  CanvasStoreActions,
  | 'addWaypoint'
  | 'removeWaypoint'
  | 'jumpToWaypoint'
  | 'addNoteDecoration'
  | 'addArrowDecoration'
  | 'addGroupDecoration'
  | 'removeDecoration'
  | 'saveLayoutSnapshot'
  | 'restoreLayoutSnapshot'
  | 'removeLayoutSnapshot'
>

function finitePoint(value: unknown): value is Point {
  if (!value || typeof value !== 'object') return false
  const point = value as Record<string, unknown>
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text ? text.slice(0, max) : null
}

function copyNode(node: CanvasNodeState): CanvasNodeState {
  return {
    ...node,
    origin: { ...node.origin },
    size: { ...node.size },
  }
}

function copyNodes(nodes: Record<string, CanvasNodeState>): Record<string, CanvasNodeState> {
  return Object.fromEntries(Object.entries(nodes).map(([id, node]) => [id, copyNode(node)]))
}

function validDecoration(value: unknown): value is CanvasDecoration {
  if (!value || typeof value !== 'object') return false
  const decoration = value as Record<string, unknown>
  if (typeof decoration.id !== 'string' || !decoration.id) return false
  if (decoration.type === 'note' || decoration.type === 'group') {
    const origin = decoration.origin as Record<string, unknown> | undefined
    const size = decoration.size as Record<string, unknown> | undefined
    const hasGeometry = finitePoint(origin)
      && !!size
      && typeof size.width === 'number'
      && typeof size.height === 'number'
      && Number.isFinite(size.width)
      && Number.isFinite(size.height)
      && size.width > 0
      && size.height > 0
    return hasGeometry && (decoration.type === 'note'
      ? typeof decoration.text === 'string'
      : typeof decoration.label === 'string')
  }
  if (decoration.type === 'arrow') return finitePoint(decoration.from) && finitePoint(decoration.to)
  return false
}

/** Defensive projection for `.cate` data and detached-window payloads. */
export function sanitizeCanvasMemory(memory: CanvasMemorySnapshot | undefined): {
  waypoints: CanvasWaypoint[]
  decorations: CanvasDecoration[]
  layoutHistory: CanvasLayoutHistoryEntry[]
} {
  const waypoints = Array.isArray(memory?.waypoints)
    ? memory.waypoints.flatMap((waypoint) => {
        const name = boundedText(waypoint?.name, MAX_LABEL)
        if (!name || !finitePoint(waypoint?.point)) return []
        return [{
          id: typeof waypoint.id === 'string' && waypoint.id ? waypoint.id : generateId(),
          name,
          point: { ...waypoint.point },
          createdAt: Number.isFinite(waypoint.createdAt) ? waypoint.createdAt : Date.now(),
        }]
      }).slice(-MAX_WAYPOINTS)
    : []

  const decorations = Array.isArray(memory?.decorations)
    ? memory.decorations.filter(validDecoration).slice(-MAX_DECORATIONS).map((decoration) => ({
        ...decoration,
        ...(decoration.type === 'note' || decoration.type === 'group'
          ? { origin: { ...decoration.origin }, size: { ...decoration.size } }
          : { from: { ...decoration.from }, to: { ...decoration.to } }),
        ...(decoration.type === 'group' && decoration.nodeIds
          ? { nodeIds: [...decoration.nodeIds] }
          : {}),
      }))
    : []

  const layoutHistory = Array.isArray(memory?.layoutHistory)
    ? memory.layoutHistory.flatMap((entry) => {
        const name = boundedText(entry?.name, MAX_LABEL)
        if (!name || !entry || typeof entry.id !== 'string' || !finitePoint(entry.viewportOffset)) return []
        if (!Number.isFinite(entry.zoomLevel)) return []
        if (!entry.nodes || typeof entry.nodes !== 'object') return []
        const sanitized = sanitizeLoadedCanvasNodes(entry.nodes as Record<string, unknown>)
        return [{
          id: entry.id,
          name,
          createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now(),
          nodes: sanitized.nodes,
          zoomLevel: Math.min(Math.max(entry.zoomLevel, ZOOM_MIN), ZOOM_MAX),
          viewportOffset: { ...entry.viewportOffset },
        }]
      }).slice(-MAX_LAYOUT_HISTORY)
    : []

  return { waypoints, decorations, layoutHistory }
}

function appendDecoration(get: CanvasGet, set: CanvasSet, decoration: CanvasDecoration): string {
  const current = get().decorations
  set({ decorations: [...current, decoration].slice(-MAX_DECORATIONS) })
  return decoration.id
}

function selectedBounds(get: CanvasGet): { origin: Point; size: { width: number; height: number }; nodeIds: string[] } | null {
  const selected = get().selection.flatMap((id) => get().nodes[id] ? [get().nodes[id]] : [])
  if (selected.length === 0) return null
  const left = Math.min(...selected.map((node) => node.origin.x))
  const top = Math.min(...selected.map((node) => node.origin.y))
  const right = Math.max(...selected.map((node) => node.origin.x + node.size.width))
  const bottom = Math.max(...selected.map((node) => node.origin.y + node.size.height))
  const padding = 32
  return {
    origin: { x: left - padding, y: top - padding - 24 },
    size: { width: Math.max(160, right - left + padding * 2), height: Math.max(120, bottom - top + padding * 2 + 24) },
    nodeIds: selected.map((node) => node.id),
  }
}

export function createMemorySlice(set: CanvasSet, get: CanvasGet): MemoryActions {
  return {
    addWaypoint(name, point) {
      const normalizedName = boundedText(name, MAX_LABEL)
      if (!normalizedName || !finitePoint(point)) return null
      const existing = get().waypoints.find((waypoint) => waypoint.name.toLowerCase() === normalizedName.toLowerCase())
      const waypoint: CanvasWaypoint = {
        id: existing?.id ?? generateId(),
        name: normalizedName,
        point: { ...point },
        createdAt: Date.now(),
      }
      set({ waypoints: [...get().waypoints.filter((item) => item.id !== waypoint.id), waypoint].slice(-MAX_WAYPOINTS) })
      return waypoint.id
    },

    removeWaypoint(id) {
      set((state) => ({ waypoints: state.waypoints.filter((waypoint) => waypoint.id !== id) }))
    },

    jumpToWaypoint(id) {
      const waypoint = get().waypoints.find((item) => item.id === id)
      if (!waypoint) return false
      const { zoomLevel, containerSize } = get()
      set({
        viewportOffset: {
          x: containerSize.width / 2 - waypoint.point.x * zoomLevel,
          y: containerSize.height / 2 - waypoint.point.y * zoomLevel,
        },
        suppressAutoFocus: true,
      })
      return true
    },

    addNoteDecoration(text, point) {
      const normalizedText = boundedText(text, MAX_TEXT)
      if (!normalizedText || !finitePoint(point)) return null
      return appendDecoration(get, set, {
        id: generateId(),
        type: 'note',
        origin: { ...point },
        size: { width: 280, height: 160 },
        text: normalizedText,
      })
    },

    addArrowDecoration(from, to, label) {
      if (!finitePoint(from) || !finitePoint(to)) return null
      return appendDecoration(get, set, {
        id: generateId(),
        type: 'arrow',
        from: { ...from },
        to: { ...to },
        ...(boundedText(label, MAX_LABEL) ? { label: boundedText(label, MAX_LABEL)! } : {}),
      })
    },

    addGroupDecoration(label, point) {
      const normalizedLabel = boundedText(label, MAX_LABEL)
      if (!normalizedLabel) return null
      const bounds = selectedBounds(get)
      return appendDecoration(get, set, {
        id: generateId(),
        type: 'group',
        origin: bounds?.origin ?? { x: (point?.x ?? 0) - 240, y: (point?.y ?? 0) - 150 },
        size: bounds?.size ?? { width: 480, height: 300 },
        label: normalizedLabel,
        ...(bounds?.nodeIds ? { nodeIds: bounds.nodeIds } : {}),
      })
    },

    removeDecoration(id) {
      set((state) => ({ decorations: state.decorations.filter((decoration) => decoration.id !== id) }))
    },

    saveLayoutSnapshot(name) {
      const normalizedName = boundedText(name, MAX_LABEL)
      if (!normalizedName) return null
      const state = get()
      const existing = state.layoutHistory.find((entry) => entry.name.toLowerCase() === normalizedName.toLowerCase())
      const entry: CanvasLayoutHistoryEntry = {
        id: existing?.id ?? generateId(),
        name: normalizedName,
        createdAt: Date.now(),
        nodes: copyNodes(state.nodes),
        zoomLevel: state.zoomLevel,
        viewportOffset: { ...state.viewportOffset },
      }
      set({ layoutHistory: [...state.layoutHistory.filter((item) => item.id !== entry.id), entry].slice(-MAX_LAYOUT_HISTORY) })
      return entry.id
    },

    restoreLayoutSnapshot(id) {
      const entry = get().layoutHistory.find((item) => item.id === id)
      if (!entry) return false
      const nodes = copyNodes(entry.nodes)
      const nodeList = Object.values(nodes)
      set({
        nodes,
        viewportOffset: { ...entry.viewportOffset },
        zoomLevel: Math.min(Math.max(entry.zoomLevel, ZOOM_MIN), ZOOM_MAX),
        selection: [],
        selectionActive: false,
        nodeActiveWorktreeId: {},
        nextZOrder: nodeList.reduce((max, node) => Math.max(max, node.zOrder), -1) + 1,
        nextCreationIndex: nodeList.reduce((max, node) => Math.max(max, node.creationIndex), -1) + 1,
        history: [],
        future: [],
        pendingPlacement: null,
      })
      return true
    },

    removeLayoutSnapshot(id) {
      set((state) => ({ layoutHistory: state.layoutHistory.filter((entry) => entry.id !== id) }))
    },
  }
}
