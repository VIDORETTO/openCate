import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, FileText, GitBranch, GitDiff, NotePencil, PaperPlaneTilt, Plus, TerminalWindow, WarningCircle, X } from '@phosphor-icons/react'
import { useShallow } from 'zustand/shallow'
import type { CodingAgentRunSnapshot } from '../../shared/codingAgentRuns'
import { codingAgentSnapshot, sendCodingAgentFollowUp } from '../lib/agent/codingAgentDriver'
import {
  codingAgentBroadcastStatusLabel,
  eligibleCodingAgentBroadcastTargets,
  translateBroadcastSlashCommand,
} from '../lib/agent/codingAgentBroadcast'
import { useAgentContextGraphStore } from '../lib/agent/agentContextGraphStore'
import { useAgentContextBus } from '../lib/agent/useAgentContextBus'
import { useAppStore } from '../stores/appStore'
import { useWorktrees } from '../stores/useWorktrees'
import { Tooltip } from '../ui/Tooltip'
import { getActivePanelId } from '../lib/activePanel'
import { getEntry } from '../lib/terminal/registryState'
import { createAgentAuditCorrelationId, recordAgentAudit } from '../lib/agent/recordAgentAudit'

interface WorkspaceFileChoice {
  path: string
  name: string
  relativePath: string
}

const POPOVER_WIDTH = 380

interface GlobalAgentComposerProps {
  workspaceId: string
  placement?: 'top' | 'right'
}

interface AnchorPosition {
  left: number
  bottom: number
}

function errorLabel(error: string): string {
  switch (error) {
    case 'coding-agent-not-ready': return 'not ready'
    case 'coding-agent-follow-up-unsupported': return 'follow-up unsupported'
    case 'coding-agent-stopped': return 'stopped'
    case 'coding-agent-not-found': return 'no longer available'
    default: return error
  }
}

async function searchWorkspaceFiles(
  rootPath: string,
  query: string,
  workspaceId: string,
): Promise<WorkspaceFileChoice[]> {
  if (!query.trim()) return []
  try {
    const results = await window.electronAPI.fsSearch(rootPath, query.trim(), { maxResults: 8 }, workspaceId)
    return results.filter((result) => !result.isDirectory).map((result) => ({
      path: result.path,
      name: result.name,
      relativePath: result.relativePath,
    }))
  } catch {
    return []
  }
}

/** A compact, canvas-owned composer for one prompt sent to selected Cate-owned
 * missions. It deliberately does not target arbitrary terminal panels. */
