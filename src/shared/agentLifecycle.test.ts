import { describe, expect, it } from 'vitest'

import {
  lifecycleForCodingAgentStatus,
  lifecycleForTerminalState,
  resolveAgentLifecycleState,
  terminalStateForLifecycle,
} from './agentLifecycle'

describe('agent lifecycle contract', () => {
  it.each([
    [{ present: false, wasPresent: false, active: false }, 'idle'],
    [{ present: false, wasPresent: true, active: false }, 'finished'],
    [{ present: true, wasPresent: false, active: true }, 'working'],
    [{ present: true, wasPresent: true, active: false }, 'waiting'],
    [{ present: true, wasPresent: true, active: true, stalled: true }, 'stalled'],
    [{ present: true, wasPresent: true, active: true, error: true }, 'error'],
  ] as const)('resolves %j to %s', (signals, expected) => {
    expect(resolveAgentLifecycleState(signals)).toBe(expected)
  })

  it.each([
    ['notRunning', 'idle'],
    ['running', 'working'],
    ['waitingForInput', 'waiting'],
    ['finished', 'finished'],
  ] as const)('adapts terminal state %s to %s', (state, expected) => {
    expect(lifecycleForTerminalState(state)).toBe(expected)
  })

  it('treats a present agent in a legacy notRunning state as working', () => {
    expect(lifecycleForTerminalState('notRunning', { agentPresent: true })).toBe('working')
  })

  it.each([
    ['working', 'running'],
    ['waiting', 'waitingForInput'],
    ['idle', 'notRunning'],
    ['finished', 'finished'],
    ['error', 'finished'],
    ['stalled', 'running'],
  ] as const)('adapts lifecycle state %s to terminal state %s', (state, expected) => {
    expect(terminalStateForLifecycle(state)).toBe(expected)
  })

  it.each([
    ['starting', 'idle'],
    ['working', 'working'],
    ['stalled', 'stalled'],
    ['waiting', 'waiting'],
    ['ready', 'finished'],
    ['stopped', 'finished'],
    ['failed', 'error'],
  ] as const)('maps coding-agent status %s to %s', (status, expected) => {
    expect(lifecycleForCodingAgentStatus(status)).toBe(expected)
  })
})
