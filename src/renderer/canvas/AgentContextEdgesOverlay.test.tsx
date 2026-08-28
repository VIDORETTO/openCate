import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'

import { createAgentContextRelation } from '../../shared/agentContextGraph'
import AgentContextEdgesOverlay from './AgentContextEdgesOverlay'
import { CanvasStoreProvider } from '../stores/CanvasStoreContext'
import { createCanvasStore } from '../stores/canvasStore'
import { useAgentContextGraphStore } from '../lib/agent/agentContextGraphStore'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

describe('AgentContextEdgesOverlay', () => {
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    useAgentContextGraphStore.getState().clear()
  })

  it('renders a world-space edge for a delivered context relation', () => {
    const canvasStore = createCanvasStore()
    canvasStore.getState().addNode('panel-a', 'editor', { x: 0, y: 0 }, { width: 200, height: 100 })
    canvasStore.getState().addNode('panel-b', 'editor', { x: 400, y: 0 }, { width: 200, height: 100 })
    useAgentContextGraphStore.setState({
      relations: [createAgentContextRelation({
        originPanelId: 'panel-a',
        destPanelId: 'panel-b',
        kind: 'terminal-selection',
        title: 'API selection',
        now: 1,
      })],
    })

    act(() => {
      root.render(
        <CanvasStoreProvider store={canvasStore}>
          <AgentContextEdgesOverlay />
        </CanvasStoreProvider>,
      )
    })

    expect(host.querySelector('[data-agent-context-edges]')).not.toBeNull()
    expect(host.querySelector('[data-context-edge][data-context-kind="terminal-selection"]')).not.toBeNull()
    expect(host.textContent).toContain('API selection')
  })
})
