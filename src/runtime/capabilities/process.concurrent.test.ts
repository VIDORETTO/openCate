import { describe, expect, test, vi } from 'vitest'
import { createProcessCapability } from './process'

type FakePty = {
  pid: number
  testId: string
  onData: (callback: (data: string) => void) => void
  onExit: (callback: (event: { exitCode: number }) => void) => { dispose: () => void }
  write: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
  emitData: (data: string) => void
  emitExit: (exitCode: number) => void
}

const ptySpawn = vi.hoisted(() => vi.fn())
vi.mock('node-pty', () => ({ spawn: ptySpawn }))

function makeFakePty(testId: string, pid: number): FakePty {
  let dataCallback: ((data: string) => void) | undefined
  const exitCallbacks = new Set<(event: { exitCode: number }) => void>()

  const pty: FakePty = {
    pid,
    testId,
    onData(callback) {
      dataCallback = callback
    },
    onExit(callback) {
      exitCallbacks.add(callback)
      return { dispose: () => exitCallbacks.delete(callback) }
    },
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    emitData(data) {
      dataCallback?.(data)
    },
    emitExit(exitCode) {
      for (const callback of exitCallbacks) callback({ exitCode })
    },
  }

  return pty
}

describe('process capability concurrency', () => {
  test('waits for Windows PTY exit callbacks before reporting shutdown complete', async () => {
    const pty = makeFakePty('shutdown', 30_000)
    ptySpawn.mockReturnValue(pty)
    const processCapability = createProcessCapability({
      resolveShell: () => ({ path: 'cmd.exe', args: [] }),
      getEnv: () => ({ PATH: 'C:\\Windows\\System32' }),
      platform: 'win32',
    })
    await processCapability.create(
      { id: 'shutdown', cols: 80, rows: 24, cwd: 'C:\\repo' },
      () => {},
      () => {},
    )

    const shutdown = processCapability.killAllGroups()
    let settled = false
    void shutdown.then(() => { settled = true })
    await Promise.resolve()
    expect(pty.kill).toHaveBeenCalledOnce()
    expect(settled).toBe(false)

    pty.emitExit(0)
    await expect(shutdown).resolves.toBeUndefined()
  })

  test('keeps many PTYs isolated while creating, streaming, mutating, and exiting concurrently', async () => {
    const spawned: FakePty[] = []
    ptySpawn.mockImplementation((_executable, _args, options) => {
      const testId = String(options.env.CATE_TEST_PTY_ID)
      const pty = makeFakePty(testId, 20_000 + spawned.length)
      spawned.push(pty)
      return pty
    })

    const dataEvents: Array<{ id: string; data: string }> = []
    const exitEvents: Array<{ id: string; exitCode: number }> = []
    const processCapability = createProcessCapability({
      resolveShell: () => ({ path: '/bin/sh', args: [] }),
      getEnv: () => ({ PATH: '/usr/bin:/bin' }),
    })

    const ids = Array.from({ length: 48 }, (_, index) => `pty-concurrent-${index}`)
    const handles = await Promise.all(ids.map((id) => processCapability.create(
      {
        id,
        cols: 80,
        rows: 24,
        cwd: '/repo',
        env: { CATE_TEST_PTY_ID: id },
      },
      (eventId, data) => dataEvents.push({ id: eventId, data }),
      (eventId, exitCode) => exitEvents.push({ id: eventId, exitCode }),
    )))

    expect(handles.map((handle) => handle.id)).toEqual(ids)
    expect(spawned.map((pty) => pty.testId).sort()).toEqual([...ids].sort())

    await Promise.all(handles.map(async (handle, index) => {
      processCapability.write(handle.id, `input-${handle.id}`)
      processCapability.resize(handle.id, 80 + index, 24 + index)
      await Promise.resolve()
      spawned.find((pty) => pty.testId === handle.id)!.emitData(`output-${handle.id}`)
    }))

    expect(dataEvents).toHaveLength(ids.length)
    expect(new Map(dataEvents.map((event) => [event.id, event.data]))).toEqual(
      new Map(ids.map((id) => [id, `output-${id}`])),
    )

    for (const pty of spawned) {
      expect(pty.write).toHaveBeenCalledWith(`input-${pty.testId}`)
      const index = Number(pty.testId.split('-').pop())
      expect(pty.resize).toHaveBeenCalledWith(80 + index, 24 + index)
    }

    await Promise.all(spawned.map(async (pty, index) => {
      await Promise.resolve()
      pty.emitExit(index)
    }))

    expect(exitEvents).toHaveLength(ids.length)
    expect(new Map(exitEvents.map((event) => [event.id, event.exitCode]))).toEqual(
      new Map(spawned.map((pty, index) => [pty.testId, index])),
    )

    // The exit callback removes each entry, so late commands are harmless and
    // cannot reach a different terminal.
    for (const id of ids) {
      processCapability.write(id, 'after-exit')
      processCapability.resize(id, 1, 1)
    }
    expect(spawned.every((pty) => pty.write.mock.calls.length === 1)).toBe(true)
    expect(spawned.every((pty) => pty.resize.mock.calls.length === 1)).toBe(true)
  })
})