export const GlobalAgentComposer: React.FC<GlobalAgentComposerProps> = ({ workspaceId, placement = 'top' }) => {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const initializedRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [translateSlash, setTranslateSlash] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sent: number; failures: Array<{ name: string; error: string }> } | null>(null)
  const [anchor, setAnchor] = useState<AnchorPosition | null>(null)
  const contextBus = useAgentContextBus()
  const recordContextDelivery = useAgentContextGraphStore((state) => state.recordDelivery)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileQuery, setFileQuery] = useState('')
  const [fileChoices, setFileChoices] = useState<WorkspaceFileChoice[]>([])
  const [stagingFile, setStagingFile] = useState(false)
  const [diffWorktreeId, setDiffWorktreeId] = useState('')
  const [stagingDiff, setStagingDiff] = useState(false)
  const [, setStatusTick] = useState(0)

  // The terminal/status stores are intentionally not coupled to the canvas
  // store. A small open-only clock lets the list reflect hook transitions and
  // stalled/finished derivation without making the toolbar poll forever.
  useEffect(() => {
    if (!open) return
    const timer = window.setInterval(() => setStatusTick((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [open])

  const missionPanels = useAppStore(useShallow((state) => {
    const workspace = state.workspaces.find((candidate) => candidate.id === workspaceId)
    return Object.values(workspace?.panels ?? {}).filter((panel) => panel.codingAgentRun || panel.type === 'terminal')
  }))

  const terminalPanels = useMemo(() => missionPanels.filter((panel) => panel.type === 'terminal'), [missionPanels])

  const workspace = useAppStore(useShallow((state) => state.workspaces.find((candidate) => candidate.id === workspaceId)))
  const rootPath = workspace?.rootPath ?? ''
  const worktrees = useWorktrees(rootPath, workspaceId)

  const runs = missionPanels
    .map((panel) => panel.codingAgentRun
      ? codingAgentSnapshot(workspaceId, panel.codingAgentRun.ownerPanelId, panel.codingAgentRun.id)
      : null)
    .filter((run): run is CodingAgentRunSnapshot => run !== null)
    .sort((a, b) => (a.title ?? a.agentName).localeCompare(b.title ?? b.agentName))

  const eligibleRuns = useMemo(() => eligibleCodingAgentBroadcastTargets(runs), [runs])
  const selectedRuns = useMemo(() => eligibleRuns.filter((run) => selectedIds.has(run.id)), [eligibleRuns, selectedIds])
  const translation = useMemo(
    () => translateBroadcastSlashCommand(draft, translateSlash),
    [draft, translateSlash],
  )

  useEffect(() => {
    if (!open) {
      initializedRef.current = false
      setConfirming(false)
      return
    }
    if (!initializedRef.current) {
      initializedRef.current = true
      setSelectedIds(new Set(eligibleRuns.map((run) => run.id)))
      return
    }
    setSelectedIds((current) => {
      const valid = new Set(eligibleRuns.map((run) => run.id))
      const next = new Set([...current].filter((id) => valid.has(id)))
      if (next.size === current.size && [...next].every((id) => current.has(id))) return current
      return next
    })
  }, [eligibleRuns, open])

  useEffect(() => {
    if (!open) return
    const updateAnchor = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      setAnchor({
        left: Math.min(Math.max(8, rect.right - POPOVER_WIDTH), Math.max(8, window.innerWidth - POPOVER_WIDTH - 8)),
        bottom: Math.max(8, window.innerHeight - rect.top + 8),
      })
    }
    updateAnchor()
    window.addEventListener('resize', updateAnchor)
    window.addEventListener('scroll', updateAnchor, true)
    return () => {
      window.removeEventListener('resize', updateAnchor)
      window.removeEventListener('scroll', updateAnchor, true)
    }
  }, [open, placement])

  useEffect(() => {
    if (!open || !rootPath) {
      setFileChoices([])
      return
    }
    const timer = window.setTimeout(async () => {
      setFileChoices(await searchWorkspaceFiles(rootPath, fileQuery, workspaceId))
    }, 180)
    return () => window.clearTimeout(timer)
  }, [fileQuery, open, rootPath, workspaceId])

  useEffect(() => {
    if (!open) return
    const onOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if ((target as HTMLElement).closest?.('[data-global-agent-composer]')) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  const toggleSelected = (runId: string) => {
    setConfirming(false)
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(runId)) next.delete(runId)
      else next.add(runId)
      return next
    })
  }

  const selectAll = () => {
    setConfirming(false)
    setSelectedIds((current) => current.size === eligibleRuns.length
      ? new Set()
      : new Set(eligibleRuns.map((run) => run.id)))
  }

  const send = async () => {
    const prompt = [contextBus.prompt, translation.text.trim()].filter(Boolean).join('\n\n')
    if (!prompt || selectedRuns.length === 0 || sending) return
    if (selectedRuns.length > 1 && !confirming) {
      setConfirming(true)
      return
    }
    setSending(true)
    setConfirming(false)
    const failures: Array<{ name: string; error: string }> = []
    const deliveredTo: string[] = []
    const sourcePanelId = getActivePanelId() ?? undefined
    const correlationId = createAgentAuditCorrelationId()
    const contextItemIds = contextBus.items.map((item) => item.id)
    const contextChars = contextBus.items.reduce((total, item) => total + item.content.length, 0)
    const promptText = translation.text.trim()
    const promptKind = translation.command ? 'command' : 'prompt'
    let sent = 0
    for (const run of selectedRuns) {
      const outcome = await sendCodingAgentFollowUp(workspaceId, run.ownerPanelId, run.id, prompt, {
        enabled: Boolean(promptText),
        actor: {
          kind: 'human',
          id: 'local-user',
          label: 'Global composer',
          origin: 'global-composer',
          ...(sourcePanelId ? { sourcePanelId } : {}),
        },
        kind: promptKind,
        ...(translation.command ? { commandName: translation.command } : {}),
        contentChars: promptText.length,
        correlationId,
      })
      const auditOutcome = outcome.ok ? 'sent' : 'failed'
      if (contextItemIds.length > 0) {
        recordAgentAudit(rootPath, {
          kind: 'context',
          outcome: auditOutcome,
          actorKind: 'human',
          actorId: 'local-user',
          actorLabel: 'Global composer',
          origin: 'global-composer',
          ...(sourcePanelId ? { sourcePanelId } : {}),
          targetPanelId: run.panelId,
          targetRunId: run.id,
          correlationId,
          contextItemIds,
          contentChars: contextChars,
          ...(!outcome.ok ? { error: outcome.error } : {}),
        })
      }
      if (outcome.ok) {
        sent++
        deliveredTo.push(run.panelId)
      } else failures.push({ name: run.title ?? run.agentName, error: errorLabel(outcome.error) })
    }
    if (deliveredTo.length > 0) recordContextDelivery(contextBus.items, deliveredTo)
    setSending(false)
    setResult({ sent, failures })
    if (sent > 0) setDraft('')
  }

  const composer = open && anchor && createPortal(
    <div
      data-global-agent-composer
      role="dialog"
      aria-label="Broadcast prompt"
      className="fixed z-[10000] rounded-xl border border-strong bg-surface-2/98 shadow-[0_18px_48px_var(--shadow-node)] backdrop-blur-xl overflow-hidden"
      style={{ left: anchor.left, bottom: anchor.bottom, width: POPOVER_WIDTH, maxWidth: 'calc(100vw - 16px)' }}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-subtle">
        <PaperPlaneTilt size={15} className="text-secondary" />
        <span className="flex-1 text-[12px] font-medium text-primary">Broadcast prompt</span>
        <span className="text-[10px] text-muted">{selectedRuns.length}/{eligibleRuns.length}</span>
        <button type="button" aria-label="Close broadcast prompt" onClick={() => setOpen(false)} className="p-1 rounded-md text-muted hover:text-primary hover:bg-hover">
          <X size={13} />
        </button>
      </div>

      <div className="max-h-[430px] overflow-y-auto p-2">
        <div className="flex items-center justify-between px-1 pb-1">
          <span className="text-[10px] uppercase tracking-wide text-muted">Agents</span>
          <button type="button" onClick={selectAll} disabled={eligibleRuns.length === 0} className="text-[10px] text-secondary hover:text-primary disabled:opacity-40">
            {selectedRuns.length === eligibleRuns.length && eligibleRuns.length > 0 ? 'Clear all' : 'Select all'}
          </button>
        </div>

        {runs.length === 0 && (
          <div className="px-2 py-5 text-center text-[11px] text-muted">No Cate-owned agent sessions</div>
        )}
        {runs.length > 0 && (
          <div className="space-y-0.5">
            {runs.map((run) => {
              const eligible = eligibleRuns.some((candidate) => candidate.id === run.id)
              return (
                <label key={run.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${eligible ? 'hover:bg-hover cursor-pointer' : 'opacity-45'}`}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(run.id)}
                    disabled={!eligible || sending}
                    onChange={() => toggleSelected(run.id)}
                    className="accent-[var(--focus-blue)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] text-primary">{run.title ?? run.agentName}</span>
                    <span className="block truncate text-[10px] text-muted">{run.agentName} · {codingAgentBroadcastStatusLabel(run)}</span>
                  </span>
                  {eligible && selectedIds.has(run.id) && <Check size={13} className="flex-shrink-0 text-secondary" />}
                  {!eligible && <span title={run.followUpSupported ? 'Agent is not ready for a follow-up' : 'This CLI does not support follow-up prompts'}><WarningCircle size={13} className="flex-shrink-0 text-muted" /></span>}
                </label>
              )
            })}
          </div>
        )}

        <textarea
          value={draft}
          onChange={(event) => { setDraft(event.target.value); setConfirming(false); setResult(null) }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              void send()
            }
          }}
          rows={4}
          maxLength={50_000}
          placeholder="Send a follow-up to selected agents…"
          className="mt-2 w-full resize-y rounded-lg border border-subtle bg-surface-0 px-2.5 py-2 text-[12px] text-primary placeholder:text-muted outline-none focus:border-strong"
        />

        {draft.trim().startsWith('/') && (
          <label className="mt-2 flex items-center gap-2 px-1 text-[10px] text-secondary">
            <input type="checkbox" checked={translateSlash} onChange={(event) => { setTranslateSlash(event.target.checked); setConfirming(false) }} className="accent-[var(--focus-blue)]" />
            Translate neutral slash commands
          </label>
        )}
        {translation.translated && <div className="mt-1 px-1 text-[10px] text-muted">Translated /{translation.command} into a provider-neutral prompt.</div>}
        <div className="mt-3 border-t border-subtle pt-2">
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="text-[10px] uppercase tracking-wide text-muted">Explicit context</span>
            <span className="text-[10px] text-muted">{contextBus.items.length}/10</span>
          </div>
          <div className="flex flex-wrap gap-1.5 px-1">
            <button type="button" aria-label="Stage note as explicit context" onClick={() => contextBus.stage({ kind: 'note', title: 'Note', content: draft.trim() })} disabled={!draft.trim()} className="inline-flex items-center gap-1 rounded-md border border-subtle px-2 py-1 text-[10px] text-secondary hover:text-primary hover:bg-hover disabled:opacity-40"><NotePencil size={11} /> Note</button>
            <button type="button" aria-label="Stage focused terminal selection as explicit context" onClick={() => {
              const activeId = getActivePanelId()
              const candidate = activeId
                ? terminalPanels.find((panel) => panel.id === activeId)
                : undefined
              const fallback = candidate ?? terminalPanels[0]
              if (!fallback) {
                contextBus.stage({ kind: 'terminal-selection', title: 'Terminal selection', source: 'Terminal', content: '' })
                return
              }
              const entry = getEntry(fallback.id)
              const baseLabel = fallback.title || fallback.id
              const label = entry?.terminal.hasSelection()
                ? `${baseLabel} — selected`
                : baseLabel
              contextBus.stageTerminalSelection(fallback.id, label)
            }} className="inline-flex items-center gap-1 rounded-md border border-subtle px-2 py-1 text-[10px] text-secondary hover:text-primary hover:bg-hover"><TerminalWindow size={11} /> Selection</button>
            <button type="button" aria-label="Stage artifact as explicit context" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1 rounded-md border border-subtle px-2 py-1 text-[10px] text-secondary hover:text-primary hover:bg-hover"><Plus size={11} /> Artifact</button>
            <input ref={fileInputRef} type="file" hidden onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              void file.text().then((content) => contextBus.stage({
                kind: 'artifact',
                title: file.name,
                source: file.name,
                content,
              }))
              event.target.value = ''
            }} />
          </div>

          <div className="mt-2 px-1">
            <input
              value={fileQuery}
              onChange={(event) => setFileQuery(event.target.value)}
              placeholder="Search a workspace file…"
              aria-label="Search workspace file to stage"
              className="w-full rounded-lg border border-subtle bg-surface-0 px-2 py-1 text-[10px] text-primary placeholder:text-muted outline-none focus:border-strong"
            />
            {fileChoices.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {fileChoices.map((choice) => (
                  <button key={choice.path} type="button" data-workspace-file-choice={choice.path} disabled={stagingFile} onClick={async () => {
                    setStagingFile(true)
                    await contextBus.stageWorkspaceFile(workspaceId, choice.path, choice.relativePath)
                    setStagingFile(false)
                  }} className="block w-full truncate rounded-md px-2 py-1 text-left text-[10px] text-secondary hover:bg-hover hover:text-primary disabled:opacity-40">{choice.name}<span className="ml-1 text-muted">· {choice.relativePath}</span></button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center gap-1.5 px-1">
            <GitBranch size={12} className="text-muted" />
            <select value={diffWorktreeId} onChange={(event) => setDiffWorktreeId(event.target.value)} aria-label="Select worktree for diff context" className="min-w-0 flex-1 rounded-md border border-subtle bg-surface-0 px-1.5 py-1 text-[10px] text-primary outline-none focus:border-strong">
              <option value="">Select worktree…</option>
              {worktrees.map((worktree) => (
                <option key={worktree.id} value={worktree.id}>{worktree.label || worktree.path.split(/[\\/]/).pop()}</option>
              ))}
            </select>
            <button type="button" aria-label="Stage worktree diff as explicit context" disabled={!diffWorktreeId || stagingDiff} onClick={async () => {
              const selected = worktrees.find((worktree) => worktree.id === diffWorktreeId)
              if (!selected || !rootPath) return
              setStagingDiff(true)
              try {
                const primaryStatus = await window.electronAPI.gitStatus(rootPath, workspaceId)
                const baseBranch = primaryStatus.current
                if (!baseBranch) throw new Error('target-branch-not-found')
                const review = await window.electronAPI.gitWorktreeReview(selected.path, baseBranch, workspaceId)
                await contextBus.stageWorktreeDiff(selected.path, baseBranch, review.diff)
              } finally {
                setStagingDiff(false)
              }
            }} className="inline-flex items-center gap-1 rounded-md border border-subtle px-2 py-1 text-[10px] text-secondary hover:text-primary hover:bg-hover disabled:opacity-40"><GitDiff size={11} /> Diff</button>
          </div>
          {contextBus.items.length > 0 && (
            <div className="mt-2 space-y-1">
              {contextBus.items.map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded-lg border border-subtle bg-surface-0 px-2 py-1">
                  {item.kind === 'note' && <NotePencil size={12} className="text-muted" />}
                  {item.kind === 'terminal-selection' && <TerminalWindow size={12} className="text-muted" />}
                  {item.kind === 'diff' && <GitDiff size={12} className="text-muted" />}
                  {(item.kind === 'file' || item.kind === 'artifact') && <FileText size={12} className="text-muted" />}
                  <span className="min-w-0 flex-1 truncate text-[10px] text-primary">{item.title}</span>
                  <button type="button" aria-label={`Remove ${item.title}`} onClick={() => contextBus.remove(item.id)} className="p-0.5 rounded text-muted hover:text-primary hover:bg-hover"><X size={11} /></button>
                </div>
              ))}
              <button type="button" onClick={() => contextBus.clear()} className="px-1 text-[10px] text-muted hover:text-primary">Clear all</button>
            </div>
          )}
          {contextBus.error && <div className="mt-1 px-1 text-[10px] text-warning">{contextBus.error}</div>}
        </div>
        {result && (
          <div className="mt-2 rounded-lg border border-subtle px-2 py-1.5 text-[10px] text-secondary">
            {result.sent > 0 && <span>{result.sent} prompt{result.sent === 1 ? '' : 's'} sent.</span>}
            {result.failures.map((failure) => <span key={`${failure.name}-${failure.error}`} className="block text-muted">{failure.name}: {failure.error}</span>)}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-subtle px-3 py-2">
        {confirming && <button type="button" onClick={() => setConfirming(false)} className="text-[11px] text-muted hover:text-primary">Cancel</button>}
        <button
          type="button"
          aria-label={confirming ? `Confirm broadcast to ${selectedRuns.length} agents` : 'Send broadcast'}
          onClick={() => { void send() }}
          disabled={sending || !draft.trim() || selectedRuns.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-strong bg-hover-strong px-2.5 py-1.5 text-[11px] text-primary hover:bg-hover disabled:opacity-40"
        >
          <PaperPlaneTilt size={12} />
          {sending ? 'Sending…' : confirming ? `Confirm broadcast to ${selectedRuns.length}` : 'Send'}
        </button>
      </div>
    </div>,
    document.body,
  )

  return (
    <>
      <Tooltip label="Broadcast prompt to agent sessions" placement={placement}>
        <button
          ref={triggerRef}
          type="button"
          aria-label="Broadcast prompt to agent sessions"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          style={{ WebkitTapHighlightColor: 'transparent' }}
          className={`w-9 h-9 ${open ? 'bg-hover-strong text-primary' : 'bg-transparent text-secondary'} flex items-center justify-center rounded-full hover:text-primary hover:bg-hover-strong active:bg-hover-strong active:scale-[0.92] focus:outline-none focus-visible:outline-none transition-all duration-100`}
        >
          <PaperPlaneTilt size={17} />
        </button>
      </Tooltip>
      {composer}
    </>
  )
}
