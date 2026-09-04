import { useCallback, useEffect, useState } from 'react'
import { Check, GitCommit, Warning } from '@phosphor-icons/react'
import type { ElectronAPI } from '../../shared/electron-api'
import { Modal } from '../ui/Modal'
import { errorMessage } from '../lib/errorMessage'
import {
  buildCommitMessage,
  COMMIT_CHECKLIST_ITEMS,
  EMPTY_COMMIT_CHECKLIST,
  isCommitChecklistComplete,
  type CommitChecklist,
} from '../lib/worktreeCommit'

type GitStatus = Awaited<ReturnType<ElectronAPI['gitStatus']>>

export interface WorktreeCommitDialogProps {
  worktreeLabel: string
  worktreePath: string
  workspaceId: string
  onCommit: (message: string, checklist: CommitChecklist) => Promise<boolean>
  onClose: () => void
}

/** Review gate for a worktree commit. The status is advisory in the dialog and
 * is fetched again by the action layer immediately before staging/committing. */
export function WorktreeCommitDialog({
  worktreeLabel,
  worktreePath,
  workspaceId,
  onCommit,
  onClose,
}: WorktreeCommitDialogProps) {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [message, setMessage] = useState('')
  const [messageEdited, setMessageEdited] = useState(false)
  const [checklist, setChecklist] = useState<CommitChecklist>({ ...EMPTY_COMMIT_CHECKLIST })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await window.electronAPI.gitStatus(worktreePath, workspaceId)
      setStatus(next)
      if (!messageEdited) setMessage(buildCommitMessage(next.files))
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not read this worktree status.'))
    } finally {
      setLoading(false)
    }
  }, [messageEdited, worktreePath, workspaceId])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = message.trim()
    if (!trimmed) {
      setError('Enter a commit message.')
      return
    }
    if (!status || status.files.length === 0) {
      setError('There are no changed files to commit.')
      return
    }
    if (!isCommitChecklistComplete(checklist)) {
      setError('Complete the review checklist before committing.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      if (await onCommit(trimmed, checklist)) onClose()
    } catch (err: unknown) {
      setError(errorMessage(err, 'Commit failed.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`Commit in ${worktreeLabel}`}
      icon={<GitCommit size={16} />}
      onClose={onClose}
      width={540}
      dismissable={!submitting}
      bodyClassName="overflow-auto"
    >
      <form className="flex flex-col gap-3 p-4" onSubmit={submit}>
        <div className="text-[11px] text-muted truncate" title={worktreePath}>
          {worktreePath}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-400/20 bg-red-400/10 px-2.5 py-2 text-[12px] text-red-300" role="alert">
            <Warning size={14} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="rounded-lg border border-subtle bg-surface-2/60 p-2.5">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[12px] font-medium text-primary">Changed files</span>
            <span className="text-[10px] text-muted">
              {loading ? 'Loading…' : `${status?.files.length ?? 0} file${status?.files.length === 1 ? '' : 's'}`}
            </span>
          </div>
          {!loading && status?.files.length === 0 && (
            <div className="text-[11px] text-muted">No working tree changes remain.</div>
          )}
          {!loading && status && status.files.length > 0 && (
            <div className="flex flex-col gap-0.5 max-h-32 overflow-auto">
              {status.files.slice(0, 12).map((file) => (
                <div key={`${file.index}${file.working_dir}:${file.path}`} className="flex items-center gap-2 text-[11px]">
                  <span className="w-4 text-center font-mono text-muted">{`${file.index}${file.working_dir}`.trim() || '?'}</span>
                  <span className="truncate text-secondary" title={file.path}>{file.path}</span>
                </div>
              ))}
              {status.files.length > 12 && <div className="text-[10px] text-muted">+{status.files.length - 12} more files</div>}
            </div>
          )}
        </div>

        <label className="flex flex-col gap-1 text-[12px] text-secondary">
          Commit message
          <textarea
            autoFocus
            value={message}
            onChange={(event) => { setMessageEdited(true); setMessage(event.target.value) }}
            rows={2}
            placeholder="Describe the change"
            className="w-full resize-y rounded-lg border border-subtle bg-surface-2 px-2.5 py-2 text-[12px] text-primary placeholder:text-muted focus:outline-none focus:border-focus min-h-[64px]"
          />
          <span className="text-[10px] text-muted">Suggested from the changed files; edit it to reflect the actual change.</span>
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-0.5 text-[12px] font-medium text-primary">Review checklist</legend>
          {COMMIT_CHECKLIST_ITEMS.map(({ key, label }) => (
            <label key={key} className="flex items-start gap-2 text-[11px] leading-relaxed text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={checklist[key]}
                onChange={() => setChecklist((current) => ({ ...current, [key]: !current[key] }))}
                className="mt-0.5 accent-[var(--text-primary)]"
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg px-3 py-1.5 text-[12px] text-secondary hover:bg-hover disabled:opacity-40">
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || submitting || !status?.files.length || !message.trim() || !isCommitChecklistComplete(checklist)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-surface-0 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check size={13} />
            {submitting ? 'Committing…' : 'Commit changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
