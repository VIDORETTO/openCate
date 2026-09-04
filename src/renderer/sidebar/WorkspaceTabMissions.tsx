import React, { useEffect, useMemo, useState } from 'react'
import { codingAgentRunDurationMs } from '../../shared/codingAgentRuns'
import type { GitDiffHunk } from '../../shared/gitDiff'
import type { AgentTreeWorker } from '../lib/agent/agentTree'
import { Modal } from '../ui/Modal'

export const AWAIT_COLOR = '#c08a5a'

/** Sidebar mission actions reuse the canonical driver contract. The dialog
 *  payload is intentionally narrow so it can render compact facts without
 *  duplicating the full inspector or worktree review model here. */
export type AgentWorkerAction = 'inspect' | 'send' | 'stop' | 'review'
export interface AgentWorkerReview {
  branch: string
  baseBranch: string
  dirty?: boolean
  canApply?: boolean
  commits?: Array<{ hash: string; message: string }>
  files?: Array<{ path: string; status: string }>
  workingFiles?: string[]
  diff?: string
  truncated?: boolean
  hunks?: GitDiffHunk[]
  message?: string
}
export type AgentWorkerActionResult = Record<string, unknown> & {
  recentOutput?: string
  statusLine?: string
  failureReason?: string
  branch?: string
  baseBranch?: string
  dirty?: boolean
  canApply?: boolean
  message?: string
  commits?: Array<{ hash: string; message: string }>
  files?: Array<{ path: string; status: string }>
  workingFiles?: string[]
  review?: AgentWorkerReview
}

export interface AgentWorkerActionDialogState {
  action: 'inspect' | 'review'
  worker: AgentTreeWorker
  title: string
  loading: boolean
  error?: string
  result?: AgentWorkerActionResult
}

/** Availability is a UI gate only; the driver remains authoritative and every
 *  action still receives its canonical not-found/not-ready error. */
export function isAgentWorkerActionAvailable(worker: AgentTreeWorker, action: AgentWorkerAction): boolean {
  switch (action) {
    case 'inspect': return true
    case 'review': return Boolean(worker.worktreeId)
    case 'send': return worker.status !== 'stopped' && worker.status !== 'failed'
    case 'stop': return worker.status !== 'stopped' && worker.status !== 'failed'
  }
}

export function isAgentWorkerPromotionReady(worker: AgentTreeWorker): boolean {
  return Boolean(worker.worktreeId && worker.status === 'ready')
}

/** Driver errors are stable machine codes; translate the ones users can act on
 *  and preserve unknown diagnostics instead of hiding them behind "failed". */
export function agentWorkerActionErrorMessage(error: string): string {
  switch (error) {
    case 'coding-agent-not-found': return 'This mission is no longer available.'
    case 'coding-agent-not-isolated': return 'This mission has no isolated worktree to review.'
    case 'coding-agent-not-ready': return 'Wait for this mission to finish before integrating it.'
    case 'worker-does-not-own-worktree': return 'Only missions that created their worktree can discard it.'
    case 'prompt-required': return 'Enter a follow-up prompt.'
    case 'coding-agent-follow-up-unsupported': return 'This agent does not support follow-up prompts.'
    default: return `Action failed: ${error}`
  }
}

/** Compact sidebar presentation for mission facts already derived upstream. */
export function agentTreeStatusColor(status: AgentTreeWorker['status']): string {
  switch (status) {
    case 'waiting': return AWAIT_COLOR
    case 'ready': return '#34c759'
    case 'failed': return '#ff453a'
    case 'stalled': return '#ff9f0a'
    case 'stopped': return '#8e8e93'
    case 'working': return 'var(--focus-blue)'
    default: return '#8e8e93'
  }
}

