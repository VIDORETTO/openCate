import { describe, expect, it } from 'vitest'
import { buildWorkspaceDigest, formatWorkspaceDigest } from './workspaceDigest'
import type { PanelState } from '../../shared/types'

function panel(id: string, type: PanelState['type'] = 'terminal'): PanelState {
  return { id, type, title: id, isDirty: false } as PanelState
}

describe('buildWorkspaceDigest', () => {
  it('returns an empty digest for an empty workspace', () => {
    expect(buildWorkspaceDigest({
      attentionQueue: [],
      stashedPanels: [],
      orderedPanels: [],
      agentInfoByPanel: {},
    })).toEqual({
      attentionCount: 0,
      stashedCount: 0,
      runningAgents: 0,
      waitingAgents: 0,
      finishedAgents: 0,
      totalTerminals: 0,
      segments: [],
    })
    expect(formatWorkspaceDigest(buildWorkspaceDigest({
      attentionQueue: [],
      stashedPanels: [],
      orderedPanels: [],
      agentInfoByPanel: {},
    }))).toBe('')
  })

  it('counts mixed local and stashed terminal states once each', () => {
    const orderedPanels = [
      panel('running'),
      panel('waiting'),
      panel('done'),
      panel('plain'),
      panel('editor', 'editor'),
    ]
    const stashedPanels = [panel('parked-running'), panel('parked-unknown')]

    const digest = buildWorkspaceDigest({
      attentionQueue: [
        { panel: orderedPanels[1], reason: 'waitingForInput' },
        { panel: orderedPanels[2], reason: 'finished' },
        { panel: stashedPanels[0], reason: 'waitingForInput' },
      ],
      stashedPanels,
      orderedPanels,
      agentInfoByPanel: {
        running: { state: 'running' },
        waiting: { state: 'waitingForInput' },
        done: { state: 'finished' },
        plain: { state: 'notRunning' },
        editor: { state: 'running' },
        'parked-running': { state: 'running' },
      },
    })

    expect(digest).toEqual({
      attentionCount: 3,
      stashedCount: 2,
      runningAgents: 2,
      waitingAgents: 1,
      finishedAgents: 1,
      totalTerminals: 6,
      segments: ['2 running', '1 input', '1 done', '2 parked'],
    })
    expect(formatWorkspaceDigest(digest)).toBe('2 running · 1 input · 1 done · 2 parked')
  })

  it('summarizes a plain-terminal workspace without inventing agent activity', () => {
    const digest = buildWorkspaceDigest({
      attentionQueue: [],
      stashedPanels: [],
      orderedPanels: [panel('shell-one'), panel('shell-two'), panel('agent-shell')],
      agentInfoByPanel: {},
    })

    expect(digest.totalTerminals).toBe(3)
    expect(digest.segments).toEqual(['3 terminals'])
  })
})
