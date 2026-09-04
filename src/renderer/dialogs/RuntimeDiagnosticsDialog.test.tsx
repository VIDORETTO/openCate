// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { RuntimeTelemetryEvent } from '../../shared/types'
import { RuntimeDiagnosticsDialog } from './RuntimeDiagnosticsDialog'

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('RuntimeDiagnosticsDialog', () => {
  it('shows bounded lifecycle history and current connection facts', () => {
    const events: RuntimeTelemetryEvent[] = [
      {
        runtimeId: 'srv_test',
        transport: 'server',
        kind: 'disconnect',
        timestamp: Date.UTC(2026, 7, 29, 12, 30, 0),
        message: 'Connection lost. Retrying automatically.',
      },
      {
        runtimeId: 'srv_test',
        transport: 'server',
        kind: 'reconnect-scheduled',
        timestamp: Date.UTC(2026, 7, 29, 12, 30, 1),
        attempt: 1,
        delayMs: 1000,
      },
    ]

    act(() => root.render(
      <RuntimeDiagnosticsDialog
        runtimeId="srv_test"
        transport="server"
        label="cate@example.test"
        status="disconnected"
        error="Connection unavailable"
        events={events}
        onClose={() => {}}
      />,
    ))

    expect(document.body.textContent).toContain('Runtime diagnostics')
    expect(document.body.textContent).toContain('srv_test')
    expect(document.body.textContent).toContain('cate@example.test')
    expect(document.body.textContent).toContain('Connection dropped')
    expect(document.body.textContent).toContain('Reconnect scheduled')
    expect(document.body.textContent).toContain('attempt 1 · in 1000 ms')
    expect(document.querySelectorAll('ol li')).toHaveLength(2)
  })

  it('states when the in-memory history is empty', () => {
    act(() => root.render(
      <RuntimeDiagnosticsDialog
        runtimeId="local"
        transport="local"
        label={null}
        status="local"
        events={[]}
        onClose={() => {}}
      />,
    ))

    expect(document.body.textContent).toContain('No lifecycle events recorded in this window.')
  })
})