export function formatAgentTreeTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k`
  return String(Math.round(value))
}

export function formatAgentTreeDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1_000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

export function agentTreeMetrics(worker: AgentTreeWorker): string | null {
  const usage = worker.usage
  const duration = worker.createdAt !== undefined
    ? formatAgentTreeDuration(codingAgentRunDurationMs({
        createdAt: worker.createdAt,
        endedAt: undefined,
        stoppedAt: undefined,
      }))
    : null
  const totalTokens = usage?.totalTokens !== undefined ? formatAgentTreeTokens(usage.totalTokens) : null
  const contextLeft = worker.contextRemainingTokens !== undefined
    ? formatAgentTreeTokens(worker.contextRemainingTokens)
    : null
  const cost = usage?.costUsd !== undefined
    ? `${usage.costSource === 'estimated' ? '~' : ''}$${usage.costUsd.toFixed(usage.costUsd < 0.1 ? 4 : 2)}`
    : null
  const filesTouched = worker.filesTouchedCount !== undefined && worker.filesTouchedCount > 0
    ? `${worker.filesTouchedCount} file${worker.filesTouchedCount === 1 ? '' : 's'}`
    : null
  const parts: string[] = []
  if (worker.lastToolCall?.name) parts.push(worker.lastToolCall.name)
  if (filesTouched) parts.push(filesTouched)
  if (totalTokens) parts.push(`${totalTokens} tok`)
  if (contextLeft) parts.push(`ctx ${contextLeft}`)
  if (cost) parts.push(cost)
  if (duration) parts.push(duration)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** One compact, read-only action result. This is the sidebar's first inspector:
 *  it surfaces canonical driver facts without pretending to be a full diff UI. */
export function AgentWorkerActionDialog({
  state,
  onClose,
  onApplySelection,
}: {
  state: AgentWorkerActionDialogState
  onClose: () => void
  onApplySelection?: (worker: AgentTreeWorker, hunkIds: string[]) => Promise<void>
}): JSX.Element {
  const { worker, loading, error, result } = state
  const review = result?.review ?? (result?.branch ? result as AgentWorkerReview : undefined)
  return (
    <Modal title={state.title} onClose={onClose} width={640} height="min(70vh, 560px)">
      <div className="flex h-full min-h-0 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          <span>{worker.agentName}</span>
          {worker.status && (
            <>
              <span aria-hidden>·</span>
              <span style={{ color: agentTreeStatusColor(worker.status) }}>{worker.status}</span>
            </>
          )}
        </div>

        {loading && <div className="text-[13px] text-muted">Loading…</div>}
        {!loading && error && (
          <div className="rounded-md border border-red-500/25 bg-red-500/10 px-2.5 py-2 text-[12px] text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && review && (
          <div className="rounded-md bg-surface-0 border border-subtle p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-primary">{review.branch}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${
                  review.canApply ? 'bg-green-500/15 text-green-300' : 'bg-amber-500/15 text-amber-300'
                }`}
              >
                {review.canApply ? 'Ready to apply' : 'Needs attention'}
              </span>
            </div>
            {review.baseBranch && <p className="mt-1 text-[11px] text-muted">Target: {review.baseBranch}</p>}
            {!!review.files?.length && (
              <ul className="mt-2 max-h-24 space-y-0.5 overflow-auto text-[11px] text-secondary">
                {review.files.slice(0, 30).map((file) => (
                  <li key={`${file.path}:${file.status}`} className="truncate">{file.path} — {file.status}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!loading && !error && state.action === 'review' && review && (
          <AgentWorkerDiffCard review={review} worker={worker} onApplySelection={onApplySelection} />
        )}

        {!loading && !error && state.action === 'inspect' && (
          <pre
            data-testid="agent-worker-output"
            className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-0 border border-subtle p-2.5 text-[12px] leading-relaxed text-secondary"
          >
            {(result?.recentOutput ?? '').trim() || 'No terminal output yet.'}
          </pre>
        )}
      </div>
    </Modal>
  )
}

function AgentWorkerDiffCard({
  review,
  worker,
  onApplySelection,
}: {
  review: AgentWorkerReview
  worker: AgentTreeWorker
  onApplySelection?: (worker: AgentTreeWorker, hunkIds: string[]) => Promise<void>
}): JSX.Element {
  const hunks = useMemo(() => review.hunks ?? [], [review.hunks])
  const groups = useMemo(() => {
    const grouped = new Map<string, GitDiffHunk[]>()
    for (const hunk of hunks) grouped.set(hunk.path, [...(grouped.get(hunk.path) ?? []), hunk])
    return [...grouped.entries()]
  }, [hunks])
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [applied, setApplied] = useState<Set<string>>(
    () => new Set(worker.approvedHunkIds ?? []),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSelected(new Set())
    setApplied(new Set(worker.approvedHunkIds ?? []))
    setError(null)
  }, [review, worker.approvedHunkIds, worker.runId])

  const availableHunks = hunks.filter((hunk) => !applied.has(hunk.id))
  const availableIds = availableHunks.map((hunk) => hunk.id)
  const selectedCount = selected.size
  const toggle = (id: string): void => {
    if (applied.has(id)) return
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleFile = (fileHunks: GitDiffHunk[]): void => {
    const ids = fileHunks.filter((hunk) => !applied.has(hunk.id)).map((hunk) => hunk.id)
    if (ids.length === 0) return
    setSelected((current) => {
      const next = new Set(current)
      const shouldSelect = ids.some((id) => !next.has(id))
      for (const id of ids) {
        if (shouldSelect) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }
  const apply = async (): Promise<void> => {
    if (!onApplySelection || selectedCount === 0 || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const nextIds = [...selected].filter((id) => !applied.has(id))
      if (nextIds.length === 0) return
      await onApplySelection(worker, nextIds)
      setApplied((current) => new Set([...current, ...nextIds]))
      setSelected(new Set())
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section data-testid="agent-worker-diff-card" className="min-h-0 flex flex-1 flex-col rounded-md border border-subtle bg-surface-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-subtle px-3 py-2">
        <div className="mr-auto">
          <p className="text-[12px] font-medium text-primary">Review changes</p>
          <p className="text-[10px] text-muted">Select files or individual hunks to stage in {review.baseBranch}.</p>
        </div>
        {hunks.length > 0 && (
          <button
            type="button"
            onClick={() => setSelected(new Set(selectedCount === availableIds.length ? [] : availableIds))}
            className="rounded px-1.5 py-1 text-[10px] text-secondary hover:bg-surface-4 hover:text-primary"
          >
            {selectedCount === availableIds.length ? 'Clear all' : 'Select all'}
          </button>
        )}
      </div>

      {review.truncated && (
        <p className="border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          This diff is truncated; reload the review before approving individual changes.
        </p>
      )}
      {hunks.length === 0 && (
        <p className="px-3 py-4 text-[11px] text-muted">
          No selectable text hunks were returned for this review.
        </p>
      )}
      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
        {groups.map(([path, fileHunks]) => {
          const availableFileHunks = fileHunks.filter((hunk) => !applied.has(hunk.id))
          const fileSelected = availableFileHunks.length > 0 && availableFileHunks.every((hunk) => selected.has(hunk.id))
          return (
            <div key={path} className="rounded border border-subtle bg-surface-1">
              <label className="flex items-center gap-2 border-b border-subtle px-2 py-1.5 text-[11px] text-primary">
                <input
                  type="checkbox"
                  checked={fileSelected}
                  onChange={() => toggleFile(fileHunks)}
                  disabled={review.truncated || submitting || availableFileHunks.length === 0}
                  aria-label={`Select all changes in ${path}`}
                />
                <span className="min-w-0 flex-1 truncate">{path}</span>
                <span className="text-[10px] text-muted">{fileHunks.length} hunk{fileHunks.length === 1 ? '' : 's'}</span>
              </label>
              {fileHunks.map((hunk) => (
                <div key={hunk.id} className="border-b border-subtle last:border-b-0">
                  <label className="flex items-center gap-2 px-2 py-1 text-[10px] text-secondary">
                    <input
                      type="checkbox"
                      checked={selected.has(hunk.id)}
                      onChange={() => toggle(hunk.id)}
                      disabled={review.truncated || submitting || applied.has(hunk.id)}
                      aria-label={`Select hunk ${hunk.header} in ${path}`}
                    />
                    <span className="font-mono">{hunk.header}</span>
                    <span className="ml-auto text-muted">+{hunk.additions} −{hunk.deletions}</span>
                    {applied.has(hunk.id) && <span className="text-green-300">staged</span>}
                  </label>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words bg-surface-0 px-2 py-1.5 font-mono text-[10px] leading-relaxed">
                    {hunk.lines.map((line, index) => (
                      <span
                        key={`${hunk.id}:${index}`}
                        className={`block ${line.startsWith('+') ? 'text-green-300/90' : line.startsWith('-') ? 'text-red-300/90' : 'text-secondary'}`}
                      >
                        {line || ' '}
                      </span>
                    ))}
                  </pre>
                </div>
              ))}
            </div>
          )
        })}
      </div>
      {error && <p role="alert" className="border-t border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{error}</p>}
      {onApplySelection && (
        <div className="flex items-center justify-end gap-2 border-t border-subtle px-3 py-2">
          <span className="mr-auto text-[10px] text-muted">{selectedCount} selected</span>
          <button
            type="button"
            onClick={() => void apply()}
            disabled={review.truncated || selectedCount === 0 || submitting || !review.canApply}
            className="rounded-md bg-accent px-2.5 py-1.5 text-[11px] font-medium text-on-accent hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Staging…' : 'Approve selected'}
          </button>
        </div>
      )}
    </section>
  )
}
