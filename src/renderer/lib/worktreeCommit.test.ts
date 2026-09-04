import { describe, expect, it } from 'vitest'
import {
  buildCommitMessage,
  EMPTY_COMMIT_CHECKLIST,
  isCommitChecklistComplete,
} from './worktreeCommit'

const file = (path: string) => ({ path, index: ' ', working_dir: 'M' })

describe('worktree commit helpers', () => {
  it('builds a short editable suggestion from the changed files', () => {
    expect(buildCommitMessage([])).toBe('Update worktree')
    expect(buildCommitMessage([file('src/app.ts')])).toBe('Update app.ts')
    expect(buildCommitMessage([file('a.ts'), file('b.ts'), file('c.ts')])).toBe('Update a.ts, b.ts, c.ts')
    expect(buildCommitMessage([file('a.ts'), file('b.ts'), file('c.ts'), file('d.ts')])).toBe('Update 4 files')
  })

  it('requires every checklist acknowledgement', () => {
    expect(isCommitChecklistComplete(EMPTY_COMMIT_CHECKLIST)).toBe(false)
    expect(isCommitChecklistComplete({
      diffReviewed: true,
      checksConsidered: true,
      secretsChecked: true,
    })).toBe(true)
  })
})
