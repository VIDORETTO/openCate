import { describe, expect, it } from 'vitest'

import {
  normalizeProjectMemoryFile,
  normalizeProjectMemoryNote,
  projectMemoryNotesForScope,
  projectMemoryScopeKey,
} from './projectMemory'

const citation = {
  kind: 'file' as const,
  label: 'agent.ts',
  locator: 'src/agent.ts',
  lineStart: 10,
  lineEnd: 14,
}

function rawNote(id: string, scope: unknown = { kind: 'project' }): Record<string, unknown> {
  return {
    id,
    scope,
    title: 'Decision',
    content: 'Keep the adapter provider-neutral.',
    citations: [citation],
    createdAt: 10,
    updatedAt: 20,
  }
}

describe('project memory contract', () => {
  it('normalizes a note with structured provenance', () => {
    expect(normalizeProjectMemoryNote(rawNote('note-1'))).toEqual({
      ...rawNote('note-1'),
    })
  })

  it('rejects notes without a usable citation', () => {
    expect(normalizeProjectMemoryNote({ ...rawNote('note-1'), citations: [] })).toBeNull()
    expect(normalizeProjectMemoryNote({ ...rawNote('note-2'), citations: [{ kind: 'file', locator: '' }] })).toBeNull()
    expect(normalizeProjectMemoryNote({ ...rawNote('note-3'), citations: [{ ...citation, lineStart: 20, lineEnd: 10 }] })).toBeNull()
  })

  it('rejects malformed worktree scopes and NUL-bearing input', () => {
    expect(normalizeProjectMemoryNote(rawNote('note-1', { kind: 'worktree', path: '' }))).toBeNull()
    expect(normalizeProjectMemoryNote({ ...rawNote('note-2'), title: 'bad\0title' })).toBeNull()
    expect(normalizeProjectMemoryNote({ ...rawNote('note-3'), scope: { kind: 'worktree', path: 'C:\\repo\0' } })).toBeNull()
  })

  it('accepts project and worktree scope keys without conflating them', () => {
    const project = { kind: 'project' } as const
    const worktree = { kind: 'worktree', path: 'C:\\repo-feature' } as const
    expect(projectMemoryScopeKey(project)).toBe('project')
    expect(projectMemoryScopeKey(worktree)).toBe('worktree:C:\\repo-feature')
    expect(projectMemoryScopeKey(project)).not.toBe(projectMemoryScopeKey(worktree))
  })

  it('keeps only valid bounded notes from a hand-edited file', () => {
    const file = normalizeProjectMemoryFile({
      version: 1,
      notes: [rawNote('valid'), { ...rawNote('invalid'), content: '' }, null, 'nope'],
    })
    expect(file.version).toBe(1)
    expect(file.notes.map((note) => note.id)).toEqual(['valid'])
  })

  it('filters notes to exactly one explicit scope', () => {
    const notes = [
      normalizeProjectMemoryNote(rawNote('project'))!,
      normalizeProjectMemoryNote(rawNote('feature', { kind: 'worktree', path: '/repo/feature' }))!,
    ]
    expect(projectMemoryNotesForScope(notes, { kind: 'project' }).map((note) => note.id)).toEqual(['project'])
    expect(projectMemoryNotesForScope(notes, { kind: 'worktree', path: '/repo/feature' }).map((note) => note.id)).toEqual(['feature'])
  })
})

