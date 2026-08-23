// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { canvasKey, skillAgentKey, skillsKey, toggleCollapsed, useTreeCollapseStore } from './treeCollapse'

const STORAGE_KEY = 'cate.sidebar.treeCollapsed'

// Node's experimental localStorage is present but incomplete when Vitest runs
// this pure store in Node without --localstorage-file. Replace it with the tiny
// in-memory API the production store expects so persistence can be observed.
class MemoryStorage {
  private readonly values = new Map<string, string>()
  getItem = (key: string): string | null => this.values.get(String(key)) ?? null
  setItem = (key: string, value: string): void => {
    this.values.set(String(key), String(value))
  }
  clear = (): void => {
    this.values.clear()
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: new MemoryStorage(),
})
const storageGet = (key: string): string | null => localStorage.getItem(key)
const storageClear = (): void => { localStorage.clear() }

describe('treeCollapse', () => {
  beforeEach(() => {
    storageClear()
    useTreeCollapseStore.setState({ collapsed: new Set() })
  })

  it('keys are workspace-scoped', () => {
    expect(canvasKey('w1', 'c1')).not.toBe(canvasKey('w2', 'c1'))
    expect(skillAgentKey('w1', 'claude-code')).not.toBe(skillAgentKey('w2', 'claude-code'))
    expect(skillsKey('w1')).toBe('w1:skills')
  })

  it('defaults to expanded and toggles both ways', () => {
    const key = skillAgentKey('w1', 'claude-code')
    expect(useTreeCollapseStore.getState().collapsed.has(key)).toBe(false)
    toggleCollapsed(key)
    expect(useTreeCollapseStore.getState().collapsed.has(key)).toBe(true)
    toggleCollapsed(key)
    expect(useTreeCollapseStore.getState().collapsed.has(key)).toBe(false)
  })

  it('writes collapsed keys to localStorage so they survive a restart', () => {
    toggleCollapsed(skillsKey('w1'))
    expect(JSON.parse(storageGet(STORAGE_KEY) ?? '[]')).toEqual(['w1:skills'])
    toggleCollapsed(skillsKey('w1'))
    expect(JSON.parse(storageGet(STORAGE_KEY) ?? '[]')).toEqual([])
  })
})
