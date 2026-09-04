import { beforeEach, describe, expect, it } from 'vitest'
import { useMergeQueueStore } from './mergeQueueStore'

const input = {
  rootPath: '/repo',
  workspaceId: 'ws',
  worktreeId: 'wt-feature',
  sourceBranch: 'feature',
  targetBranch: 'main',
}

describe('merge queue store', () => {
  beforeEach(() => {
    useMergeQueueStore.setState({ entriesByRoot: {} })
  })

  it('deduplicates an active worktree request and tracks lifecycle', () => {
    const first = useMergeQueueStore.getState().enqueue(input)
    const duplicate = useMergeQueueStore.getState().enqueue(input)
    expect(first).not.toBeNull()
    expect(duplicate?.id).toBe(first?.id)
    expect(useMergeQueueStore.getState().entriesByRoot['/repo']).toHaveLength(1)

    const running = useMergeQueueStore.getState().startNext('/repo')
    expect(running).toMatchObject({ id: first?.id, status: 'running' })
    useMergeQueueStore.getState().finish('/repo', first!.id, 'conflict', 'Resolve conflict')
    expect(useMergeQueueStore.getState().entriesByRoot['/repo']?.[0]).toMatchObject({
      status: 'conflict',
      message: 'Resolve conflict',
      finishedAt: expect.any(Number),
    })
  })

  it('does not lose queued work when completed entries are cleared', () => {
    const first = useMergeQueueStore.getState().enqueue(input)
    const second = useMergeQueueStore.getState().enqueue({ ...input, worktreeId: 'wt-next', sourceBranch: 'next' })
    useMergeQueueStore.getState().finish('/repo', first!.id, 'completed')

    useMergeQueueStore.getState().clearFinished('/repo')
    expect(useMergeQueueStore.getState().entriesByRoot['/repo']).toEqual([
      expect.objectContaining({ id: second?.id, status: 'queued' }),
    ])
  })
})
