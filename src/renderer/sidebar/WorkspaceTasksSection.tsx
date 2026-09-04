import React, { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_PROJECT_TASK_EXECUTION_POLICY,
  type ProjectTask,
  type ProjectTaskArtifactKind,
  type ProjectTaskExecutionPolicy,
  type ProjectTaskLogLevel,
} from '../../shared/projectTasks'
import { analyzeProjectTaskGraph, type ProjectTaskGraphNode, type ProjectTaskReadiness } from '../../shared/projectTaskGraph'
import { useProjectTaskStore } from '../stores/projectTaskStore'
import { btn, inputCls } from '../ui/Modal'

interface WorkspaceTasksSectionProps {
  rootPath: string
}

const EMPTY_TASKS: readonly ProjectTask[] = []

function taskStatusLabel(status: ProjectTask['status']): string {
  return status.replace('-', ' ')
}

function readinessLabel(readiness: ProjectTaskReadiness): string {
  return readiness.replace('-', ' ')
}

function dependencyMessage(node: ProjectTaskGraphNode, tasks: readonly ProjectTask[]): string | null {
  if (node.cyclic) return 'Cyclic dependency'
  if (node.missingDependencyIds.length > 0) {
    return `Missing: ${node.missingDependencyIds.join(', ')}`
  }
  if (node.blockingDependencyIds.length > 0) {
    return `Blocked by: ${node.blockingDependencyIds.join(', ')}`
  }
  const pending = node.dependsOn.filter((dependencyId) =>
    tasks.find((task) => task.id === dependencyId)?.status !== 'completed',
  )
  return pending.length > 0 ? `Waiting for: ${pending.join(', ')}` : null
}

/** Small editor for the durable task contract. It deliberately exposes
 * objective, constraints and validation separately from mission output; logs
 * and artifacts are explicit additions, never an automatic scrollback dump. */
