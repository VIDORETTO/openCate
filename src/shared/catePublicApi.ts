// =============================================================================
// Public CATE API contracts shared by the desktop dispatcher, CLI and SDK.
// These methods are workspace-scoped: a token can only see the workspace that
// owns its endpoint. List responses use one envelope so new clients do not
// need endpoint-specific array/metadata parsing.
// =============================================================================

import type {
  ProjectTask,
  ProjectTaskArtifact,
  ProjectTaskDraft,
  ProjectTaskStatus,
} from './projectTasks'
import type {
  ProjectMemoryNote,
  ProjectMemoryNoteDraft,
  ProjectMemoryScope,
} from './projectMemory'

export const CATE_PUBLIC_API_VERSION = 1 as const

export interface CateProject {
  id: string
  rootPath: string | null
  branch: string | null
  worktree: string | null
}

export interface CateListResponse<T> {
  items: T[]
  total: number
}

export interface CateTaskListArgs {
  status?: ProjectTaskStatus
  limit?: number
}

export interface CateTaskGetArgs {
  taskId: string
}

export interface CateTaskCreateArgs {
  draft: ProjectTaskDraft
}

export type CateTaskPatch = Partial<Pick<
  ProjectTask,
  'objective' | 'constraints' | 'dependsOn' | 'executionPolicy' | 'approval' | 'attempts' |
  'status' | 'validatedResult' | 'validatedAt' | 'logs' | 'artifacts' | 'runId' |
  'ownerPanelId' | 'worktreeId'
>>

export interface CateTaskUpdateArgs {
  taskId: string
  patch: CateTaskPatch
}

export interface CateTaskDeleteArgs {
  taskId: string
}

/** A result is deliberately a projection, not a second mutable store. Its id
 * is the task id, which makes result lookup stable across renderer restarts. */
export interface CateTaskResult {
  id: string
  taskId: string
  objective: string
  status: ProjectTaskStatus
  value: string | null
  validatedAt: number | null
  artifacts: ProjectTaskArtifact[]
  updatedAt: number
}

export interface CateResultListArgs {
  taskId?: string
  limit?: number
}

export interface CateResultGetArgs {
  resultId: string
}

export interface CateContextListArgs {
  scope?: ProjectMemoryScope
  limit?: number
}

export interface CateContextGetArgs {
  contextId: string
}

export interface CateContextCreateArgs {
  draft: ProjectMemoryNoteDraft
}

export type CateContextPatch = Partial<Pick<
  ProjectMemoryNote,
  'scope' | 'title' | 'content' | 'citations'
>>

export interface CateContextUpdateArgs {
  contextId: string
  patch: CateContextPatch
}

export interface CateContextDeleteArgs {
  contextId: string
}

export type CatePublicMethod =
  | 'cate.project.get'
  | 'cate.tasks.list'
  | 'cate.tasks.get'
  | 'cate.tasks.create'
  | 'cate.tasks.update'
  | 'cate.tasks.delete'
  | 'cate.context.list'
  | 'cate.context.get'
  | 'cate.context.create'
  | 'cate.context.update'
  | 'cate.context.delete'
  | 'cate.results.list'
  | 'cate.results.get'

export const CATE_PUBLIC_METHODS: readonly CatePublicMethod[] = [
  'cate.project.get',
  'cate.tasks.list',
  'cate.tasks.get',
  'cate.tasks.create',
  'cate.tasks.update',
  'cate.tasks.delete',
  'cate.context.list',
  'cate.context.get',
  'cate.context.create',
  'cate.context.update',
  'cate.context.delete',
  'cate.results.list',
  'cate.results.get',
]
