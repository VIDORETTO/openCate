import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createProcessCapability, resolveWindowsCommand, resolveWindowsExecutable } from './process'

const ptySpawn = vi.hoisted(() => vi.fn())
vi.mock('node-pty', () => ({ spawn: ptySpawn }))

describe('process agent hook preparation', () => {
  beforeEach(() => {
    ptySpawn.mockReset()
    ptySpawn.mockReturnValue({
      pid: 123,
      onData: vi.fn(),
      onExit: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
    })
  })

  test('passes the base workspace cwd through to hook preparation', async () => {
    const prepareWorkspace = vi.fn().mockResolvedValue(undefined)
    const processCapability = createProcessCapability({
      resolveShell: () => ({ path: '/bin/sh', args: [] }),
      getEnv: () => ({ PATH: '/usr/bin:/bin' }),
      hooks: {
        envForPty: async (_ptyId, env) => env,
        prepareWorkspace,
      },
    })

    const handle = await processCapability.create(
      {
        id: 'pty-hooks-worktree',
        cols: 80,
        rows: 24,
        cwd: '/repo/worktree',
        shell: '/bin/sh',
        agentHooks: true,
        agentHookConfig: { codex: 'on' },
        workspaceBaseCwd: '/repo/base',
      },
      () => {},
      () => {},
    )

    expect(prepareWorkspace).toHaveBeenCalledWith(
      '/repo/worktree',
      { codex: 'on' },
      '/repo/base',
    )
    processCapability.kill(handle.id)
  })

  test('spawns an exact trusted command instead of interpolating it through a shell', async () => {
    const processCapability = createProcessCapability({
      resolveShell: () => ({ path: '/bin/sh', args: ['-l'] }),
      getEnv: () => ({ PATH: '/usr/bin:/bin' }),
    })

    const handle = await processCapability.create(
      {
        id: 'pty-codex',
        cols: 80,
        rows: 24,
        cwd: '/repo/worktree',
        command: {
          executable: 'codex',
          args: ['Fix it; touch /tmp/not-shell-syntax'],
        },
      },
      () => {},
      () => {},
    )

    expect(ptySpawn).toHaveBeenCalledWith(
      'codex',
      ['Fix it; touch /tmp/not-shell-syntax'],
      expect.objectContaining({ cwd: '/repo/worktree' }),
    )
    expect(handle.shell).toBe('codex')
    processCapability.kill(handle.id)
  })

  test.skipIf(process.platform !== 'win32')('resolves a Windows command shim for direct PTY spawning', () => {
    const resolved = resolveWindowsExecutable(
      'codex',
      { Path: ['C:\\fake-bin', 'C:\\other-bin'].join(';'), PATHEXT: '.EXE;.CMD' },
      (candidate) => candidate.toLowerCase() === 'c:\\fake-bin\\codex.cmd',
    )

    expect(resolved.toLowerCase()).toBe('c:\\fake-bin\\codex.cmd')
  })

  test.skipIf(process.platform !== 'win32')('bypasses a simple Node shim without losing multiline argv', () => {
    const prompt = 'Complete this coding task:\n\n--literal mission; no shell'
    const result = resolveWindowsCommand(
      'codex',
      [prompt],
      { Path: 'C:\\fake-bin', PATHEXT: '.EXE;.CMD' },
      () => `"${process.execPath}" "%~dp0fake-codex.cjs" %*`,
      (candidate) => [
        'c:\\fake-bin\\codex.cmd',
        process.execPath.toLowerCase(),
      ].includes(candidate.toLowerCase()),
    )

    expect(result).toEqual({
      executable: process.execPath,
      args: ['C:\\fake-bin\\fake-codex.cjs', prompt],
    })
  })
})