export const WorkspaceTasksSection: React.FC<WorkspaceTasksSectionProps> = ({ rootPath }) => {
  const tasks = useProjectTaskStore((state) => state.tasksByRoot[rootPath] ?? EMPTY_TASKS)
  const loadTasks = useProjectTaskStore((state) => state.loadTasks)
  const createTask = useProjectTaskStore((state) => state.createTask)
  const updateTask = useProjectTaskStore((state) => state.updateTask)
  const appendTaskLog = useProjectTaskStore((state) => state.appendTaskLog)
  const addTaskArtifact = useProjectTaskStore((state) => state.addTaskArtifact)
  const requestTaskApproval = useProjectTaskStore((state) => state.requestTaskApproval)
  const decideTaskApproval = useProjectTaskStore((state) => state.decideTaskApproval)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [objective, setObjective] = useState('')
  const [constraints, setConstraints] = useState('')
  const [dependsOn, setDependsOn] = useState('')
  const [maxAttempts, setMaxAttempts] = useState(String(DEFAULT_PROJECT_TASK_EXECUTION_POLICY.maxAttempts))
  const [timeoutSeconds, setTimeoutSeconds] = useState(String(DEFAULT_PROJECT_TASK_EXECUTION_POLICY.timeoutMs / 1_000))
  const [healthCheckSeconds, setHealthCheckSeconds] = useState(String(DEFAULT_PROJECT_TASK_EXECUTION_POLICY.healthCheckIntervalMs / 1_000))
  const [retryDelaySeconds, setRetryDelaySeconds] = useState(String(DEFAULT_PROJECT_TASK_EXECUTION_POLICY.retryDelayMs / 1_000))
  const [requireApproval, setRequireApproval] = useState(DEFAULT_PROJECT_TASK_EXECUTION_POLICY.requireApproval)
  const [status, setStatus] = useState<ProjectTask['status']>('planned')
  const [validatedResult, setValidatedResult] = useState('')
  const [logLevel, setLogLevel] = useState<ProjectTaskLogLevel>('info')
  const [logMessage, setLogMessage] = useState('')
  const [artifactKind, setArtifactKind] = useState<ProjectTaskArtifactKind>('file')
  const [artifactLabel, setArtifactLabel] = useState('')
  const [artifactLocator, setArtifactLocator] = useState('')

  useEffect(() => {
    void loadTasks(rootPath)
  }, [loadTasks, rootPath])

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId),
    [selectedTaskId, tasks],
  )
  const graph = useMemo(() => analyzeProjectTaskGraph(tasks), [tasks])
  const graphByTaskId = useMemo(
    () => new Map(graph.nodes.map((node) => [node.taskId, node] as const)),
    [graph.nodes],
  )
  const selectedNode = selectedTask ? graphByTaskId.get(selectedTask.id) : undefined
  const selectedDependencyMessage = selectedNode ? dependencyMessage(selectedNode, tasks) : null

  const beginNew = (): void => {
    setSelectedTaskId(null)
    setObjective('')
    setConstraints('')
    setDependsOn('')
    setMaxAttempts(String(DEFAULT_PROJECT_TASK_EXECUTION_POLICY.maxAttempts))
    setTimeoutSeconds(String(DEFAULT_PROJECT_TASK_EXECUTION_POLICY.timeoutMs / 1_000))
    setHealthCheckSeconds(String(DEFAULT_PROJECT_TASK_EXECUTION_POLICY.healthCheckIntervalMs / 1_000))
    setRetryDelaySeconds(String(DEFAULT_PROJECT_TASK_EXECUTION_POLICY.retryDelayMs / 1_000))
    setRequireApproval(DEFAULT_PROJECT_TASK_EXECUTION_POLICY.requireApproval)
    setStatus('planned')
    setValidatedResult('')
    setEditing(true)
  }

  const beginEdit = (task: ProjectTask): void => {
    setSelectedTaskId(task.id)
    setObjective(task.objective)
    setConstraints(task.constraints.join('\n'))
    setDependsOn((task.dependsOn ?? []).join('\n'))
    const policy = task.executionPolicy ?? DEFAULT_PROJECT_TASK_EXECUTION_POLICY
    setMaxAttempts(String(policy.maxAttempts))
    setTimeoutSeconds(String(policy.timeoutMs / 1_000))
    setHealthCheckSeconds(String(policy.healthCheckIntervalMs / 1_000))
    setRetryDelaySeconds(String(policy.retryDelayMs / 1_000))
    setRequireApproval(policy.requireApproval)
    setStatus(task.status)
    setValidatedResult(task.validatedResult ?? '')
    setEditing(true)
  }

  const saveContract = (event: React.FormEvent): void => {
    event.preventDefault()
    const normalizedConstraints = constraints
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean)
    const normalizedDependencies = dependsOn
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean)
    const executionPolicy: ProjectTaskExecutionPolicy = {
      maxAttempts: Number(maxAttempts),
      timeoutMs: Number(timeoutSeconds) * 1_000,
      healthCheckIntervalMs: Number(healthCheckSeconds) * 1_000,
      retryDelayMs: Number(retryDelaySeconds) * 1_000,
      requireApproval,
    }
    const patch = {
      objective,
      constraints: normalizedConstraints,
      dependsOn: normalizedDependencies,
      executionPolicy,
      status,
      validatedResult: validatedResult.trim() || undefined,
      validatedAt: validatedResult.trim() ? Date.now() : undefined,
    }
    const saved = selectedTaskId
      ? updateTask(rootPath, selectedTaskId, patch)
      : createTask(rootPath, {
          ...patch,
          logs: [],
          artifacts: [],
        })
    if (saved) {
      setSelectedTaskId(saved.id)
      setEditing(false)
    }
  }

  const addLog = (event: React.FormEvent): void => {
    event.preventDefault()
    const message = logMessage.trim()
    if (!selectedTask || !message) return
    appendTaskLog(rootPath, selectedTask.id, {
      timestamp: Date.now(),
      level: logLevel,
      message,
    })
    setLogMessage('')
  }

  const addArtifact = (event: React.FormEvent): void => {
    event.preventDefault()
    const label = artifactLabel.trim()
    const locator = artifactLocator.trim()
    if (!selectedTask || !label || !locator) return
    addTaskArtifact(rootPath, selectedTask.id, {
      kind: artifactKind,
      label,
      locator,
      createdAt: Date.now(),
    })
    setArtifactLabel('')
    setArtifactLocator('')
  }

  if (typeof window === 'undefined' || typeof window.electronAPI?.projectTasksLoad !== 'function') return null

  return (
    <section className="mt-2 border-t border-subtle pt-2" data-testid="workspace-tasks">
      <div className="flex items-center gap-1.5 px-2 text-[11px] uppercase tracking-wide text-muted">
        <span className="truncate">Tasks</span>
        {tasks.length > 0 && <span className="rounded-full bg-surface-3 px-1.5 text-[10px]">{tasks.length}</span>}
        {graph.readyTaskIds.length > 0 && (
          <span className="text-[10px] normal-case text-muted" title="Ready tasks in non-conflicting execution lanes">
            {graph.readyTaskIds.length} ready · {graph.safeParallelTaskIds.length} parallel
          </span>
        )}
        <button type="button" className={`${btn.ghost} ml-auto !h-5 !px-1.5 !text-[10px]`} onClick={beginNew}>
          New
        </button>
      </div>

      {tasks.length === 0 && !editing && (
        <p className="px-2 py-1.5 text-[11px] text-muted">No task contracts yet.</p>
      )}

      <div className="mt-1 flex flex-col gap-0.5">
        {tasks.map((task) => {
          const node = graphByTaskId.get(task.id)
          return (
            <button
              type="button"
              key={task.id}
              className={`mx-1 rounded-md px-2 py-1 text-left text-[11px] hover:bg-hover ${selectedTask?.id === task.id ? 'bg-surface-3 text-primary' : 'text-secondary'}`}
              onClick={() => beginEdit(task)}
              title={task.objective}
            >
              <span className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate">{task.objective}</span>
                <span className="flex-shrink-0 capitalize text-muted">{node ? readinessLabel(node.readiness) : taskStatusLabel(task.status)}</span>
              </span>
              <span className="mt-0.5 block text-[10px] text-muted">
                {task.logs.length} log{task.logs.length === 1 ? '' : 's'} · {task.artifacts.length} artifact{task.artifacts.length === 1 ? '' : 's'}
                {(task.dependsOn?.length ?? 0) > 0 && ` · ${task.dependsOn!.length} dep`}
              </span>
            </button>
          )
        })}
      </div>

      {editing && (
        <form className="mx-1 mt-2 flex flex-col gap-2 rounded-md border border-subtle bg-surface-0 p-2" onSubmit={saveContract}>
          <textarea
            className={`${inputCls} min-h-[58px] resize-y !text-[11px]`}
            placeholder="Objective"
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            required
          />
          <textarea
            className={`${inputCls} min-h-[44px] resize-y !text-[11px]`}
            placeholder="Constraints (one per line)"
            value={constraints}
            onChange={(event) => setConstraints(event.target.value)}
          />
          <textarea
            className={`${inputCls} min-h-[44px] resize-y !text-[11px]`}
            placeholder="Dependencies (task IDs, one per line)"
            value={dependsOn}
            onChange={(event) => setDependsOn(event.target.value)}
          />
          <div className="grid grid-cols-2 gap-1.5 text-[10px] text-muted">
            <label className="flex flex-col gap-0.5">Max attempts
              <input className={`${inputCls} !h-7 !text-[11px]`} type="number" min="1" max="5" value={maxAttempts} onChange={(event) => setMaxAttempts(event.target.value)} />
            </label>
            <label className="flex flex-col gap-0.5">Timeout (seconds)
              <input className={`${inputCls} !h-7 !text-[11px]`} type="number" min="1" value={timeoutSeconds} onChange={(event) => setTimeoutSeconds(event.target.value)} />
            </label>
            <label className="flex flex-col gap-0.5">Health check (seconds)
              <input className={`${inputCls} !h-7 !text-[11px]`} type="number" min="1" value={healthCheckSeconds} onChange={(event) => setHealthCheckSeconds(event.target.value)} />
            </label>
            <label className="flex flex-col gap-0.5">Retry delay (seconds)
              <input className={`${inputCls} !h-7 !text-[11px]`} type="number" min="0" value={retryDelaySeconds} onChange={(event) => setRetryDelaySeconds(event.target.value)} />
            </label>
          </div>
          <label className="flex items-center gap-1 text-[10px] text-muted">
            <input type="checkbox" checked={requireApproval} onChange={(event) => setRequireApproval(event.target.checked)} />
            Require human approval before execution
          </label>
          <select className={`${inputCls} !h-7 !text-[11px]`} value={status} onChange={(event) => setStatus(event.target.value as ProjectTask['status'])}>
            {(['planned', 'in-progress', 'blocked', 'completed', 'failed', 'cancelled'] as const).map((value) => (
              <option key={value} value={value}>{taskStatusLabel(value)}</option>
            ))}
          </select>
          <textarea
            className={`${inputCls} min-h-[58px] resize-y !text-[11px]`}
            placeholder="Validated result"
            value={validatedResult}
            onChange={(event) => setValidatedResult(event.target.value)}
          />
          <div className="flex justify-end gap-1.5">
            <button type="button" className={btn.ghost} onClick={() => setEditing(false)}>Cancel</button>
            <button type="submit" className={btn.primary}>Save task</button>
          </div>
        </form>
      )}

      {selectedTask && !editing && (
        <div className="mx-1 mt-2 flex flex-col gap-2 rounded-md border border-subtle bg-surface-0 p-2 text-[10px] text-muted">
          {selectedNode && (
            <div>
              <span className="text-secondary">Readiness:</span> {readinessLabel(selectedNode.readiness)}
              {selectedDependencyMessage && <span> · {selectedDependencyMessage}</span>}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium capitalize text-secondary">{taskStatusLabel(selectedTask.status)}</span>
            <button type="button" className={btn.ghost} onClick={() => beginEdit(selectedTask)}>Edit contract</button>
          </div>
          {selectedTask.constraints.length > 0 && <div><span className="text-secondary">Constraints:</span> {selectedTask.constraints.join(' · ')}</div>}
          {(selectedTask.dependsOn?.length ?? 0) > 0 && <div><span className="text-secondary">Depends on:</span> {selectedTask.dependsOn!.join(' · ')}</div>}
          {selectedTask.executionPolicy && (
            <div>
              <span className="text-secondary">Policy:</span> {selectedTask.executionPolicy.maxAttempts} attempts · {Math.round(selectedTask.executionPolicy.timeoutMs / 1_000)}s timeout · {selectedTask.executionPolicy.requireApproval ? 'approval required' : 'approval not required'}
            </div>
          )}
          {selectedTask.executionPolicy?.requireApproval && (
            <div className="flex flex-wrap items-center gap-1">
              <span><span className="text-secondary">Approval:</span> {selectedTask.approval?.status ?? 'not requested'}</span>
              <button type="button" className={btn.ghost} onClick={() => { requestTaskApproval(rootPath, selectedTask.id) }}>Request</button>
              {selectedTask.approval?.status === 'pending' && <>
                <button type="button" className={btn.ghost} onClick={() => { decideTaskApproval(rootPath, selectedTask.id, 'approved') }}>Approve</button>
                <button type="button" className={btn.ghost} onClick={() => { decideTaskApproval(rootPath, selectedTask.id, 'rejected') }}>Reject</button>
              </>}
            </div>
          )}
          {selectedTask.validatedResult && <div><span className="text-secondary">Validated:</span> {selectedTask.validatedResult}</div>}
          {selectedTask.logs.length > 0 && (
            <div className="max-h-20 overflow-auto">
              {selectedTask.logs.slice(-8).map((entry) => <div key={entry.id}><span className="capitalize text-secondary">{entry.level}</span> · {entry.message}</div>)}
            </div>
          )}
          {selectedTask.artifacts.length > 0 && (
            <div className="max-h-20 overflow-auto">
              {selectedTask.artifacts.slice(-8).map((artifact) => <div key={artifact.id} className="truncate"><span className="text-secondary">{artifact.kind}</span> · {artifact.label}: {artifact.locator}</div>)}
            </div>
          )}
          <form className="flex gap-1" onSubmit={addLog}>
            <select className={`${inputCls} !h-6 w-20 !px-1 !text-[10px]`} value={logLevel} onChange={(event) => setLogLevel(event.target.value as ProjectTaskLogLevel)}>
              {(['info', 'success', 'warning', 'error'] as const).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <input className={`${inputCls} !h-6 min-w-0 flex-1 !text-[10px]`} placeholder="Add log event" value={logMessage} onChange={(event) => setLogMessage(event.target.value)} />
            <button type="submit" className={btn.ghost}>Log</button>
          </form>
          <form className="flex flex-wrap gap-1" onSubmit={addArtifact}>
            <select className={`${inputCls} !h-6 w-24 !px-1 !text-[10px]`} value={artifactKind} onChange={(event) => setArtifactKind(event.target.value as ProjectTaskArtifactKind)}>
              {(['file', 'diff', 'test-report', 'log', 'url', 'other'] as const).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <input className={`${inputCls} !h-6 min-w-0 flex-1 !text-[10px]`} placeholder="Artifact label" value={artifactLabel} onChange={(event) => setArtifactLabel(event.target.value)} />
            <input className={`${inputCls} !h-6 min-w-0 flex-1 !text-[10px]`} placeholder="Locator" value={artifactLocator} onChange={(event) => setArtifactLocator(event.target.value)} />
            <button type="submit" className={btn.ghost}>Add</button>
          </form>
        </div>
      )}
    </section>
  )
}
