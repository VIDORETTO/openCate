// =============================================================================
// Conservative screen fallback for agents without a structured lifecycle
// channel. This module deliberately understands only a tiny status vocabulary:
// a visible prompt means waitingForInput, an unmistakable progress marker means
// running, and everything else is ambiguous (null). It never returns terminal
// content to a caller and never reads xterm scrollback.
// =============================================================================

import type { Terminal } from '@xterm/xterm'
import type { AgentId } from '../../../shared/agents'
import type { AgentState } from '../../../shared/types'

export type HeuristicAgentState = Extract<AgentState, 'running' | 'waitingForInput'>

/** Keep parsing bounded even if a caller accidentally passes a large string. */
export const MAX_AGENT_SCREEN_SAMPLE_LENGTH = 12_000

const ANSI_ESCAPE = /\u001B(?:\][\s\S]*?(?:\u0007|\u001B\\)|\[[0-?]*[ -/]*[@-~]|[@-_])/g
const SPINNER_LINE = /^[\s]*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏◐◓◑◒⏳][\s\S]*$/u
const BUSY_TEXT = /\b(?:thinking|working|running|executing|generating|planning|searching|analyzing|analysing|loading|streaming)\b|(?:esc|ctrl(?:\+|-)c)\s+to\s+interrupt/i
const SYMBOL_PROMPT = /^[\s]*(?:❯|›|»)[\s]*$/u
const QUESTION_PROMPT = /^(?:.*\b(?:allow|approve|approval|continue|confirm|permission|proceed)\b.*\?|.*\?(?:\s*\[[^\]]+\]|\s*\([^)]+\))?)$/i

/** Remove terminal control sequences while preserving line boundaries. */
function plainScreenText(screenText: string): string {
  const bounded = screenText.length > MAX_AGENT_SCREEN_SAMPLE_LENGTH
    ? screenText.slice(-MAX_AGENT_SCREEN_SAMPLE_LENGTH)
    : screenText
  return bounded.replace(ANSI_ESCAPE, '').replace(/\r/g, '').replace(/\0/g, '')
}

function lastNonEmptyLine(lines: readonly string[]): string | null {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trimEnd()
    if (line.trim()) return line
  }
  return null
}

/**
 * Infer only the two actionable states that can be represented safely from a
 * screen. `agentId` is required for generic prompts such as Aider's `>` so a
 * normal shell prompt can never become an agent state by accident.
 */
export function resolveAgentScreenState(
  screenText: string,
  agentId?: AgentId,
): HeuristicAgentState | null {
  const lines = plainScreenText(screenText).split('\n')
  const last = lastNonEmptyLine(lines)
  if (!last) return null

  // A prompt is checked first: a completed response may leave words such as
  // "working" in the visible transcript immediately above the actual prompt.
  if ((agentId === 'aider' && /^\s*>\s*$/.test(last)) || SYMBOL_PROMPT.test(last)) {
    return 'waitingForInput'
  }

  // Permission/confirmation prompts are actionable even when the CLI does not
  // render its ordinary prompt glyph. Restrict this to the final visible line.
  if (agentId && QUESTION_PROMPT.test(last)) return 'waitingForInput'

  const tail = lines.slice(-8)
  if (tail.some((line) => SPINNER_LINE.test(line) || BUSY_TEXT.test(line))) {
    return 'running'
  }

  return null
}

/**
 * Read exactly the active xterm viewport. `viewportY` is used instead of
 * `baseY`, so a user who has scrolled up does not accidentally feed old
 * scrollback to the classifier. The returned value is status-only input; it
 * must not be persisted or sent to an agent.
 */
export function readVisibleTerminalText(terminal: Terminal): string {
  const rows = Math.max(0, terminal.rows)
  if (rows === 0) return ''

  const buffer = terminal.buffer.active
  const viewportY = Number.isFinite(buffer.viewportY) ? Math.max(0, buffer.viewportY) : 0
  const lines: string[] = []
  for (let row = 0; row < rows; row += 1) {
    const line = buffer.getLine(viewportY + row)
    lines.push(line?.translateToString(true) ?? '')
  }
  return lines.join('\n').slice(-MAX_AGENT_SCREEN_SAMPLE_LENGTH)
}
