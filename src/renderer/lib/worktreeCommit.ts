// =============================================================================
// Worktree commit assistance — small, deterministic policy helpers shared by
// the commit dialog and the action layer. The suggestion is intentionally
// conservative: it is an editable hint, never an assertion about the code.
// =============================================================================

export interface WorktreeCommitFile {
  path: string
  index: string
  working_dir: string
}

export interface CommitChecklist {
  diffReviewed: boolean
  checksConsidered: boolean
  secretsChecked: boolean
}

export const EMPTY_COMMIT_CHECKLIST: CommitChecklist = {
  diffReviewed: false,
  checksConsidered: false,
  secretsChecked: false,
}

export const COMMIT_CHECKLIST_ITEMS: ReadonlyArray<{
  key: keyof CommitChecklist
  label: string
}> = [
  { key: 'diffReviewed', label: 'I reviewed the diff and the changed files.' },
  { key: 'checksConsidered', label: 'I ran the relevant checks, or confirmed they are not needed.' },
  { key: 'secretsChecked', label: 'I checked that no credentials or private data are included.' },
]

export function isCommitChecklistComplete(checklist: CommitChecklist): boolean {
  return COMMIT_CHECKLIST_ITEMS.every(({ key }) => checklist[key])
}

function fileLabel(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1) || normalized
}

/** Return an editable, stable suggestion based only on the current file list. */
export function buildCommitMessage(files: WorktreeCommitFile[]): string {
  if (files.length === 0) return 'Update worktree'
  if (files.length === 1) return `Update ${fileLabel(files[0].path)}`
  if (files.length <= 3) return `Update ${files.map((file) => fileLabel(file.path)).join(', ')}`
  return `Update ${files.length} files`
}
