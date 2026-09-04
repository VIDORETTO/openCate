import { describe, expect, it } from 'vitest'
import { parseGitDiffHunks, selectedGitDiff } from './gitDiff'

const DIFF = [
  'diff --git a/src/app.ts b/src/app.ts',
  'index 1111111..2222222 100644',
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -1,2 +1,3 @@',
  ' const first = true',
  '+const second = true',
  ' const third = true',
  '@@ -10,2 +11,2 @@ render',
  '-return oldValue',
  '+return newValue',
  'diff --git a/README.md b/README.md',
  'index 3333333..4444444 100644',
  '--- a/README.md',
  '+++ b/README.md',
  '@@ -2 +2 @@',
  '-old',
  '+new',
].join('\n') + '\n'

describe('git diff hunk contract', () => {
  it('parses file paths, headers and bounded change counts', () => {
    expect(parseGitDiffHunks(DIFF)).toEqual([
      expect.objectContaining({
        id: 'src/app.ts\u00000',
        path: 'src/app.ts',
        header: '@@ -1,2 +1,3 @@',
        additions: 1,
        deletions: 0,
        newStart: 1,
      }),
      expect.objectContaining({
        id: 'src/app.ts\u00001',
        path: 'src/app.ts',
        additions: 1,
        deletions: 1,
      }),
      expect.objectContaining({
        id: 'README.md\u00000',
        path: 'README.md',
      }),
    ])
  })

  it('rebuilds a valid patch for only selected hunks', () => {
    const hunkId = parseGitDiffHunks(DIFF)[1].id
    const selected = selectedGitDiff(DIFF, [hunkId])
    expect(selected).toContain('diff --git a/src/app.ts b/src/app.ts')
    expect(selected).toContain('@@ -10,2 +11,2 @@ render')
    expect(selected).not.toContain('@@ -1,2 +1,3 @@')
    expect(selected).not.toContain('diff --git a/README.md b/README.md')
  })
})
