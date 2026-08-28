import React, { useEffect, useMemo, useState } from 'react'
import { FileText, NotePencil, PencilSimple, Plus, TerminalWindow, Trash } from '@phosphor-icons/react'

import type { WorktreeMeta } from '../../shared/types'
import {
  projectMemoryNotesForScope,
  projectMemoryScopeKey,
  type ProjectMemoryCitationKind,
  type ProjectMemoryNote,
  type ProjectMemoryScope,
} from '../../shared/projectMemory'
import { useProjectMemoryStore } from '../stores/projectMemoryStore'
import { Modal, btn, inputCls } from '../ui/Modal'
import { SidebarHeaderButton } from './SidebarSectionHeader'

interface WorkspaceMemorySectionProps {
  rootPath: string
  worktrees: readonly WorktreeMeta[]
}

const EMPTY_NOTES: ProjectMemoryNote[] = []

const CITATION_KIND_LABELS: Record<ProjectMemoryCitationKind, string> = {
  file: 'File',
  terminal: 'Terminal',
  'agent-session': 'Agent session',
  task: 'Task',
  url: 'URL',
  manual: 'Manual',
}

function worktreeLabel(worktree: WorktreeMeta): string {
  return worktree.label?.trim() || worktree.path.split(/[\\/]/).filter(Boolean).pop() || worktree.path
}

function citationText(note: ProjectMemoryNote): string {
  const citation = note.citations[0]
  if (!citation) return 'No source'
  const range = citation.lineStart !== undefined
    ? `:${citation.lineStart}${citation.lineEnd !== undefined ? `-${citation.lineEnd}` : ''}`
    : ''
  const label = citation.label === citation.locator ? citation.label : `${citation.label} · ${citation.locator}`
  return `${CITATION_KIND_LABELS[citation.kind]} · ${label}${range}`
}

function parseLine(value: string): number | undefined | 'invalid' {
  if (!value.trim()) return undefined
  const line = Number(value)
  return Number.isInteger(line) && line >= 1 ? line : 'invalid'
}

function sourceLabel(source: string, kind: ProjectMemoryCitationKind): string {
  if (kind === 'file') return source.split(/[\\/]/).filter(Boolean).pop() || source
  return source
}

