import { describe, expect, it } from 'vitest'
import type { Terminal } from '@xterm/xterm'
import {
  readVisibleTerminalText,
  resolveAgentScreenState,
} from './agentScreenHeuristics'

describe('agent screen heuristics', () => {
  it('recognizes Aider’s visible prompt, including ANSI decoration', () => {
    expect(resolveAgentScreenState('Aider\u001b[0m\n\u001b[36m> \u001b[0m', 'aider')).toBe('waitingForInput')
  })

  it('recognizes an unmistakable progress marker as running', () => {
    expect(resolveAgentScreenState('Working on the requested changes…', 'aider')).toBe('running')
    expect(resolveAgentScreenState('⠋ Updating files', 'aider')).toBe('running')
  })

  it('does not turn a normal shell prompt into an agent state', () => {
    expect(resolveAgentScreenState('$ ', 'aider')).toBeNull()
    expect(resolveAgentScreenState('PS C:\\repo> ', 'aider')).toBeNull()
  })

  it('lets the final prompt win over stale progress text above it', () => {
    expect(resolveAgentScreenState('Working…\n\n> ', 'aider')).toBe('waitingForInput')
  })

  it('returns null for ambiguous output instead of guessing', () => {
    expect(resolveAgentScreenState('Changed 3 files\nReview the diff', 'aider')).toBeNull()
  })

  it('reads only the active viewport rows', () => {
    const lines = ['old scrollback', 'still old', 'visible one', 'visible two', 'visible three']
    const terminal = {
      rows: 3,
      buffer: {
        active: {
          viewportY: 2,
          getLine: (index: number) => ({
            translateToString: () => lines[index],
          }),
        },
      },
    } as unknown as Terminal

    expect(readVisibleTerminalText(terminal)).toBe('visible one\nvisible two\nvisible three')
  })
})
