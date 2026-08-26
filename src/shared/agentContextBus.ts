/** Shared contract for the explicit agent context bus.
 *
 * A context item is evidence selected by the user — never an implicit copy of
 * a terminal's scrollback or a workspace-wide state dump. The renderer keeps a
 * short staging queue; delivery remains the existing guarded follow-up path so
 * the bus cannot create a second keyboard-injection channel.
 */

export type AgentContextKind = 'note' | 'terminal-selection' | 'file' | 'diff' | 'artifact'

export interface AgentContextItem {
  id: string
  kind: AgentContextKind
  title: string
  createdAt: number
  /** User-visible provenance. This is metadata only and is not re-read at send time. */
  source?: string
  /** Selected evidence captured when the user staged the item. */
  content: string
}

export const MAX_AGENT_CONTEXT_ITEMS = 10
export const MAX_AGENT_CONTEXT_CHARS = 50_000
export const MAX_AGENT_CONTEXT_ITEM_CHARS = 20_000

export class AgentContextBusError extends Error {}

function assertText(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new AgentContextBusError(`${label} must be text`)
  if (value.includes('\0')) throw new AgentContextBusError(`${label} contains NUL`)
  return value.trim()
}

export function normalizeAgentContextTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled context'
}

export function truncateAgentContextContent(value: string): string {
  if (value.length <= MAX_AGENT_CONTEXT_ITEM_CHARS) return value
  const remaining = value.length - MAX_AGENT_CONTEXT_ITEM_CHARS
  return `${value.slice(0, MAX_AGENT_CONTEXT_ITEM_CHARS).trimEnd()}\n\n[Truncated: ${remaining.toLocaleString()} more characters]`
}

export function createAgentContextItem(input: {
  id?: string
  kind: AgentContextKind
  title: string
  source?: string
  content: string
  now?: number
}): AgentContextItem {
  const kind = input.kind
  if (!['note', 'terminal-selection', 'file', 'diff', 'artifact'].includes(kind)) {
    throw new AgentContextBusError('unsupported-context-kind')
  }
  const id = typeof input.id === 'string' && /^[\w-]{8,}$/.test(input.id)
    ? input.id
    : crypto.randomUUID()
  const content = truncateAgentContextContent(assertText(input.content, 'context content'))
  if (!content) throw new AgentContextBusError('context-required')
  return {
    id,
    kind,
    title: normalizeAgentContextTitle(input.title),
    createdAt: typeof input.now === 'number' && Number.isFinite(input.now) ? input.now : Date.now(),
    ...(input.source?.trim() ? { source: input.source.trim().slice(0, 500) } : {}),
    content,
  }
}

/** Append with bounded queue semantics. Existing items win over new ones so a
 * repeated stage action can never silently duplicate evidence. */
export function appendAgentContextItems(
  current: readonly AgentContextItem[],
  incoming: readonly AgentContextItem[],
): AgentContextItem[] {
  const byId = new Map(current.map((item) => [item.id, item]))
  for (const item of incoming) byId.set(item.id, item)
  const next = [...byId.values()].slice(-MAX_AGENT_CONTEXT_ITEMS)
  return next
}

export function formatAgentContextForPrompt(items: readonly AgentContextItem[]): string {
  if (items.length === 0) return ''
  let used = 0
  const included: Array<{ item: AgentContextItem; header: string; content: string }> = []
  for (const item of items) {
    const itemHeader = `--- Context ${included.length + 1}: ${item.title}${item.source ? ` (${item.source})` : ''} ---`
    const budget = MAX_AGENT_CONTEXT_CHARS - used - itemHeader.length - 2
    if (budget <= 4) break
    const content = item.content.length > budget
      ? `${item.content.slice(0, Math.max(0, budget)).trimEnd()}\n[Truncated to fit]`
      : item.content
    included.push({ item, header: itemHeader, content })
    used += itemHeader.length + content.length + 2
  }
  if (included.length === 0) return ''
  const omitted = items.length - included.length
  return [
    ...included.flatMap(({ header, content }) => [header, content]),
    ...(omitted > 0 ? [`[${omitted} additional context item${omitted === 1 ? '' : 's'} omitted.]`] : []),
  ].join('\n\n')
}
