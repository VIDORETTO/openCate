import type {
  CodingAgentToolCall,
  CodingAgentRunSnapshot,
  CodingAgentRunStatus,
  CodingAgentUsage,
} from '../../../shared/codingAgentRuns'
import type { PanelState, WindowPanelInfo } from '../../../shared/types'
import type { ProjectTask } from '../../../shared/projectTasks'

/** Where the authoritative live state for this worker came from. */
export type AgentTreeWorkerSource = 'local' | 'detached'

export interface AgentTreeWorker {
  runId: string
  panelId: string
  title: string
  agentName: string
  /** Detached reports can transiently arrive before their status stamp. */
  status?: CodingAgentRunStatus
  /** Only Cate-owned runs restored locally carry durable launch ordering. */
  createdAt?: number
  usage?: CodingAgentUsage
  contextRemainingTokens?: number
  statusLine?: string
  failureReason?: string
  /** Latest structured tool observation from the owning window. */
  lastToolCall?: CodingAgentToolCall
  filesTouchedCount?: number
  worktreeId?: string
  taskId?: string
  task?: ProjectTask
  approvedHunkIds?: string[]
  approvedAt?: number
  approvedToBranch?: string
  source: AgentTreeWorkerSource
  /** Present only for workers hosted in another window. */
  detachedPanel?: WindowPanelInfo
}

export interface AgentTreeSupervisor {
  panelId: string
  title: string
  workers: AgentTreeWorker[]
}

export interface AgentTree {
  supervisors: AgentTreeSupervisor[]
}

export interface AgentTreeInput {
  /** Every local panel, including stashed ones, used only for stable titles. */
  localPanels: ReadonlyArray<PanelState>
  /** Snapshots produced by the canonical coding-agent driver. */
  localRuns: ReadonlyArray<CodingAgentRunSnapshot>
  /** Owner-window reports for workers living in another window. */
  detachedPanels?: ReadonlyArray<WindowPanelInfo>
  /** Durable task contracts for this workspace, joined by taskId. */
  tasks?: ReadonlyArray<ProjectTask>
}

function compareWorkers(left: AgentTreeWorker, right: AgentTreeWorker): number {
  // Historical local runs have durable launch order. A detached report does
  // not carry createdAt yet, so it follows known runs instead of pretending to
  // be older than them.
  const leftCreated = left.createdAt ?? Number.MAX_SAFE_INTEGER
  const rightCreated = right.createdAt ?? Number.MAX_SAFE_INTEGER
  if (leftCreated !== rightCreated) return leftCreated - rightCreated
  return left.runId.localeCompare(right.runId)
}

function workerFromLocalSnapshot(
  snapshot: CodingAgentRunSnapshot,
  taskById: ReadonlyMap<string, ProjectTask>,
): AgentTreeWorker {
  const task = snapshot.taskId ? taskById.get(snapshot.taskId) : undefined
  return {
    runId: snapshot.id,
    panelId: snapshot.panelId,
    title: snapshot.title?.trim() || snapshot.agentName,
    agentName: snapshot.agentName,
    status: snapshot.status,
    createdAt: snapshot.createdAt,
    ...(snapshot.usage ? { usage: snapshot.usage } : {}),
    ...(snapshot.contextRemainingTokens !== undefined
      ? { contextRemainingTokens: snapshot.contextRemainingTokens }
      : {}),
    ...(snapshot.statusLine ? { statusLine: snapshot.statusLine } : {}),
    ...(snapshot.lastToolCall ? { lastToolCall: snapshot.lastToolCall } : {}),
    ...(snapshot.filesTouched !== undefined ? { filesTouchedCount: snapshot.filesTouched.length } : {}),
    ...(snapshot.failureReason ? { failureReason: snapshot.failureReason } : {}),
    ...(snapshot.worktreeId ? { worktreeId: snapshot.worktreeId } : {}),
    ...(snapshot.taskId ? { taskId: snapshot.taskId } : {}),
    ...(snapshot.approvedHunkIds ? { approvedHunkIds: snapshot.approvedHunkIds } : {}),
    ...(snapshot.approvedAt !== undefined ? { approvedAt: snapshot.approvedAt } : {}),
    ...(snapshot.approvedToBranch ? { approvedToBranch: snapshot.approvedToBranch } : {}),
    ...(task ? { task } : {}),
    source: 'local',
  }
}

