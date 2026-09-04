import { describe, expect, test } from 'vitest'
import { buildTmuxAttachArgs, buildTmuxKillArgs } from './tmux'

describe('tmux command contract', () => {
  test('builds argv without shell interpolation', () => {
    expect(buildTmuxAttachArgs({
      sessionName: 'cate-1234abcd-panel-1',
      cwd: '/workspace/with spaces',
      cols: 0,
      rows: 24.9,
      executable: '/bin/sh',
      args: ['-lc', 'printf "literal; value"'],
    })).toEqual([
      'new-session',
      '-A',
      '-s',
      'cate-1234abcd-panel-1',
      '-c',
      '/workspace/with spaces',
      '-x',
      '1',
      '-y',
      '24',
      '/bin/sh',
      '-lc',
      'printf "literal; value"',
    ])
  })

  test('builds a constrained kill target', () => {
    expect(buildTmuxKillArgs('cate-1234abcd-panel-1')).toEqual([
      'kill-session',
      '-t',
      'cate-1234abcd-panel-1',
    ])
    expect(() => buildTmuxKillArgs('user-session')).toThrow('Invalid tmux session name')
  })
})
