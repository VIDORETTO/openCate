import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createProcessCapability } from './process'

type FakePty = {
  pid: number
  onData: ReturnType<typeof vi.fn>
  onExit: ReturnType<typeof vi.fn>
  write: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
}

const ptySpawn = vi.hoisted(() => vi.fn())
vi.mock('node-pty', () => ({ spawn: ptySpawn }))

function makeFakePty(): FakePty {
  return {
    pid: 42_001,
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
  }
}

describe('process capability tmux durability', () => {
  beforeEach(() => {
    ptySpawn.mockReset()
    ptySpawn.mockReturnValue(makeFakePty())
  })

  test('attaches a durable pty through tmux and returns its identity', async () => {
    const processCapability = createProcessCapability({
      resolveShell: () => ({ path: '/bin/sh', args: ['-l'] }),
      getEnv: () => ({ PATH: '/usr/bin:/bin' }),
      platform: 'linux',
      tmuxAvailable: async () => true,
    })

    const handle = await processCapability.create({
      id: 'pty-durable',
      cols: 80,
      rows: 24,
      cwd: '/workspace',
      durability: { mode: 'tmux', sessionName: 'cate-1234abcd-panel-1' },
    }, () => {}, () => {})

    expect(ptySpawn).toHaveBeenCalledWith(
      'tmux',
      [
        'new-session',
        '-A',
        '-s',
        'cate-1234abcd-panel-1',
        '-c',
        '/workspace',
        '-x',
        '80',
        '-y',
        '24',
        '/bin/sh',
        '-l',
      ],
      expect.objectContaining({ cwd: '/workspace' }),
    )
    expect(handle.durability).toEqual({ mode: 'tmux', sessionName: 'cate-1234abcd-panel-1' })
  })

  test('kills the owned tmux session when the user closes the terminal', async () => {
    const killTmuxSession = vi.fn()
    const pty = makeFakePty()
    ptySpawn.mockReturnValue(pty)
    const processCapability = createProcessCapability({
      resolveShell: () => ({ path: '/bin/sh', args: [] }),
      getEnv: () => ({ PATH: '/usr/bin:/bin' }),
      platform: 'linux',
      tmuxAvailable: async () => true,
      killTmuxSession,
    })

    await processCapability.create({
      id: 'pty-durable',
      cols: 80,
      rows: 24,
      cwd: '/workspace',
      durability: { mode: 'tmux', sessionName: 'cate-1234abcd-panel-1' },
    }, () => {}, () => {})

    processCapability.kill('pty-durable')

    expect(killTmuxSession).toHaveBeenCalledWith('cate-1234abcd-panel-1')
    expect(pty.kill).toHaveBeenCalledTimes(1)
  })

  test('rejects durability when tmux is unavailable or the host is Windows', async () => {
    const unavailable = createProcessCapability({
      resolveShell: () => ({ path: '/bin/sh', args: [] }),
      getEnv: () => ({}),
      platform: 'linux',
      tmuxAvailable: async () => false,
    })
    await expect(unavailable.create({
      id: 'pty-unavailable',
      cols: 80,
      rows: 24,
      cwd: '/workspace',
      durability: { mode: 'tmux', sessionName: 'cate-1234abcd-panel-1' },
    }, () => {}, () => {})).rejects.toThrow('tmux is unavailable')

    const windows = createProcessCapability({
      resolveShell: () => ({ path: 'cmd.exe', args: [] }),
      getEnv: () => ({}),
      platform: 'win32',
      tmuxAvailable: async () => true,
    })
    await expect(windows.create({
      id: 'pty-windows',
      cols: 80,
      rows: 24,
      cwd: 'C:/workspace',
      durability: { mode: 'tmux', sessionName: 'cate-1234abcd-panel-1' },
    }, () => {}, () => {})).rejects.toThrow('POSIX')

    expect(ptySpawn).not.toHaveBeenCalled()
  })
})