function workerFromDetachedReport(
  panel: WindowPanelInfo,
  taskById: ReadonlyMap<string, ProjectTask>,
): AgentTreeWorker | null {
  if (!panel.codingAgentRunId || !panel.codingAgentOwnerPanelId) return null
  return {
    runId: panel.codingAgentRunId,
    panelId: panel.panelId,
    title: panel.title.trim() || panel.agentName?.trim() || 'Mission',
    agentName: panel.agentName?.trim() || 'Agent',
    ...(panel.codingAgentStatus ? { status: panel.codingAgentStatus } : {}),
    ...(panel.codingAgentLastTool
      ? { lastToolCall: { name: panel.codingAgentLastTool, observedAt: Date.now() } }
      : {}),
    ...(panel.codingAgentFilesTouchedCount !== undefined
      ? { filesTouchedCount: panel.codingAgentFilesTouchedCount }
      : {}),
    ...(panel.codingAgentTaskId ? { taskId: panel.codingAgentTaskId } : {}),
    ...(panel.codingAgentTaskId && taskById.has(panel.codingAgentTaskId)
      ? { task: taskById.get(panel.codingAgentTaskId) } : {}),
    source: 'detached',
    detachedPanel: panel,
  }
}

/**
 * Derive the live orchestrator → worker view from existing mission state.
 *
 * This is intentionally a pure projection: `CodingAgentRun` remains the only
 * persisted ownership record, and cross-window discovery remains the only
 * detached-panel source. Local driver snapshots win over cross-window reports
 * for the same run id because they contain richer durable facts.
 */
export function buildAgentTree(input: AgentTreeInput): AgentTree {
  const workersByOwner = new Map<string, Map<string, AgentTreeWorker>>()
  const taskById = new Map((input.tasks ?? []).map((task) => [task.id, task] as const))

  const addWorker = (ownerPanelId: string, worker: AgentTreeWorker): void => {
    const byRunId = workersByOwner.get(ownerPanelId) ?? new Map<string, AgentTreeWorker>()
    byRunId.set(worker.runId, worker)
    workersByOwner.set(ownerPanelId, byRunId)
  }

  for (const snapshot of input.localRuns) {
    if (!snapshot.ownerPanelId) continue
    addWorker(snapshot.ownerPanelId, workerFromLocalSnapshot(snapshot, taskById))
  }

  for (const panel of input.detachedPanels ?? []) {
    const worker = workerFromDetachedReport(panel, taskById)
    if (!worker) continue
    const existing = workersByOwner.get(panel.codingAgentOwnerPanelId!)?.get(worker.runId)
    if (existing) continue
    addWorker(panel.codingAgentOwnerPanelId!, worker)
  }

  const titleByPanelId = new Map<string, string>()
  for (const panel of input.localPanels) {
    if (panel.title.trim()) titleByPanelId.set(panel.id, panel.title.trim())
  }
  for (const panel of input.detachedPanels ?? []) {
    if (!titleByPanelId.has(panel.panelId) && panel.title.trim()) {
      titleByPanelId.set(panel.panelId, panel.title.trim())
    }
  }

  const supervisors: AgentTreeSupervisor[] = [...workersByOwner.entries()]
    .map(([panelId, workersById]) => ({
      panelId,
      title: titleByPanelId.get(panelId) ?? 'Mission owner',
      workers: [...workersById.values()].sort(compareWorkers),
    }))
    .sort((left, right) => {
      const leftCreated = left.workers.find((worker) => worker.createdAt !== undefined)?.createdAt
      const rightCreated = right.workers.find((worker) => worker.createdAt !== undefined)?.createdAt
      if (leftCreated !== undefined && rightCreated !== undefined && leftCreated !== rightCreated) {
        return leftCreated - rightCreated
      }
      if (leftCreated !== undefined) return -1
      if (rightCreated !== undefined) return 1
      return left.panelId.localeCompare(right.panelId)
    })

  return { supervisors }
}
