import { describe, expect, it } from 'vitest'
import { analyzeProjectTaskGraph } from './projectTaskGraph'
import type { ProjectTask } from './projectTasks'

function task(
  id: string,
  status: ProjectTask['status'] = 'planned',
  overrides: Partial<ProjectTask> = {},
): ProjectTask {
  return {
    id,
    objective: id,
    constraints: [],
    status,
    logs: [],
    artifacts: [],
    createdAt: Number(id.replace(/\D/g, '')) || 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('analyzeProjectTaskGraph', () => {
  it('releases completed prerequisites and limits parallel work by execution lane', () => {
    const graph = analyzeProjectTaskGraph([
      task('done', 'completed'),
      task('worktree-a', 'planned', { dependsOn: ['done'], worktreeId: 'wt-a' }),
      task('worktree-b', 'planned', { dependsOn: ['done'], worktreeId: 'wt-b' }),
      task('worktree-a-second', 'planned', { dependsOn: ['done'], worktreeId: 'wt-a' }),
      task('project-first', 'planned', { dependsOn: ['done'] }),
      task('project-second', 'planned', { dependsOn: ['done'] }),
    ])

    expect(graph.readyTaskIds).toEqual([
      'project-first',
      'project-second',
      'worktree-a',
      'worktree-a-second',
      'worktree-b',
    ])
    expect(graph.safeParallelTaskIds).toEqual(['project-first', 'worktree-a', 'worktree-b'])
    expect(graph.laneConflictTaskIds).toEqual(['project-second', 'worktree-a-second'])
  })

  it('blocks missing prerequisites and every task participating in a cycle', () => {
    const graph = analyzeProjectTaskGraph([
      task('cycle-a', 'planned', { dependsOn: ['cycle-b'] }),
      task('cycle-b', 'planned', { dependsOn: ['cycle-a'] }),
      task('missing', 'planned', { dependsOn: ['unknown'] }),
      task('independent'),
    ])

    expect(graph.nodes.find((node) => node.taskId === 'cycle-a')).toMatchObject({
      cyclic: true,
      readiness: 'blocked',
    })
    expect(graph.nodes.find((node) => node.taskId === 'cycle-b')).toMatchObject({
      cyclic: true,
      readiness: 'blocked',
    })
    expect(graph.nodes.find((node) => node.taskId === 'missing')).toMatchObject({
      missingDependencyIds: ['unknown'],
      readiness: 'blocked',
    })
    expect(graph.readyTaskIds).toEqual(['independent'])
  })

  it('distinguishes waiting work from dependencies that can never release it', () => {
    const graph = analyzeProjectTaskGraph([
      task('waiting-dependency'),
      task('waiting-child', 'planned', { dependsOn: ['waiting-dependency'] }),
      task('failed-dependency', 'failed'),
      task('failed-child', 'planned', { dependsOn: ['failed-dependency'] }),
      task('done', 'completed'),
      task('done-child', 'planned', { dependsOn: ['done'] }),
    ])

    expect(graph.nodes.find((node) => node.taskId === 'waiting-child')?.readiness).toBe('waiting')
    expect(graph.nodes.find((node) => node.taskId === 'failed-child')).toMatchObject({
      blockingDependencyIds: ['failed-dependency'],
      readiness: 'blocked',
    })
    expect(graph.nodes.find((node) => node.taskId === 'done-child')?.readiness).toBe('ready')
  })
})