function MemoryEditor({
  rootPath,
  note,
  defaultScope,
  scopes,
  onClose,
}: {
  rootPath: string
  note?: ProjectMemoryNote
  defaultScope: ProjectMemoryScope
  scopes: readonly ProjectMemoryScope[]
  onClose: () => void
}): JSX.Element {
  const firstCitation = note?.citations[0]
  const [title, setTitle] = useState(note?.title ?? '')
  const [content, setContent] = useState(note?.content ?? '')
  const [scopeKey, setScopeKey] = useState(projectMemoryScopeKey(note?.scope ?? defaultScope))
  const [sourceKind, setSourceKind] = useState<ProjectMemoryCitationKind>(firstCitation?.kind ?? 'manual')
  const [source, setSource] = useState(firstCitation?.locator ?? '')
  const [lineStart, setLineStart] = useState(firstCitation?.lineStart?.toString() ?? '')
  const [lineEnd, setLineEnd] = useState(firstCitation?.lineEnd?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)

  const scope = scopes.find((candidate) => projectMemoryScopeKey(candidate) === scopeKey) ?? defaultScope

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    const cleanTitle = title.trim()
    const cleanContent = content.trim()
    const cleanSource = source.trim()
    if (!cleanTitle) { setError('Title is required'); return }
    if (!cleanContent) { setError('Note content is required'); return }
    if (!cleanSource) { setError('A source citation is required'); return }
    const start = parseLine(lineStart)
    const end = parseLine(lineEnd)
    if (start === 'invalid' || end === 'invalid') { setError('Line numbers must be positive integers'); return }
    if (start !== undefined && end !== undefined && end < start) { setError('End line must not precede start line'); return }

    const saved = useProjectMemoryStore.getState().saveNote(rootPath, note?.id ?? null, {
      scope,
      title: cleanTitle,
      content: cleanContent,
      citations: [{
        kind: sourceKind,
        label: sourceLabel(cleanSource, sourceKind),
        locator: cleanSource,
        ...(sourceKind === 'file' && start !== undefined ? { lineStart: start } : {}),
        ...(sourceKind === 'file' && end !== undefined ? { lineEnd: end } : {}),
      }],
    })
    if (!saved) { setError('The note could not be saved'); return }
    onClose()
  }

  const remove = (): void => {
    if (!note) return
    useProjectMemoryStore.getState().deleteNote(rootPath, note.id)
    onClose()
  }

  return (
    <Modal
      title={note ? 'Edit memory note' : 'New memory note'}
      icon={<NotePencil size={16} />}
      onClose={onClose}
      width={520}
      bodyClassName="overflow-auto"
    >
      <form className="flex flex-col gap-3 p-4" onSubmit={submit}>
        <label className="flex flex-col gap-1 text-[12px] text-secondary">
          Title
          <input
            className={inputCls}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Release checklist"
            autoFocus
          />
        </label>

        <label className="flex flex-col gap-1 text-[12px] text-secondary">
          Scope
          <select className={inputCls} value={scopeKey} onChange={(event) => setScopeKey(event.target.value)}>
            {scopes.map((candidate) => (
              <option key={projectMemoryScopeKey(candidate)} value={projectMemoryScopeKey(candidate)}>
                {candidate.kind === 'project' ? 'Project' : `Worktree · ${candidate.path.split(/[\\/]/).filter(Boolean).pop() || candidate.path}`}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[12px] text-secondary">
          Note
          <textarea
            className={`${inputCls} min-h-[120px] resize-y`}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Record a decision, constraint, or fact that future work should remember."
          />
        </label>

        <div className="flex gap-2">
          <label className="flex min-w-[130px] flex-col gap-1 text-[12px] text-secondary">
            Source type
            <select className={inputCls} value={sourceKind} onChange={(event) => setSourceKind(event.target.value as ProjectMemoryCitationKind)}>
              {Object.entries(CITATION_KIND_LABELS).map(([kind, label]) => (
                <option key={kind} value={kind}>{label}</option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-[12px] text-secondary">
            Source locator
            <input
              className={inputCls}
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder={sourceKind === 'file' ? 'src/file.ts' : 'URL, terminal id, task id…'}
            />
          </label>
        </div>

        {sourceKind === 'file' && (
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-[12px] text-secondary">
              Start line
              <input className={inputCls} inputMode="numeric" value={lineStart} onChange={(event) => setLineStart(event.target.value)} placeholder="optional" />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-[12px] text-secondary">
              End line
              <input className={inputCls} inputMode="numeric" value={lineEnd} onChange={(event) => setLineEnd(event.target.value)} placeholder="optional" />
            </label>
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-muted">
          Citations record where the note came from; terminal scrollback is never captured automatically.
        </p>
        {error && <p className="text-[12px] text-red-400">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          {note && (
            <button type="button" className={btn.danger} onClick={remove}>
              <Trash size={13} /> Delete
            </button>
          )}
          <span className="flex-1" />
          <button type="button" className={btn.secondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={btn.primary}>Save note</button>
        </div>
      </form>
    </Modal>
  )
}

export const WorkspaceMemorySection: React.FC<WorkspaceMemorySectionProps> = ({ rootPath, worktrees }) => {
  const notes = useProjectMemoryStore((state) => state.notesByRoot[rootPath] ?? EMPTY_NOTES)
  const [scopeKey, setScopeKey] = useState('project')
  const [editor, setEditor] = useState<'new' | string | null>(null)

  useEffect(() => {
    if (!rootPath || typeof window.electronAPI?.projectMemoryLoad !== 'function') return
    void useProjectMemoryStore.getState().loadMemory(rootPath)
  }, [rootPath])

  const scopes = useMemo<readonly ProjectMemoryScope[]>(() => [
    { kind: 'project' },
    ...worktrees.map((worktree) => ({ kind: 'worktree' as const, path: worktree.path })),
  ], [worktrees])

  const selectedScope = useMemo(() => {
    return scopes.find((scope) => projectMemoryScopeKey(scope) === scopeKey) ?? scopes[0]
  }, [scopeKey, scopes])
  const visibleNotes = useMemo(
    () => projectMemoryNotesForScope(notes, selectedScope),
    [notes, selectedScope],
  )
  const editingNote = editor && editor !== 'new' ? notes.find((note) => note.id === editor) : undefined

  if (typeof window.electronAPI?.projectMemoryLoad !== 'function') return null

  return (
    <div className="mt-2 border-t border-subtle/60 pt-1" data-testid="workspace-memory" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center gap-1.5 px-2 pr-1 text-[11px] uppercase tracking-wide text-muted">
        <NotePencil size={12} className="flex-shrink-0 opacity-70" />
        <span className="truncate">Memory</span>
        <span className="text-[10px] opacity-70">{notes.length}</span>
        <span className="flex-1" />
        <SidebarHeaderButton title="Add memory note" onClick={() => setEditor('new')}>
          <Plus size={13} />
        </SidebarHeaderButton>
      </div>

      <div className="flex items-center gap-1 px-2 py-1">
        <select
          className="min-w-0 flex-1 rounded border border-subtle bg-surface-5 px-1.5 py-1 text-[11px] text-secondary outline-none focus:border-focus-blue"
          aria-label="Memory scope"
          value={projectMemoryScopeKey(selectedScope)}
          onChange={(event) => setScopeKey(event.target.value)}
        >
          {scopes.map((scope) => (
            <option key={projectMemoryScopeKey(scope)} value={projectMemoryScopeKey(scope)}>
              {scope.kind === 'project' ? 'Project memory' : `Worktree · ${worktreeLabel(worktrees.find((w) => w.path === scope.path) ?? { id: scope.path, path: scope.path, color: '' })}`}
            </option>
          ))}
        </select>
      </div>

      {visibleNotes.length === 0 ? (
        <button
          type="button"
          className="mx-2 mb-1 flex w-[calc(100%-1rem)] items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11px] text-muted hover:bg-hover hover:text-secondary"
          onClick={() => setEditor('new')}
        >
          <NotePencil size={12} />
          <span>No notes for this scope — add one</span>
        </button>
      ) : (
        <div className="flex max-h-[220px] flex-col overflow-y-auto">
          {visibleNotes.map((note) => (
            <div key={note.id} className="group/memory mx-1.5 my-0.5 flex min-w-0 items-center rounded-lg hover:bg-hover">
              <button type="button" className="flex min-w-0 flex-1 flex-col gap-0.5 px-2 py-1 text-left" onClick={() => setEditor(note.id)}>
                <span className="truncate text-[12px] text-primary">{note.title}</span>
                <span className="flex min-w-0 items-center gap-1 truncate text-[10px] text-muted">
                  {note.citations[0]?.kind === 'file' ? <FileText size={10} /> : <TerminalWindow size={10} />}
                  <span className="truncate">{citationText(note)}</span>
                </span>
              </button>
              <SidebarHeaderButton title="Edit memory note" className="mr-1 opacity-0 group-hover/memory:opacity-100" onClick={() => setEditor(note.id)}>
                <PencilSimple size={12} />
              </SidebarHeaderButton>
            </div>
          ))}
        </div>
      )}

      {editor && (
        <MemoryEditor
          key={editor}
          rootPath={rootPath}
          note={editingNote}
          defaultScope={selectedScope}
          scopes={scopes}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  )
}

