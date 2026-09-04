export type MergeQueueStatus = 'queued' | 'running' | 'completed' | 'conflict' | 'failed'

export const MAX_MERGE_QUEUE_ENTRIES = 100

export interface MergeQueueEntry {
  id: string
  rootPath: string
  workspaceId: string
  worktreeId: string
  sourceBranch: string
  targetBranch: string
  status: MergeQueueStatus
  enqueuedAt: number
  startedAt?: number
  finishedAt?: number
  message?: string
}
