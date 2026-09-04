import { describe, expect, test } from 'vitest'
import { isValidTmuxSessionName, tmuxSessionName } from './terminalDurability'

describe('terminal durability identifiers', () => {
  test('derives a stable, non-secret tmux session name from the scope and panel ids', () => {
    const first = tmuxSessionName('workspace-secret-looking-id', 'panel:with/slashes')

    expect(first).toBe(tmuxSessionName('workspace-secret-looking-id', 'panel:with/slashes'))
    expect(first).toMatch(/^cate-[0-9a-f]{8}-panelwithslashes$/)
    expect(isValidTmuxSessionName(first)).toBe(true)
    expect(first).not.toContain('workspace-secret-looking-id')
  })

  test('rejects names outside Cate-owned tmux namespace', () => {
    expect(isValidTmuxSessionName('other-session')).toBe(false)
    expect(isValidTmuxSessionName('cate-')).toBe(false)
    expect(isValidTmuxSessionName(`cate-${'a'.repeat(70)}`)).toBe(false)
  })
})
