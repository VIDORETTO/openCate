import React from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ActivitySparkline } from './ActivitySparkline'
import {
  ACTIVITY_BUCKET_MS,
  noteTerminalActivity,
  resetActivityHistoriesForTests,
} from '../lib/terminal/activityHistory'

let host: HTMLDivElement
let root: Root
const BASE_TIME = 1_770_000_000_000

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => {
  resetActivityHistoriesForTests()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => { root.unmount() })
  host.remove()
  resetActivityHistoriesForTests()
})

describe('ActivitySparkline', () => {
  it('renders an empty compact placeholder without history', () => {
    let element: HTMLElement | null = null
    act(() => {
      root.render(<ActivitySparkline panelId="empty" />)
    })
    element = host.firstElementChild as HTMLElement | null

    expect(element?.dataset.activitySparkline).toBe('empty')
    expect(element?.childElementCount).toBe(0)
  })

  it('renders recent output buckets with intensity relative to the recent maximum', () => {
    noteTerminalActivity('panel-activity', 100, BASE_TIME)
    noteTerminalActivity('panel-activity', 25, BASE_TIME + ACTIVITY_BUCKET_MS)
    noteTerminalActivity('panel-activity', 1, BASE_TIME + ACTIVITY_BUCKET_MS * 2)

    let element: HTMLElement | null = null
    act(() => {
      root.render(<ActivitySparkline panelId="panel-activity" />)
    })
    element = host.firstElementChild as HTMLElement | null

    const bars = Array.from(element!.children) as HTMLElement[]
    expect(bars).toHaveLength(3)
    expect(bars[0].style.height).toBe('100%')
    expect(bars[1].style.height).toBe('25%')
    expect(bars[2].style.height).toBe('12%') // minimum visible height

    act(() => {
      noteTerminalActivity('panel-activity', 200, BASE_TIME + ACTIVITY_BUCKET_MS * 3)
    })
    expect(element!.childElementCount).toBe(4)
  })
})
