import { randomUUID } from 'node:crypto'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { describe, expect, test } from 'vitest'
import { createVcsCapability } from './vcs'

describe('VCS worktree path boundaries', () => {
  test('rejects worktree targets outside the caller scope before filesystem/git work', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cate-vcs-security-'))
    const outside = path.join(os.homedir(), `.cate-vcs-security-${randomUUID()}`)
    const scopeId = `vcs-security-${randomUUID()}`
    const vcs = createVcsCapability({ scopeId, env: () => process.env })
    const access = { scopeId }

    try {
      await expect(vcs.worktreeAdd(root, 'feature', outside, undefined, access)).rejects.toThrow(/outside/i)
      await expect(vcs.worktreeAddFromPr(root, 42, outside, undefined, access)).rejects.toThrow(/outside/i)
      await expect(vcs.worktreeRemove(root, outside, undefined, access)).rejects.toThrow(/outside/i)
      await expect(vcs.worktreeStatus(outside, access)).rejects.toThrow(/outside/i)
      await expect(fs.stat(outside)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
