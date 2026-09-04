import { describe, expect, it } from 'vitest'
import { createCanvasStore } from '../canvasStore'

describe('canvas spatial memory', () => {
  it('stores named waypoints and jumps the viewport to one', () => {
    const store = createCanvasStore()
    store.getState().setContainerSize({ width: 1000, height: 600 })
    const id = store.getState().addWaypoint('Agents', { x: 400, y: 250 })

    expect(id).toBeTruthy()
    expect(store.getState().waypoints[0].name).toBe('Agents')
    expect(store.getState().jumpToWaypoint(id!)).toBe(true)
    expect(store.getState().viewportOffset).toEqual({ x: 100, y: 50 })
  })

  it('creates visual notes, arrows and a group around the current selection', () => {
    const store = createCanvasStore()
    const first = store.getState().addNode('panel-a', 'terminal', { x: 100, y: 100 }, { width: 300, height: 200 })
    const second = store.getState().addNode('panel-b', 'editor', { x: 500, y: 120 }, { width: 320, height: 240 })
    store.getState().selectNodes([first, second])
    store.getState().addGroupDecoration('Review lane')
    store.getState().addArrowDecoration({ x: 250, y: 200 }, { x: 660, y: 240 }, 'next')
    store.getState().addNoteDecoration('Check the failing test', { x: 120, y: 400 })

    expect(store.getState().decorations.map((decoration) => decoration.type)).toEqual(['group', 'arrow', 'note'])
    const group = store.getState().decorations[0]
    expect(group.type === 'group' && group.nodeIds).toEqual([first, second])
  })

  it('saves and restores a named layout checkpoint without removing memory', () => {
    const store = createCanvasStore()
    const nodeId = store.getState().addNode('panel-a', 'terminal', { x: 10, y: 20 }, { width: 300, height: 200 })
    store.getState().addWaypoint('Start', { x: 10, y: 20 })
    const snapshotId = store.getState().saveLayoutSnapshot('Before refactor')

    store.getState().moveNode(nodeId, { x: 800, y: 900 })
    expect(store.getState().restoreLayoutSnapshot(snapshotId!)).toBe(true)
    expect(store.getState().nodes[nodeId].origin).toEqual({ x: 10, y: 20 })
    expect(store.getState().waypoints).toHaveLength(1)
  })
})
