// =============================================================================
// Project memory — durable, user-curated notes scoped to a project or one of
// its worktrees. The note body is intentional user input; citations are
// metadata-only provenance and never contain an implicit terminal transcript.
// =============================================================================

export type ProjectMemoryScope =
  | { kind: 'project' }
  | { kind: 'worktree'; path: string }

export type ProjectMemoryCitationKind =
  | 'file'
  | 'terminal'
  | 'agent-session'
  | 'task'
  | 'url'
  | 'manual'

export interface ProjectMemoryCitation {
  kind: ProjectMemoryCitationKind
  /** Short label shown in the memory list. */
  label: string
  /** Stable locator: repo-relative file, terminal/session id, task id or URL. */
  locator: string
  lineStart?: number
  lineEnd?: number
}

export interface ProjectMemoryNote {
  id: string
  scope: ProjectMemoryScope
  title: string
  content: string
  citations: ProjectMemoryCitation[]
  createdAt: number
  updatedAt: number
}

export interface ProjectMemoryFile {
  version: 1
  notes: ProjectMemoryNote[]
}

export type ProjectMemoryNoteDraft = Omit<ProjectMemoryNote, 'id' | 'createdAt' | 'updatedAt'>

export const PROJECT_MEMORY_FILE_VERSION = 1 as const
export const MAX_PROJECT_MEMORY_NOTES = 200
export const MAX_PROJECT_MEMORY_TITLE_CHARS = 120
export const MAX_PROJECT_MEMORY_CONTENT_CHARS = 20_000
export const MAX_PROJECT_MEMORY_CITATIONS = 8
export const MAX_PROJECT_MEMORY_LABEL_CHARS = 160
export const MAX_PROJECT_MEMORY_LOCATOR_CHARS = 8_000
export const MAX_PROJECT_MEMORY_SCOPE_PATH_CHARS = 8_000

const CITATION_KINDS = new Set<ProjectMemoryCitationKind>([
  'file',
  'terminal',
  'agent-session',
  'task',
  'url',
  'manual',
])

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string' || value.includes('\0')) return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

function boundedTime(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function boundedLine(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : undefined
}

export function normalizeProjectMemoryScope(raw: unknown): ProjectMemoryScope | null {
  const value = recordValue(raw)
  if (!value || value.kind === 'project') return value?.kind === 'project' ? { kind: 'project' } : null
  if (value.kind !== 'worktree') return null
  const path = boundedText(value.path, MAX_PROJECT_MEMORY_SCOPE_PATH_CHARS)
  return path ? { kind: 'worktree', path } : null
}

export function normalizeProjectMemoryCitation(raw: unknown): ProjectMemoryCitation | null {
  const value = recordValue(raw)
  if (!value || typeof value.kind !== 'string' || !CITATION_KINDS.has(value.kind as ProjectMemoryCitationKind)) return null
  const locator = boundedText(value.locator, MAX_PROJECT_MEMORY_LOCATOR_CHARS)
  if (!locator) return null
  const label = boundedText(value.label, MAX_PROJECT_MEMORY_LABEL_CHARS) ?? locator.slice(0, MAX_PROJECT_MEMORY_LABEL_CHARS)
  const lineStart = boundedLine(value.lineStart)
  const lineEnd = boundedLine(value.lineEnd)
  if (lineStart !== undefined && lineEnd !== undefined && lineEnd < lineStart) return null
  return {
    kind: value.kind as ProjectMemoryCitationKind,
    label,
    locator,
    ...(lineStart !== undefined ? { lineStart } : {}),
    ...(lineEnd !== undefined ? { lineEnd } : {}),
  }
}

export function normalizeProjectMemoryNote(raw: unknown): ProjectMemoryNote | null {
  const value = recordValue(raw)
  if (!value) return null
  const id = boundedText(value.id, 128)
  const title = boundedText(value.title, MAX_PROJECT_MEMORY_TITLE_CHARS)
  const content = boundedText(value.content, MAX_PROJECT_MEMORY_CONTENT_CHARS)
  const scope = normalizeProjectMemoryScope(value.scope)
  const createdAt = boundedTime(value.createdAt)
  const updatedAt = boundedTime(value.updatedAt)
  const citations = Array.isArray(value.citations)
    ? value.citations
      .map(normalizeProjectMemoryCitation)
      .filter((citation): citation is ProjectMemoryCitation => citation !== null)
      .slice(0, MAX_PROJECT_MEMORY_CITATIONS)
    : []
  if (!id || !title || !content || !scope || createdAt === null || updatedAt === null || citations.length === 0) return null
  return { id, scope, title, content, citations, createdAt, updatedAt }
}

export function normalizeProjectMemoryFile(raw: unknown): ProjectMemoryFile {
  const value = recordValue(raw)
  const notes = value?.version === PROJECT_MEMORY_FILE_VERSION && Array.isArray(value.notes)
    ? value.notes
      .map(normalizeProjectMemoryNote)
      .filter((note): note is ProjectMemoryNote => note !== null)
      .slice(0, MAX_PROJECT_MEMORY_NOTES)
    : []
  return { version: PROJECT_MEMORY_FILE_VERSION, notes }
}

/** Stable scope key used by stores and selectors. Worktree paths are the
 * identity because worktree ids are machine-local UUIDs and can be recreated. */
export function projectMemoryScopeKey(scope: ProjectMemoryScope): string {
  return scope.kind === 'project' ? 'project' : `worktree:${scope.path}`
}

export function projectMemoryNotesForScope(
  notes: readonly ProjectMemoryNote[],
  scope: ProjectMemoryScope,
): ProjectMemoryNote[] {
  const key = projectMemoryScopeKey(scope)
  return notes.filter((note) => projectMemoryScopeKey(note.scope) === key)
}

