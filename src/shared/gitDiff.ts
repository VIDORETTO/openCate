// =============================================================================
// Bounded unified-diff parsing shared by the runtime and renderer.
//
// Hunk ids are derived from the path and its ordinal inside one diff. The
// runtime recomputes the diff before applying a selection, so these ids are a
// review token rather than an instruction to trust patch content from a UI.
// =============================================================================

export const MAX_GIT_DIFF_HUNKS = 1_000

export interface GitDiffHunk {
  id: string
  path: string
  header: string
  lines: string[]
  additions: number
  deletions: number
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
}

interface ParsedHunk extends GitDiffHunk {
  headerLine: number
}

interface ParsedFile {
  startLine: number
  endLine: number
  path: string
  headerLines: string[]
  hunks: ParsedHunk[]
}

interface HunkHeaderPosition {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  section: string
}

function parseHunkHeader(line: string): HunkHeaderPosition | null {
  const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: ?(.*))?$/)
  if (!match) return null
  return {
    oldStart: Number(match[1]),
    oldCount: Number(match[2] ?? 1),
    newStart: Number(match[3]),
    newCount: Number(match[4] ?? 1),
    section: match[5] ?? '',
  }
}

function diffPath(line: string): string | null {
  const match = line.match(/^diff --git a\/(.*) b\/(.*)$/)
  if (match) return match[2]
  return null
}

function markerPath(line: string): string | null {
  if (!line.startsWith('+++ ')) return null
  const value = line.slice(4).split('\t', 1)[0]
  if (value === '/dev/null') return null
  return value.startsWith('b/') ? value.slice(2) : value
}

function parseDocument(rawDiff: string): ParsedFile[] {
  const normalized = rawDiff.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  if (lines.at(-1) === '') lines.pop()

  const blockStarts: number[] = []
  for (let index = 0; index < lines.length; index++) {
    if (lines[index].startsWith('diff --git ')) blockStarts.push(index)
  }
  if (blockStarts.length === 0 && lines.some((line) => line.startsWith('@@ '))) blockStarts.push(0)

  const files: ParsedFile[] = []
  for (let blockIndex = 0; blockIndex < blockStarts.length; blockIndex++) {
    const startLine = blockStarts[blockIndex]
    const endLine = blockStarts[blockIndex + 1] ?? lines.length
    let path = diffPath(lines[startLine]) ?? ''
    const firstHunkLine = lines.findIndex((line, index) =>
      index >= startLine && index < endLine && parseHunkHeader(line) !== null)
    const headerEnd = firstHunkLine === -1 ? endLine : firstHunkLine
    if (!path) {
      for (let index = headerEnd - 1; index >= startLine; index--) {
        const candidate = markerPath(lines[index])
        if (candidate) {
          path = candidate
          break
        }
      }
    }

    const file: ParsedFile = {
      startLine,
      endLine,
      path,
      headerLines: lines.slice(startLine, headerEnd),
      hunks: [],
    }
    let hunkOrdinal = 0
    for (let headerLine = firstHunkLine; headerLine >= 0 && headerLine < endLine;) {
      const parsed = parseHunkHeader(lines[headerLine])
      if (!parsed) {
        headerLine++
        continue
      }
      let nextLine = headerLine + 1
      while (nextLine < endLine && !parseHunkHeader(lines[nextLine])) nextLine++
      const hunkLines = lines.slice(headerLine + 1, nextLine)
      const id = `${path}\0${hunkOrdinal}`
      file.hunks.push({
        id,
        path,
        header: lines[headerLine],
        lines: hunkLines,
        additions: hunkLines.filter((line) => line.startsWith('+')).length,
        deletions: hunkLines.filter((line) => line.startsWith('-')).length,
        oldStart: parsed.oldStart,
        oldCount: parsed.oldCount,
        newStart: parsed.newStart,
        newCount: parsed.newCount,
        headerLine,
      })
      hunkOrdinal++
      headerLine = nextLine
      if (file.hunks.length >= MAX_GIT_DIFF_HUNKS) break
    }
    files.push(file)
  }
  return files
}

/** Parse bounded metadata and changed lines from a unified diff. */
export function parseGitDiffHunks(rawDiff: string): GitDiffHunk[] {
  return parseDocument(rawDiff)
    .flatMap((file) => file.hunks)
    .slice(0, MAX_GIT_DIFF_HUNKS)
    .map(({ headerLine: _headerLine, ...hunk }) => hunk)
}

/** Build a patch containing only the selected hunks from the supplied diff. */
export function selectedGitDiff(rawDiff: string, selectedIds: readonly string[]): string {
  const selected = new Set(selectedIds)
  if (selected.size === 0) return ''
  const output: string[] = []
  for (const file of parseDocument(rawDiff)) {
    const hunks = file.hunks.filter((hunk) => selected.has(hunk.id))
    if (hunks.length === 0) continue
    output.push(...file.headerLines)
    for (const hunk of hunks) output.push(hunk.header, ...hunk.lines)
  }
  return output.length > 0 ? `${output.join('\n')}\n` : ''
}
