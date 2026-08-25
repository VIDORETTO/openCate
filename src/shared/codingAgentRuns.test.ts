import { describe, expect, it } from 'vitest'
import { AGENTS } from './agents'
import {
  CODING_AGENT_STALLED_AFTER_MS,
  codingAgentContextRemainingTokens,
  codingAgentRunDurationMs,
  codingAgentCommand,
  codingAgentSupportsFollowUp,
  deriveCodingAgentRunStatus,
  extractToolCallFromHook,
  mergeCodingAgentActivity,
  mergeCodingAgentUsage,
  normalizeCodingAgentUsage,
  normalizeAgentCommandOverrides,
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

  it('normalizes untrusted overrides and drops malformed entries', () => {
    const normalized = normalizeAgentCommandOverrides({
      agents: {
        codex: { command: '/opt/tools/codex', args: ['--profile', 'safe', '{PROMPT}'] },
        gemini: { preferences: { model: 'gemini-2.5-pro', reasoningEffort: 'high' } },
        'claude-code': { command: 'claude\n--danger' },
        pi: { preferences: { env: { MODEL_TEMPERATURE: '0.2' } } },
        aider: { args: ['valid', 42 as never] },
      },
      profiles: {
        'review.safe': {
          agent: 'codex',
          command: 'codex-review',
          args: ['--review', '{PROMPT}'],
          preferences: { permissions: 'workspace-write', reasoningEffort: 'medium' },
        },
        bad: { agent: 'nope', command: 'sh' },
        empty: {},
      },
      ignored: true,
    })

    expect(normalized).toEqual({
      agents: {
        codex: { command: '/opt/tools/codex', args: ['--profile', 'safe', '{PROMPT}'] },
        gemini: { preferences: { model: 'gemini-2.5-pro', reasoningEffort: 'high' } },
        pi: { preferences: { env: { MODEL_TEMPERATURE: '0.2' } } },
      },
      profiles: {
        'review.safe': {
          agent: 'codex',
          command: 'codex-review',
          args: ['--review', '{PROMPT}'],
          preferences: {
            permissions: 'workspace-write',
            reasoningEffort: 'medium',
          },
        },
      },
    })
  })

  it('applies workspace agent override after canonical argv without shell interpretation', () => {
    expect(codingAgentCommand(
      { agentId: 'codex', prompt: 'dangerous; task' },
      {
        workspaceId: 'ws',
        overrides: {
          agents: { codex: { command: 'podman', args: ['run', '--rm', 'codex', '{PROMPT}'] } },
        },
      },
    )).toEqual({
      executable: 'podman',
      args: [
        'run',
        '--rm',
        'codex',
        `Complete this coding task:\n\ndangerous; task`,
      ],
    })
  })

  it('applies an explicit profile before a workspace agent override', () => {
    const command = codingAgentCommand(
      { agentId: 'gemini', prompt: 'Inspect it', commandProfile: 'fast' },
      {
        workspaceId: 'ws',
        overrides: {
          agents: { gemini: { command: 'agent-override' } },
          profiles: { fast: { agent: 'gemini', command: 'gemini-fast', args: ['{PROMPT}', '--fast'] } },
        },
      },
    )

    expect(command).toEqual({
      executable: 'gemini-fast',
      args: [`Complete this coding task:\n\nInspect it`, '--fast'],
    })
  })

  it('fails closed for unknown or mismatched explicit profiles', () => {
    expect(() => codingAgentCommand(
      { agentId: 'codex', prompt: 'task', commandProfile: 'missing' as never },
      { workspaceId: 'ws', overrides: {} },
    )).toThrow('Unknown coding-agent launch profile')
    expect(() => codingAgentCommand(
      { agentId: 'codex', prompt: 'task', commandProfile: 'claude-only' as never },
      {
        workspaceId: 'ws',
        overrides: { profiles: { 'claude-only': { agent: 'claude-code', command: 'claude' } } },
      },
    )).toThrow('not codex')
  })

  it('translates structured preferences through the canonical registry', () => {
    expect(codingAgentCommand(
      { agentId: 'codex', prompt: 'Implement it', commandProfile: 'safe' },
      {
        workspaceId: 'ws',
        overrides: {
          profiles: {
            safe: {
              agent: 'codex',
              preferences: {
                model: 'gpt-5-codex',
                reasoningEffort: 'high',
                permissions: 'workspace-write',
              },
            },
          },
        },
      },
    )).toEqual({
      executable: 'codex',
      args: [
        '--sandbox', 'workspace-write',
        `Complete this coding task:\n\nImplement it`,
        '-m', 'gpt-5-codex',
        '-c', 'model_reasoning_effort=high',
      ],
    })
  })

  it('drops unsupported structured flags instead of inventing CLI syntax', () => {
    expect(codingAgentCommand(
      { agentId: 'aider', prompt: 'Implement it', commandProfile: 'fast' },
      {
        overrides: {
          profiles: {
            fast: {
              agent: 'aider',
              preferences: { model: 'claude-haiku', reasoningEffort: 'high' },
            },
          },
        },
      },
    )).toEqual({
      executable: 'aider',
      args: ['--message', `Complete this coding task:\n\nImplement it`],
    })
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

describe('coding-agent tool activity observations', () => {
  it('extracts explicit file tools from snake_case hook payloads', () => {
    expect(extractToolCallFromHook({
      tool_name: 'Edit',
      tool_input: { file_path: '/repo/src/app.ts' },
    }, 20)).toEqual({
      name: 'Edit',
      detail: '/repo/src/app.ts',
      filePaths: ['/repo/src/app.ts'],
    })
  })

  it('extracts commands and Grok-style camelCase envelopes without parsing screen text', () => {
    const command = extractToolCallFromHook({
      toolName: 'run_command',
      toolInput: { command: 'vitest   run src/shared' },
    }, 30)
    expect(command).toEqual({
      name: 'Bash',
      detail: 'vitest run src/shared',
      filePaths: [],
    })

    expect(extractToolCallFromHook({
      toolName: 'write_file',
      toolInput: { file_path: '/repo/docs/readme.md' },
    }, 31)).toEqual({
      name: 'Write',
      detail: '/repo/docs/readme.md',
      filePaths: ['/repo/docs/readme.md'],
    })
  })

  it('preserves unknown provider/MCP names but rejects malformed or hostile data', () => {
    expect(extractToolCallFromHook({
      tool_name: 'mcp__github__create_issue',
      tool_input: {},
    }, 40)).toEqual({ name: 'mcp__github__create_issue', filePaths: [] })
    expect(extractToolCallFromHook({ tool_input: {} })).toBeNull()
    expect(extractToolCallFromHook({ tool_name: 'Read', tool_input: {} }, 41)).toEqual({
      name: 'Read',
      filePaths: [],
    })
    expect(extractToolCallFromHook({
      tool_name: 'Edit',
      tool_input: { file_path: 'bad\0path' },
    }, 42)).toEqual({ name: 'Edit', filePaths: [] })
    expect(extractToolCallFromHook({
      tool_name: `${'x'.repeat(81)}`,
    }, 43)).toBeNull()
  })

  it('merges the latest call and keeps a bounded deduplicated recent-path set', () => {
    const oldPaths = Array.from({ length: 50 }, (_, index) => `/old/${String(index).padStart(2, '0')}.ts`)
    const merged = mergeCodingAgentActivity(
      {
        lastToolCall: { name: 'Read', observedAt: 10 },
        filesTouched: oldPaths.map((path) => ({ path, lastObservedAt: 5 })),
      },
      {
        name: 'Edit',
        detail: '/old/00.ts',
        observedAt: 20,
        filePaths: ['/old/00.ts', '/new/source.ts', 'bad\0path'],
      },
    )

    expect(merged.lastToolCall).toEqual({
      name: 'Edit',
      detail: '/old/00.ts',
      observedAt: 20,
    })
    expect(merged.filesTouched).toHaveLength(50)
    expect(merged.filesTouched![0]).toEqual({ path: '/new/source.ts', lastObservedAt: 20 })
    expect(merged.filesTouched![1]).toEqual({ path: '/old/00.ts', lastObservedAt: 20 })
    expect(merged.filesTouched?.at(-1)?.path).toBe('/old/48.ts')

    const unchanged = mergeCodingAgentActivity(merged, {
      ...merged.lastToolCall!,
      observedAt: 15,
      filePaths: ['/new/source.ts'],
    })
    expect(unchanged.lastToolCall).toEqual(merged.lastToolCall)
    expect(unchanged.filesTouched?.[0]).toEqual({ path: '/new/source.ts', lastObservedAt: 20 })
    expect(unchanged.filesTouched?.[1]).toEqual({ path: '/old/00.ts', lastObservedAt: 20 })
  })
})

describe('coding-agent usage observations', () => {
  it('normalizes common provider and Pi nested usage shapes', () => {
    const usage = normalizeCodingAgentUsage({
      message: {
        model: 'claude-sonnet',
        usage: {
          input_tokens: 1_200,
          output_tokens: 340,
          cache_read_input_tokens: 80,
          cache_creation_input_tokens: 20,
          cost: { total: 0.0123 },
        },
      },
      contextUsage: { tokens: 1_560, contextWindow: 200_000 },
    }, 123)

    expect(usage).toEqual({
      inputTokens: 1_200,
      outputTokens: 340,
      cacheReadTokens: 80,
      cacheWriteTokens: 20,
      totalTokens: 1_640,
      costUsd: 0.0123,
      costSource: 'reported',
      contextTokens: 1_560,
      contextWindow: 200_000,
      model: 'claude-sonnet',
      observedAt: 123,
      source: 'hook',
    })
    expect(codingAgentContextRemainingTokens(usage!)).toBe(198_440)
  })

  it('accepts OpenAI-compatible flat usage and refuses free-form text', () => {
    expect(normalizeCodingAgentUsage({
      usage: { prompt_tokens: 10, completion_tokens: 7, total_tokens: 17 },
      total_cost_usd: 0.004,
    }, 456)).toMatchObject({
      inputTokens: 10,
      outputTokens: 7,
      totalTokens: 17,
      costUsd: 0.004,
      observedAt: 456,
    })
    expect(normalizeCodingAgentUsage({ message: 'used 10k tokens and cost $2' }, 456)).toBeNull()
    expect(normalizeCodingAgentUsage({ usage: { input_tokens: -1 } }, 456)).toBeNull()
  })

  it('merges partial later observations without pretending to add turns', () => {
    const first = normalizeCodingAgentUsage({ usage: { input: 10, output: 5 }, model: 'm1' }, 10)!
    const second = normalizeCodingAgentUsage({ usage: { contextTokens: 12, contextWindow: 100 } }, 20)!
    expect(mergeCodingAgentUsage(first, second)).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      contextTokens: 12,
      contextWindow: 100,
      model: 'm1',
      observedAt: 20,
      source: 'hook',
    })
  })

  it('freezes duration at the terminal edge and computes active duration', () => {
    const run = { createdAt: 1_000, endedAt: 4_500, stoppedAt: undefined }
    expect(codingAgentRunDurationMs(run, 99_000)).toBe(3_500)
    expect(codingAgentRunDurationMs({ createdAt: 1_000 }, 6_000)).toBe(5_000)
  })
})
