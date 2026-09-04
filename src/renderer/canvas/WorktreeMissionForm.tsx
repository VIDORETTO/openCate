import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AGENTS, type AgentId } from '../../shared/agents'
import { Check, CircleNotch, GitBranch, X } from '@phosphor-icons/react'

export interface WorktreeMissionDraft {
  worktreeName: string
  prompt: string
  agentId?: AgentId
  baseRef?: string
}

interface WorktreeMissionFormProps {
  defaultBaseBranch: string
  onSubmit: (draft: WorktreeMissionDraft) => Promise<void>
  onCancel: () => void
}

export const WorktreeMissionForm: React.FC<WorktreeMissionFormProps> = ({
  defaultBaseBranch,
  onSubmit,
  onCancel,
}) => {
  const [worktreeName, setWorktreeName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [agentId, setAgentId] = useState<AgentId | ''>('')
  const [baseRef, setBaseRef] = useState(defaultBaseBranch)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const canSubmit = useMemo(
    () => worktreeName.trim().length > 0 && prompt.trim().length > 0 && !submitting,
    [prompt, submitting, worktreeName],
  )

  const submit = async (event?: React.FormEvent): Promise<void> => {
    event?.preventDefault()
    if (!canSubmit) return
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit({
        worktreeName: worktreeName.trim(),
        prompt: prompt.trim(),
        ...(agentId ? { agentId } : {}),
        ...(baseRef.trim() ? { baseRef: baseRef.trim() } : {}),
      })
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      data-testid="worktree-mission-form"
      className="px-2.5 py-2.5 cate-fade-in"
      onSubmit={(event) => void submit(event)}
    >
      <div className="flex items-center gap-1.5 mb-2 text-primary font-medium">
        <GitBranch size={14} />
        <span>Start task in new worktree</span>
      </div>

      <label className="block mb-2">
        <span className="block mb-1 text-[10px] text-muted">Worktree / branch name</span>
        <input
          ref={nameRef}
          value={worktreeName}
          onChange={(event) => setWorktreeName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void submit()
            }
          }}
          placeholder="e.g. fix-login"
          aria-label="Worktree or branch name"
          disabled={submitting}
          className="w-full h-7 px-2 rounded-md bg-surface-2 border border-subtle text-[12px] text-primary placeholder:text-muted outline-none focus:border-accent/60"
        />
      </label>

      <label className="block mb-2">
        <span className="block mb-1 text-[10px] text-muted">Initial task</span>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              void submit()
            }
          }}
          placeholder="What should the agent implement?"
          aria-label="Initial task"
          disabled={submitting}
          rows={3}
          className="w-full px-2 py-1.5 rounded-md bg-surface-2 border border-subtle text-[12px] leading-relaxed text-primary placeholder:text-muted outline-none resize-none focus:border-accent/60"
        />
        <span className="block mt-1 text-[10px] text-muted">⌘/Ctrl + Enter to start</span>
      </label>

      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <label>
          <span className="block mb-1 text-[10px] text-muted">Agent</span>
          <select
            value={agentId}
            onChange={(event) => setAgentId(event.target.value as AgentId | '')}
            aria-label="Agent"
            disabled={submitting}
            className="w-full h-7 px-1.5 rounded-md bg-surface-2 border border-subtle text-[11px] text-primary outline-none focus:border-accent/60"
          >
            <option value="">Auto</option>
            {AGENTS.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.displayName}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="block mb-1 text-[10px] text-muted">Base branch</span>
          <input
            value={baseRef}
            onChange={(event) => setBaseRef(event.target.value)}
            aria-label="Base branch"
            disabled={submitting}
            className="w-full h-7 px-2 rounded-md bg-surface-2 border border-subtle text-[11px] text-primary placeholder:text-muted outline-none focus:border-accent/60"
          />
        </label>
      </div>

      {error && (
        <div role="alert" className="mb-2 text-[11px] leading-relaxed text-red-400/90">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-[11px] text-muted hover:text-primary hover:bg-surface-4 disabled:opacity-50"
        >
          <X size={12} />
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-accent text-on-accent text-[11px] font-medium hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? <CircleNotch size={12} className="animate-spin" /> : <Check size={12} />}
          {submitting ? 'Starting…' : 'Start mission'}
        </button>
      </div>
    </form>
  )
}
