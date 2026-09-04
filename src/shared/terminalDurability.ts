export type TerminalPersistenceMode = 'ephemeral' | 'tmux'

export interface TerminalDurability {
  mode: 'tmux'
  sessionName: string
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function tmuxSessionName(scopeId: string, panelId: string): string {
  const suffix = panelId.replace(/[^A-Za-z0-9_-]/g, '').slice(-20) || 'panel'
  return `cate-${fnv1a(`${scopeId}:${panelId}`)}-${suffix}`
}

export function isValidTmuxSessionName(value: string): boolean {
  return /^cate-[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)
}
