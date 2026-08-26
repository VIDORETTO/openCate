import { describe, expect, it } from 'vitest'

import {
  appendAgentContextItems,
  createAgentContextItem,
  formatAgentContextForPrompt,
  MAX_AGENT_CONTEXT_CHARS,
  MAX_AGENT_CONTEXT_ITEM_CHARS,
} from './agentContextBus'

const item = (id: string, content: string, title = `Note ${id}`) => createAgentContextItem({
  id,
  kind: 'note',
  title,
  content,
  now: 1,
})

describe('explicit agent context bus contract', () => {
  it('normalizes titles and truncates oversized evidence without changing its source', () => {
    const created = createAgentContextItem({
      kind: 'artifact',
      title: '  big   report  ',
      source: `/workspace/${'x'.repeat(600)}/report.txt`,
      content: `${'a'.repeat(MAX_AGENT_CONTEXT_ITEM_CHARS)}tail`,
    })

    expect(created.title).toBe('big report')
    expect(created.source).toHaveLength(500)
    expect(created.content.startsWith('a'.repeat(MAX_AGENT_CONTEXT_ITEM_CHARS))).toBe(true)
    expect(created.content).toContain('[Truncated:')
  })

  it('deduplicates by id, keeps the newest version and enforces a bounded queue', () => {
    const first = item('same-id-long', 'old')
    const replacement = { ...item('same-id-long', 'new'), createdAt: 2 }
    const replaced = appendAgentContextItems([first], [replacement])
    expect(replaced.map((candidate) => candidate.id)).toEqual(['same-id-long'])
    expect(replaced[0].content).toBe('new')

    const extras = Array.from({ length: 12 }, (_, index) => item(`extra-id-${index}`, `value-${index}`))
    const next = appendAgentContextItems(replaced, extras)

    expect(next).toHaveLength(10)
    expect(next.find((candidate) => candidate.id === 'same-id-long')).toBeUndefined()
    expect(next.at(-1)?.id).toBe('extra-id-11')
  })

  it('formats selected items with provenance and drops evidence that no longer fits', () => {
    const large = () => ({
      ...item('large-id', 'placeholder'),
      content: 'x'.repeat(MAX_AGENT_CONTEXT_CHARS),
    })
    const prompt = formatAgentContextForPrompt([
      item('one', 'first fact', 'API note'),
      { ...item('two', 'second fact', 'UI note'), source: '/repo/src/App.tsx' },
      large(),
      item('four', 'too late', 'Overflow note'),
    ])

    expect(prompt).toContain('--- Context 1: API note ---')
    expect(prompt).toContain('first fact')
    expect(prompt).toContain('--- Context 2: UI note (/repo/src/App.tsx) ---')
    expect(prompt).toContain('second fact')
    expect(prompt).toContain('--- Context 3:')
    expect(prompt).toContain('[Truncated to fit]')
    expect(prompt).not.toContain('too late')
    expect(prompt).toContain('[1 additional context item omitted.]')
  })
})
