import { describe, expect, it } from 'vitest'
import type { CodingAgentRunSnapshot } from '../../../shared/codingAgentRuns'
import {
  codingAgentBroadcastStatusLabel,
  eligibleCodingAgentBroadcastTargets,
  isCodingAgentBroadcastEligible,
  translateBroadcastSlashCommand,
} from './codingAgentBroadcast'

const run = (overrides: Partial<CodingAgentRunSnapshot> = {}): CodingAgentRunSnapshot => ({
  id: 'run-1',
  agentId: 'codex',
  panelId: 'panel-1',
  ownerPanelId: 'owner-1',
  prompt: 'task',
  createdAt: 1,
  status: 'waiting',
  agentName: 'Codex',
  cwd: '/repo',
  alive: true,
  durationMs: 1,
  followUpSupported: true,
  ...overrides,
})

describe('coding agent global broadcast contract', () => {
  it('allows only live follow-up-capable working or waiting missions', () => {
    expect(isCodingAgentBroadcastEligible(run())).toBe(true)
    expect(isCodingAgentBroadcastEligible(run({ status: 'working' }))).toBe(true)
    expect(isCodingAgentBroadcastEligible(run({ status: 'stalled' }))).toBe(false)
    expect(isCodingAgentBroadcastEligible(run({ followUpSupported: false }))).toBe(false)
    expect(eligibleCodingAgentBroadcastTargets([
      run(),
      run({ id: 'run-2', status: 'ready' }),
      run({ id: 'run-3', status: 'working', followUpSupported: false }),
    ])).toHaveLength(1)
  })

  it('keeps status copy explicit for the selection list', () => {
    expect(codingAgentBroadcastStatusLabel({ status: 'waiting' })).toBe('waiting for input')
    expect(codingAgentBroadcastStatusLabel({ status: 'ready' })).toBe('finished')
  })

  it('translates only opted-in neutral slash commands and preserves arguments', () => {
    expect(translateBroadcastSlashCommand('/status', false)).toEqual({
      text: '/status',
      translated: false,
      command: 'status',
    })
    expect(translateBroadcastSlashCommand('/review focus on auth', true)).toEqual({
      text: 'Review the current work for bugs, regressions, and missing tests. Report findings with severity and file references.\n\nAdditional direction: focus on auth',
      translated: true,
      command: 'review',
    })
    expect(translateBroadcastSlashCommand('/provider-specific', true)).toEqual({
      text: '/provider-specific',
      translated: false,
      command: 'provider-specific',
    })
  })
})
