// =============================================================================
// TypeScript client for the workspace-scoped CATE_API endpoint.
//
// The SDK intentionally has no Electron dependency. It can run in Node, Bun,
// or a browser integration and uses the same bearer-authenticated POST
// envelope as the bundled `cate` CLI.
// =============================================================================

import type {
  CateContextCreateArgs,
  CateContextGetArgs,
  CateContextListArgs,
  CateContextPatch,
  CateContextUpdateArgs,
  CateListResponse,
  CateProject,
  CateResultGetArgs,
  CateResultListArgs,
  CateTaskCreateArgs,
  CateTaskGetArgs,
  CateTaskListArgs,
  CateTaskPatch,
  CateTaskResult,
  CateTaskUpdateArgs,
  CatePublicMethod,
} from '../shared/catePublicApi'
import type { ProjectMemoryNote, ProjectMemoryNoteDraft } from '../shared/projectMemory'
import type { ProjectTask, ProjectTaskDraft } from '../shared/projectTasks'

export interface CateApiClientOptions {
  baseUrl: string
  token: string
  fetch?: typeof fetch
  timeoutMs?: number
  clientId?: string
  callerPanelId?: string
  originCwd?: string
}

export class CateApiError extends Error {
  constructor(
    public readonly method: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(`${method}: ${code}`)
    this.name = 'CateApiError'
  }
}

export class CateApiTransportError extends Error {
  constructor(
    public readonly method: string,
    message: string,
  ) {
    super(`${method}: ${message}`)
    this.name = 'CateApiTransportError'
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function errorCode(value: unknown): string | null {
  const object = asRecord(value)
  const code = object?.error
  return typeof code === 'string' && code ? code : null
}

export class CateApiClient {
  private readonly baseUrl: string
  private readonly token: string
  private readonly requestFetch: typeof fetch
  private readonly timeoutMs: number
  private readonly clientId: string | undefined
  private readonly callerPanelId: string | undefined
  private readonly originCwd: string | undefined

  readonly project = {
    get: (): Promise<CateProject> => this.invoke<CateProject>('cate.project.get', {}),
  }

  readonly tasks = {
    list: (args: CateTaskListArgs = {}): Promise<CateListResponse<ProjectTask>> =>
      this.invoke<CateListResponse<ProjectTask>>('cate.tasks.list', { ...args }),
    get: (taskId: string): Promise<ProjectTask> =>
      this.invoke<ProjectTask>('cate.tasks.get', { taskId } satisfies CateTaskGetArgs),
    create: (draft: ProjectTaskDraft): Promise<ProjectTask> =>
      this.invoke<ProjectTask>('cate.tasks.create', { draft } satisfies CateTaskCreateArgs),
    update: (taskId: string, patch: CateTaskPatch): Promise<ProjectTask> =>
      this.invoke<ProjectTask>('cate.tasks.update', { taskId, patch } satisfies CateTaskUpdateArgs),
    delete: (taskId: string): Promise<{ ok: true; taskId: string }> =>
      this.invoke<{ ok: true; taskId: string }>('cate.tasks.delete', { taskId }),
  }

  readonly context = {
    list: (args: CateContextListArgs = {}): Promise<CateListResponse<ProjectMemoryNote>> =>
      this.invoke<CateListResponse<ProjectMemoryNote>>('cate.context.list', { ...args }),
    get: (contextId: string): Promise<ProjectMemoryNote> =>
      this.invoke<ProjectMemoryNote>('cate.context.get', { contextId } satisfies CateContextGetArgs),
    create: (draft: ProjectMemoryNoteDraft): Promise<ProjectMemoryNote> =>
      this.invoke<ProjectMemoryNote>('cate.context.create', { draft } satisfies CateContextCreateArgs),
    update: (contextId: string, patch: CateContextPatch): Promise<ProjectMemoryNote> =>
      this.invoke<ProjectMemoryNote>('cate.context.update', { contextId, patch } satisfies CateContextUpdateArgs),
    delete: (contextId: string): Promise<{ ok: true; contextId: string }> =>
      this.invoke<{ ok: true; contextId: string }>('cate.context.delete', { contextId }),
  }

  readonly results = {
    list: (args: CateResultListArgs = {}): Promise<CateListResponse<CateTaskResult>> =>
      this.invoke<CateListResponse<CateTaskResult>>('cate.results.list', { ...args }),
    get: (resultId: string): Promise<CateTaskResult> =>
      this.invoke<CateTaskResult>('cate.results.get', { resultId } satisfies CateResultGetArgs),
  }

  constructor(options: CateApiClientOptions) {
    if (!options.baseUrl || !options.token) throw new Error('CATE_API baseUrl and token are required')
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.token = options.token
    this.requestFetch = options.fetch ?? globalThis.fetch
    this.timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs ?? 0) > 0
      ? Math.trunc(options.timeoutMs!)
      : 30_000
    this.clientId = options.clientId
    this.callerPanelId = options.callerPanelId
    this.originCwd = options.originCwd
  }

  version(): Promise<number> {
    return this.invoke<number>('cate.version', {})
  }

  async invoke<T>(method: CatePublicMethod | string, args: Record<string, unknown> = {}): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.requestFetch(this.baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          method,
          args,
          ...(this.clientId ? { clientId: this.clientId } : {}),
          ...(this.callerPanelId ? { callerPanelId: this.callerPanelId } : {}),
          ...(this.originCwd ? { originCwd: this.originCwd } : {}),
        }),
        signal: controller.signal,
      })
      let body: unknown
      try {
        body = await response.json()
      } catch {
        throw new CateApiTransportError(method, `malformed response (HTTP ${response.status})`)
      }
      const ok = response.ok === undefined
        ? response.status >= 200 && response.status < 300
        : response.ok
      if (!ok) {
        throw new CateApiError(
          method,
          response.status,
          errorCode(body) ?? errorCode(asRecord(body)?.result) ?? `HTTP ${response.status}`,
        )
      }
      const object = asRecord(body)
      if (object && 'result' in object) {
        const result = object.result
        const code = errorCode(result)
        if (code) throw new CateApiError(method, response.status, code)
        return result as T
      }
      const code = errorCode(body)
      if (code) throw new CateApiError(method, response.status, code)
      throw new CateApiTransportError(method, 'malformed response')
    } catch (error) {
      if (error instanceof CateApiError || error instanceof CateApiTransportError) throw error
      throw new CateApiTransportError(
        method,
        error instanceof Error ? error.message : String(error),
      )
    } finally {
      clearTimeout(timer)
    }
  }
}

export function createCateApiClient(options: CateApiClientOptions): CateApiClient {
  return new CateApiClient(options)
}
