import { isValidTmuxSessionName } from '../../shared/terminalDurability'

export interface TmuxAttachOptions {
  sessionName: string
  cwd: string
  cols: number
  rows: number
  executable: string
  args: string[]
}

export function assertTmuxSessionName(sessionName: string): void {
  if (!isValidTmuxSessionName(sessionName)) {
    throw new Error('Invalid tmux session name')
  }
}

export function buildTmuxAttachArgs(options: TmuxAttachOptions): string[] {
  assertTmuxSessionName(options.sessionName)

  return [
    'new-session',
    '-A',
    '-s',
    options.sessionName,
    '-c',
    options.cwd,
    '-x',
    String(Math.max(1, Math.floor(options.cols))),
    '-y',
    String(Math.max(1, Math.floor(options.rows))),
    options.executable,
    ...options.args,
  ]
}

export function buildTmuxKillArgs(sessionName: string): string[] {
  assertTmuxSessionName(sessionName)
  return ['kill-session', '-t', sessionName]
}
