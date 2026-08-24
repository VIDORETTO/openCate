import { describe, expect, it } from 'vitest'
import { AGENTS } from './agents'
import {
  CODING_AGENT_STALLED_AFTER_MS,
  codingAgentCommand,
  codingAgentSupportsFollowUp,
  deriveCodingAgentRunStatus,
  parseCodingAgentId,
} from './codingAgentRuns'

describe('codingAgentCommand', () => {
  it('resolves only canonical agent ids to exact argv without a shell', () => {
    const task = 'Fix it; touch /tmp/pwned'
    const prefixed = `Complete this coding task:\n\n${task}`
    expect(AGENTS.map((agent) => ({
      id: agent.id,
      command: codingAgentCommand({ agentId: agent.id, prompt: task }),
      followUp: codingAgentSupportsFollowUp(agent.id),
    }))).toEqual([
      { id: 'claude-code', command: { executable: 'claude', args: [prefixed] }, followUp: true },
      { id: 'codex', command: { executable: 'codex', args: [prefixed] }, followUp: true },
      { id: 'cursor', command: { executable: 'cursor-agent', args: [prefixed] }, followUp: true },
      { id: 'grok', command: { executable: 'grok', args: [prefixed] }, followUp: true },
      { id: 'opencode', command: { executable: 'opencode', args: ['--prompt', prefixed] }, followUp: true },
      { id: 'pi', command: { executable: 'pi', args: [prefixed] }, followUp: true },
      { id: 'gemini', command: { executable: 'gemini', args: ['--prompt', prefixed] }, followUp: true },
      { id: 'copilot', command: { executable: 'copilot', args: ['--prompt', prefixed] }, followUp: true },
      { id: 'aider', command: { executable: 'aider', args: ['--message', prefixed] }, followUp: true },
    ])
  })

  it('keeps option-looking and subcommand-looking tasks positional', () => {
    expect(codingAgentCommand({
      agentId: 'codex',
      prompt: '--dangerously-bypass-approvals-and-sandbox',
    }).args).toEqual([
      'Complete this coding task:\n\n--dangerously-bypass-approvals-and-sandbox',
    ])
    expect(codingAgentCommand({
      agentId: 'claude-code',
      prompt: '--dangerously-skip-permissions',
    }).args).toEqual([
      'Complete this coding task:\n\n--dangerously-skip-permissions',
    ])
    expect(codingAgentCommand({ agentId: 'codex', prompt: 'exec' }).args).toEqual([
      'Complete this coding task:\n\nexec',
    ])
  })

  it('rejects unknown ids and blank tasks', () => {
    expect(parseCodingAgentId('/tmp/fake-agent')).toBeNull()
    expect(parseCodingAgentId('codex')).toBe('codex')
    expect(() => codingAgentCommand({ agentId: 'pi', prompt: '   ' })).toThrow(
      'A coding-agent prompt is required',
    )
  })
})

describe('deriveCodingAgentRunStatus', () => {
  const run = {
    id: 'run-1',
    agentId: 'codex' as const,
    panelId: 'panel-1',
    ownerPanelId: 'owner-1',
    prompt: 'Implement it',
    createdAt: 1,
  }
  const runtime = {
    terminalStarted: true,
    terminalAlive: true,
    terminalFailed: false,
    agentState: 'running' as const,
  }

  it('keeps a working agent active without an observed output timestamp', () => {
    expect(deriveCodingAgentRunStatus(run, runtime, 1_000)).toBe('working')
  })

  it('marks a running agent stalled after the explicit no-output threshold', () => {
    const observed = deriveCodingAgentRunStatus(
      run,
      { ...runtime, lastOutputAt: 0 },
      CODING_AGENT_STALLED_AFTER_MS,
    )
    expect(observed).toBe('stalled')
  })

  it('does not invent staleness for waiting or completed runs', () => {
    expect(deriveCodingAgentRunStatus(run, { ...runtime, agentState: 'waitingForInput' }, 999_999_999_999)).toBe('waiting')
    expect(deriveCodingAgentRunStatus({ ...run, endedAt: 2, exitCode: 0 }, runtime, 999_999_999_999)).toBe('ready')
  })
})
