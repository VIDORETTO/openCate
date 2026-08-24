import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentHookEvent } from '../../shared/agentHooks'

const h = vi.hoisted(() => ({
  files: new Map<string, string>(),
  runtime: null as any,
}))

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('../../cateAgent/main/codingDir', () => ({
  hostJoin: (_runtimeId: string, ...parts: string[]) => parts.join('/'),
}))
vi.mock('../runtime/runtimeManager', () => ({
  runtimes: { resolve: vi.fn(() => h.runtime) },
}))

import {
  listAgentSessionHistory,
  loadAgentSessionHistory,
  recordAgentSessionEvent,
} from './agentSessionHistory'

function event(overrides: Partial<AgentHookEvent> = {}): AgentHookEvent {
  return {
    terminalId: 'pty-1',
    agentId: 'codex',
    kind: 'turn-start',
    sessionId: 'session-1',
    cwd: '/repo',
    transcriptPath: '/repo/.codex/rollout.jsonl',
    raw: {},
    ...overrides,
  }
}

beforeEach(() => {
  h.files.clear()
  h.runtime = {
    id: 'local',
    file: {
      readFile: vi.fn(async (file: string) => {
        const value = h.files.get(file)
        if (value === undefined) throw new Error('missing')
        return value
      }),
      writeFile: vi.fn(async (file: string, value: string) => {
        h.files.set(file, value)
      }),
    },
  }
})

describe('agent-session history IPC backing store', () => {
  it('ingests idempotently and preserves the transcript reference', async () => {
    await Promise.all([
      recordAgentSessionEvent(h.runtime, '/repo', event(), 100),
      recordAgentSessionEvent(h.runtime, '/repo', event({ kind: 'turn-end', transcriptPath: undefined }), 200),
    ])

    const sessions = await listAgentSessionHistory('/repo')
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({
      sessionId: 'session-1',
      transcriptPath: '/repo/.codex/rollout.jsonl',
      updatedAt: 200,
      lastEvent: 'turn-end',
    })
  })

  it('loads only an indexed transcript and projects its messages', async () => {
    h.files.set('/repo/.codex/rollout.jsonl', JSON.stringify([
      { type: 'user', message: { role: 'user', content: 'hello' } },
      { type: 'assistant', message: { role: 'assistant', content: 'world' } },
    ]))
    await recordAgentSessionEvent(h.runtime, '/repo', event(), 100)
    const [summary] = await listAgentSessionHistory('/repo')

    await expect(loadAgentSessionHistory('/repo', summary)).resolves.toEqual([
      expect.objectContaining({ role: 'user', text: 'hello' }),
      expect.objectContaining({ role: 'assistant', text: 'world' }),
    ])
    await expect(loadAgentSessionHistory('/repo', {
      ...summary,
      transcriptPath: '/home/user/.ssh/id_rsa',
    })).resolves.toEqual([])
  })

  it('drops a hook-provided path outside the workspace and native agent store', async () => {
    await recordAgentSessionEvent(h.runtime, '/repo', event({ transcriptPath: '/etc/passwd' }), 300)
    const [summary] = await listAgentSessionHistory('/repo')
    expect(summary).toMatchObject({ source: 'unknown' })
    expect(summary.transcriptPath).toBeUndefined()
  })

  it('searches transcript content after the metadata index', async () => {
    h.files.set('/repo/.codex/rollout.jsonl', JSON.stringify([
      { type: 'user', message: { role: 'user', content: 'needle in transcript' } },
    ]))
    await recordAgentSessionEvent(h.runtime, '/repo', event(), 400)
    await expect(listAgentSessionHistory('/repo', 'needle')).resolves.toHaveLength(1)
  })
})
