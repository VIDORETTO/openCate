import type { CodingAgentRunSnapshot } from '../../../shared/codingAgentRuns'

/** Only live openCate-owned missions with a declared follow-up contract may enter
 *  the global composer. A terminal discovered by heuristics is intentionally
 *  not a broadcast target: openCate cannot prove which prompt state it is in. */
export function isCodingAgentBroadcastEligible(run: CodingAgentRunSnapshot): boolean {
  return run.followUpSupported && (run.status === 'working' || run.status === 'waiting')
}

export function eligibleCodingAgentBroadcastTargets(
  runs: readonly CodingAgentRunSnapshot[],
): CodingAgentRunSnapshot[] {
  return runs.filter(isCodingAgentBroadcastEligible)
}

export function codingAgentBroadcastStatusLabel(run: Pick<CodingAgentRunSnapshot, 'status'>): string {
  switch (run.status) {
    case 'waiting': return 'waiting for input'
    case 'working': return 'working'
    case 'stalled': return 'stalled'
    case 'starting': return 'starting'
    case 'ready': return 'finished'
    case 'stopped': return 'stopped'
    case 'failed': return 'failed'
  }
}

const TRANSLATIONS: Record<string, string> = {
  status: 'Report your current status, what you are doing now, and whether you need input.',
  plan: 'Create a concise implementation plan for the current task and wait for approval before making changes.',
  review: 'Review the current work for bugs, regressions, and missing tests. Report findings with severity and file references.',
}

export interface BroadcastPromptTranslation {
  text: string
  translated: boolean
  command?: string
}

/** Translate only a small, explicit neutral vocabulary. Unknown commands and
 *  normal prompts stay byte-for-byte unchanged so a user can still address a
 *  provider-specific command deliberately. */
export function translateBroadcastSlashCommand(prompt: string, enabled: boolean): BroadcastPromptTranslation {
  const match = /^\s*\/([A-Za-z][A-Za-z0-9_-]*)(?:\s+([\s\S]*))?$/.exec(prompt)
  if (!match) return { text: prompt, translated: false }

  const command = match[1].toLowerCase()
  const translation = TRANSLATIONS[command]
  if (!enabled || !translation) return { text: prompt, translated: false, command }

  const extra = match[2]?.trim()
  return {
    text: extra ? `${translation}\n\nAdditional direction: ${extra}` : translation,
    translated: true,
    command,
  }
}
