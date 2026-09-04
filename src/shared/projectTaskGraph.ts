// =============================================================================
// Project task graph — pure dependency analysis for safe orchestration.
// It never starts a process or infers a relationship from terminal output.
// =============================================================================

import type { ProjectTask, ProjectTaskStatus } from './projectTasks'

export type ProjectTaskReadiness =
  | 'ready'
  | 'waiting'
  | 'blocked'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface ProjectTaskGraphNode {
  taskId: string
  dependsOn: string[]
  missingDependencyIds: string[]
  blockingDependencyIds: string[]
  cyclic: boolean
  readiness: ProjectTaskReadiness
  /** Tasks sharing a lane are conservatively treated as mutually exclusive. */
  executionLane: string
}

export interface ProjectTaskGraph {
  nodes: ProjectTaskGraphNode[]
  /** Planned tasks whose prerequisites are all completed. */
  readyTaskIds: string[]
  /** A conservative subset of ready tasks safe to run concurrently. */
  safeParallelTaskIds: string[]
  /** Ready tasks deferred because another ready task owns the same lane. */
  laneConflictTaskIds: string[]
}

const BLOCKING_DEPENDENCY_STATUSES = new Set<ProjectTaskStatus>([
  'blocked',
  'failed',
  'cancelled',
])

function executionLane(task: ProjectTask): string {
  return task.worktreeId ? `worktree:${task.worktreeId}` : 'project'
}

function taskOrder(left: ProjectTask, right: ProjectTask): number {
  return left.createdAt - right.createdAt || left.id.localeCompare(right.id)
}

function findCyclicTaskIds(tasksById: ReadonlyMap<string, ProjectTask>): Set<string> {
  const colors = new Map<string, 'visiting' | 'visited'>()
  const cyclic = new Set<string>()

  const visit = (taskId: string, stack: string[]): void => {
    const color = colors.get(taskId)
    if (color === 'visited') return
    if (color === 'visiting') {
      const cycleStart = stack.indexOf(taskId)
      for (const id of stack.slice(cycleStart < 0 ? 0 : cycleStart)) cyclic.add(id)
      cyclic.add(taskId)
      return
    }
    const task = tasksById.get(taskId)
    if (!task) return
    colors.set(taskId, 'visiting')
    const nextStack = [...stack, taskId]
    for (const dependencyId of task.dependsOn ?? []) {
      if (tasksById.has(dependencyId)) visit(dependencyId, nextStack)
    }
    colors.set(taskId, 'visited')
  }

  for (const taskId of tasksById.keys()) visit(taskId, [])
  return cyclic
}

function readinessFor(
  task: ProjectTask,
  tasksById: ReadonlyMap<string, ProjectTask>,
  cyclic: ReadonlySet<string>,
  missingDependencyIds: string[],
  blockingDependencyIds: string[],
): ProjectTaskReadiness {
  if (task.status !== 'planned') return task.status
  if (cyclic.has(task.id) || missingDependencyIds.length > 0 || blockingDependencyIds.length > 0) return 'blocked'
  const allDependenciesCompleted = (task.dependsOn ?? []).every((dependencyId) =>
    tasksById.get(dependencyId)?.status === 'completed',
  )
  return allDependenciesCompleted ? 'ready' : 'waiting'
}

/** Analyze a task list without mutating it or starting any work. */
export function analyzeProjectTaskGraph(tasks: readonly ProjectTask[]): ProjectTaskGraph {
  const tasksById = new Map<string, ProjectTask>()
  for (const task of tasks) {
    if (!tasksById.has(task.id)) tasksById.set(task.id, task)
  }
  const cyclic = findCyclicTaskIds(tasksById)
  const nodes = tasks.map((task) => {
    const dependsOn = [...(task.dependsOn ?? [])]
    const missingDependencyIds = dependsOn.filter((dependencyId) => !tasksById.has(dependencyId))
    const blockingDependencyIds = dependsOn.filter((dependencyId) => {
      const dependency = tasksById.get(dependencyId)
      return dependency !== undefined && BLOCKING_DEPENDENCY_STATUSES.has(dependency.status)
    })
    return {
      taskId: task.id,
      dependsOn,
      missingDependencyIds,
      blockingDependencyIds,
      cyclic: cyclic.has(task.id),
      readiness: readinessFor(task, tasksById, cyclic, missingDependencyIds, blockingDependencyIds),
      executionLane: executionLane(task),
    }
  })
  const taskById = new Map(tasks.map((task) => [task.id, task] as const))
  const readyNodes = nodes
    .filter((node) => node.readiness === 'ready')
    .sort((left, right) => taskOrder(taskById.get(left.taskId)!, taskById.get(right.taskId)!))
  const occupiedLanes = new Set<string>()
  const safeParallelTaskIds: string[] = []
  const laneConflictTaskIds: string[] = []
  for (const node of readyNodes) {
    if (occupiedLanes.has(node.executionLane)) {
      laneConflictTaskIds.push(node.taskId)
      continue
    }
    occupiedLanes.add(node.executionLane)
    safeParallelTaskIds.push(node.taskId)
  }
  return {
    nodes,
    readyTaskIds: readyNodes.map((node) => node.taskId),
    safeParallelTaskIds,
    laneConflictTaskIds,
  }
}
