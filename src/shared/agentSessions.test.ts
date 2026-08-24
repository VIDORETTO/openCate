import { describe, expect, it } from 'vitest'
import type { AgentHookEvent } from './agentHooks'
import {
  agentSessionKey,
  agentSessionSummaryFromHook,
  normalizeAgentSessionHistory,
  parseAgentTranscript,
  searchAgentSessionSummaries,
  upsertAgentSessionHistory,
} from './agentSessions'

function event(overrides: Partial<AgentHookEvent> = {}): AgentHookEvent {
  return {
    terminalId: 'pty-1',
    agentId: 'codex',
    kind: 'turn-start',
    sessionId: 'session-1',
    cwd: '/repo',
    transcriptPath: '/home/user/.codex/sessions/rollout.jsonl',
    raw: {},
    ...overrides,
  }
}

describe('cross-CLI agent session history', () => {
  it('keys the same session id independently per runtime and CLI', () => {
    expect(agentSessionKey({ runtimeId: 'local', agentId: 'codex', sessionId: 'same' }))
      .not.toBe(agentSessionKey({ runtimeId: 'remote', agentId: 'codex', sessionId: 'same' }))
    expect(agentSessionKey({ runtimeId: 'local', agentId: 'codex', sessionId: 'same' }))
      .not.toBe(agentSessionKey({ runtimeId: 'local', agentId: 'pi', sessionId: 'same' }))
  })

  it('keeps the native transcript path when later lifecycle events omit it', () => {
    const first = agentSessionSummaryFromHook('local', event(), 100)!
    const second = agentSessionSummaryFromHook('local', event({
      kind: 'turn-end',
      transcriptPath: undefined,
    }), 200)!
    const history = upsertAgentSessionHistory(
      upsertAgentSessionHistory({ version: 1, sessions: [] }, first),
      second,
    )
    expect(history.sessions).toHaveLength(1)
    expect(history.sessions[0]).toMatchObject({
      transcriptPath: '/home/user/.codex/sessions/rollout.jsonl',
      createdAt: 100,
      updatedAt: 200,
      lastEvent: 'turn-end',
      source: 'native-transcript',
    })
  })

  it('normalizes metadata from untrusted persisted JSON and searches it', () => {
    const history = normalizeAgentSessionHistory({
      version: 99,
      sessions: [
        { ...agentSessionSummaryFromHook('local', event(), 100), title: 'Fix auth' },
        { runtimeId: 'local', agentId: 'not-an-agent', sessionId: 'bad' },
      ],
    })
    expect(searchAgentSessionSummaries(history.sessions, 'AUTH')).toHaveLength(1)
    expect(searchAgentSessionSummaries(history.sessions, 'missing')).toEqual([])
  })

  it('projects common Claude/Codex/Pi JSONL envelopes without terminal scraping', () => {
    const raw = [
      JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'Fix auth' }] } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Done' }] } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'Review tests' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'function_call', name: 'shell' } }),
      'assistant said 100 tokens',
    ].join('\n')
    expect(parseAgentTranscript(raw, 'codex')).toEqual([
      expect.objectContaining({ role: 'user', text: 'Fix auth' }),
      expect.objectContaining({ role: 'assistant', text: 'Done' }),
      expect.objectContaining({ role: 'user', text: 'Review tests' }),
      expect.objectContaining({ role: 'tool', toolName: 'shell', text: '[shell]' }),
    ])
  })
})
