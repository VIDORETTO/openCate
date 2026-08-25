import { describe, expect, it } from 'vitest'
import type { CodingAgentRunSnapshot } from '../../../shared/codingAgentRuns'
import type { PanelState, WindowPanelInfo } from '../../../shared/types'
import { buildAgentTree } from './agentTree'

function snapshot(
  overrides: Partial<CodingAgentRunSnapshot> & Pick<CodingAgentRunSnapshot, 'id' | 'panelId' | 'ownerPanelId'>,
): CodingAgentRunSnapshot {
  return {
    agentId: 'codex',
    agentName: 'Codex',
    prompt: 'do the work',
    createdAt: 200,
    status: 'working',
    cwd: '/tmp/project',
    alive: true,
    durationMs: 10,
    followUpSupported: true,
    ...overrides,
  } as CodingAgentRunSnapshot
}

function panel(id: string, title = id): PanelState {
  return { id, type: 'terminal', title, isDirty: false } as PanelState
}

function detached(
  panelId: string,
  runId: string,
  ownerPanelId: string,
  overrides: Partial<WindowPanelInfo> = {},
): WindowPanelInfo {
  return {
    ownerWindowId: 2,
    ownerWindowType: 'dock',
    panelId,
    type: 'terminal',
    title: panelId,
    workspaceId: 'workspace-1',
    codingAgentRunId: runId,
    codingAgentOwnerPanelId: ownerPanelId,
    codingAgentStatus: 'waiting',
    ...overrides,
  }
}

describe('buildAgentTree', () => {
  it('returns an empty tree when there are no mission workers', () => {
    expect(buildAgentTree({ localPanels: [panel('shell')], localRuns: [] })).toEqual({
      supervisors: [],
    })
  })

  it('groups local workers under their supervisor in launch order', () => {
    const tree = buildAgentTree({
      localPanels: [panel('orchestrator', 'Orchestrator'), panel('worker-b')],
      localRuns: [
        snapshot({ id: 'b', panelId: 'worker-b', ownerPanelId: 'orchestrator', createdAt: 300 }),
        snapshot({ id: 'a', panelId: 'worker-a', ownerPanelId: 'orchestrator', createdAt: 100 }),
        snapshot({ id: 'other', panelId: 'elsewhere', ownerPanelId: 'another-owner' }),
      ],
    })

    expect(tree.supervisors).toHaveLength(2)
    expect(tree.supervisors[0].panelId).toBe('orchestrator')
    expect(tree.supervisors[0].title).toBe('Orchestrator')
    expect(tree.supervisors[0].workers.map((worker) => worker.runId)).toEqual(['a', 'b'])
    expect(tree.supervisors[1].panelId).toBe('another-owner')
  })

  it('adds detached workers and prefers richer local snapshots on run-id overlap', () => {
    const tree = buildAgentTree({
      localPanels: [panel('orchestrator', 'Orchestrator')],
      localRuns: [
        snapshot({
          id: 'same-run',
          panelId: 'local-worker',
          ownerPanelId: 'orchestrator',
          title: 'Integration tests',
          usage: { totalTokens: 120, observedAt: 5, source: 'hook' },
          lastToolCall: { name: 'Edit', detail: '/src/app.ts', observedAt: 6 },
          filesTouched: [
            { path: '/src/app.ts', lastObservedAt: 6 },
            { path: '/src/test.ts', lastObservedAt: 7 },
          ],
        }),
      ],
      detachedPanels: [
        detached('remote-worker', 'remote-run', 'orchestrator', {
          title: 'Docs sweep',
          agentName: 'Claude Code',
          codingAgentLastTool: 'Bash',
          codingAgentFilesTouchedCount: 3,
        }),
        detached('transferred-worker', 'same-run', 'orchestrator'),
      ],
    })

    expect(tree.supervisors).toHaveLength(1)
    expect(tree.supervisors[0].workers.map((worker) => worker.runId)).toEqual([
      'same-run',
      'remote-run',
    ])
    expect(tree.supervisors[0].workers[0].usage?.totalTokens).toBe(120)
    expect(tree.supervisors[0].workers[0].lastToolCall?.name).toBe('Edit')
    expect(tree.supervisors[0].workers[0].filesTouchedCount).toBe(2)
    expect(tree.supervisors[0].workers[0].source).toBe('local')
    expect(tree.supervisors[0].workers[1].source).toBe('detached')
    expect(tree.supervisors[0].workers[1].title).toBe('Docs sweep')
    expect(tree.supervisors[0].workers[1].lastToolCall?.name).toBe('Bash')
    expect(tree.supervisors[0].workers[1].filesTouchedCount).toBe(3)
  })

  it('keeps an orphaned detached worker grouped by its recorded owner', () => {
    const tree = buildAgentTree({
      localPanels: [],
      localRuns: [],
      detachedPanels: [detached('lost-worker', 'lost-run', 'missing-owner')],
    })

    expect(tree.supervisors).toEqual([{
      panelId: 'missing-owner',
      title: 'Mission owner',
      workers: [{
        runId: 'lost-run',
        panelId: 'lost-worker',
        title: 'lost-worker',
        agentName: 'Agent',
        status: 'waiting',
        source: 'detached',
        detachedPanel: expect.objectContaining({ panelId: 'lost-worker' }),
      }],
    }])
  })
})
