import { AGENTS, type AgentDef, type AgentId } from './agents'

/** A coding agent process Cate created and owns inside a terminal panel. */
export interface CodingAgentRun {
  id: string
  agentId: AgentId
  panelId: string
  /** Short user-facing responsibility, e.g. “Integration tests”. */
  title?: string
  /** Cate terminal or embedded-agent panel that owns and may control this run. */
  ownerPanelId: string
  prompt: string
  createdAt: number
  worktreeId?: string
  /** True only when this mission created the worktree and may offer discard. */
  ownsWorktree?: boolean
  /** When true, Cate wakes the owning supervisor on actionable state changes.
   *  When false, the supervisor must wait for this run explicitly. */
  background?: boolean
  /** Follow-up prompts sent after the initial task. Kept with panel state so
   *  mission context survives a Cate restart. */
  followUps?: Array<{ prompt: string; sentAt: number }>
  /** Latest structured usage observation from the CLI hook stream. Optional
   *  because several CLIs expose lifecycle hooks but no usage payload. */
  usage?: CodingAgentUsage
  endedAt?: number
  exitCode?: number
  stoppedAt?: number
  appliedAt?: number
  appliedToBranch?: string
  /** User explicitly chose to retain the isolated branch for later. */
  keptAt?: number
}

/** One-shot launch data consumed when the terminal's PTY is first spawned. */
export interface CodingAgentLaunch {
  runId: string
  agentId: AgentId
  /** Optional named launch profile from settings.agentCommandOverrides. */
  commandProfile?: string
  title?: string
  prompt: string
  ownerPanelId: string
  ownsWorktree?: boolean
  background?: boolean
}

export type CodingAgentRunStatus =
  | 'starting'
  | 'working'
  | 'stalled'
  | 'waiting'
  | 'ready'
  | 'stopped'
  | 'failed'

/** Usage observed from a coding-agent hook payload. Every field is optional:
 * CLIs expose different subsets, and Cate must not manufacture a number when
 * the provider did not report one. Values are snapshots from the latest
 * structured report; they are not inferred from terminal text. */
export interface CodingAgentUsage {
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  totalTokens?: number
  /** Provider-reported cost, or a future explicitly marked estimate. */
  costUsd?: number
  costSource?: 'reported' | 'estimated'
  /** Current context usage and model limit when the CLI exposes both. */
  contextTokens?: number
  contextWindow?: number
  model?: string
  observedAt: number
  source: 'hook'
}

/** Return the live elapsed duration for a mission. A stopped/finished run is
 * frozen at its terminal edge; an active run keeps advancing in the UI. */
export function codingAgentRunDurationMs(run: Pick<CodingAgentRun, 'createdAt' | 'endedAt' | 'stoppedAt'>, now = Date.now()): number {
  const end = run.endedAt ?? run.stoppedAt ?? now
  return Math.max(0, end - run.createdAt)
}

export function codingAgentContextRemainingTokens(usage: CodingAgentUsage | undefined): number | undefined {
  if (!usage || usage.contextTokens === undefined || usage.contextWindow === undefined) return undefined
  return Math.max(0, usage.contextWindow - usage.contextTokens)
}

const MAX_USAGE_NUMBER = 1_000_000_000_000
const MAX_USAGE_COST = 1_000_000_000

function boundedNumber(value: unknown, max = MAX_USAGE_NUMBER): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) return undefined
  return value
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function firstNumber(records: readonly (Record<string, unknown> | undefined)[], keys: readonly string[], max = MAX_USAGE_NUMBER): number | undefined {
  for (const record of records) {
    if (!record) continue
    for (const key of keys) {
      const value = boundedNumber(record[key], max)
      if (value !== undefined) return value
    }
  }
  return undefined
}

function firstString(records: readonly (Record<string, unknown> | undefined)[], keys: readonly string[]): string | undefined {
  for (const record of records) {
    if (!record) continue
    for (const key of keys) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 200)
    }
  }
  return undefined
}

/** Extract only explicit, structured usage fields from a raw hook payload.
 * Supports the common shapes used by Claude/Codex-compatible hooks, OpenAI
 * responses, and Pi's `{message: {usage}}` payload without parsing free-form
 * terminal output. Returns null when the CLI gave Cate no metric. */
export function normalizeCodingAgentUsage(raw: unknown, observedAt = Date.now()): CodingAgentUsage | null {
  const root = recordValue(raw)
  if (!root) return null
  const usage = recordValue(root.usage)
  const stats = recordValue(root.stats)
  const metrics = recordValue(root.metrics)
  const message = recordValue(root.message)
  const messageUsage = recordValue(message?.usage)
  const response = recordValue(root.response)
  const responseUsage = recordValue(response?.usage)
  const result = recordValue(root.result)
  const resultUsage = recordValue(result?.usage)
  const contextUsage = recordValue(root.contextUsage) ?? recordValue(root.context_usage)
  const records = [
    usage,
    messageUsage,
    responseUsage,
    resultUsage,
    stats,
    metrics,
    contextUsage,
    message,
    response,
    result,
    root,
  ] as const

  const inputTokens = firstNumber(records, ['inputTokens', 'input_tokens', 'promptTokens', 'prompt_tokens', 'input'])
  const outputTokens = firstNumber(records, ['outputTokens', 'output_tokens', 'completionTokens', 'completion_tokens', 'output'])
  const cacheReadTokens = firstNumber(records, ['cacheReadTokens', 'cache_read_input_tokens', 'cacheRead', 'cache_read'])
  const cacheWriteTokens = firstNumber(records, ['cacheWriteTokens', 'cache_creation_input_tokens', 'cacheWrite', 'cache_write'])
  const explicitTotalTokens = firstNumber(records, ['totalTokens', 'total_tokens'])
  const totalTokens = explicitTotalTokens ?? (
    inputTokens !== undefined || outputTokens !== undefined || cacheReadTokens !== undefined || cacheWriteTokens !== undefined
      ? (inputTokens ?? 0) + (outputTokens ?? 0) + (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0)
      : undefined
  )
  const costUsd = firstNumber(records, [
    'costUsd',
    'cost_usd',
    'totalCostUsd',
    'total_cost_usd',
    'cost',
  ], MAX_USAGE_COST) ?? firstNumber(
    [
      recordValue(usage?.cost),
      recordValue(messageUsage?.cost),
      recordValue(responseUsage?.cost),
      recordValue(resultUsage?.cost),
    ],
    ['total', 'totalUsd', 'total_usd', 'usd'],
    MAX_USAGE_COST,
  )
  const contextTokens = firstNumber(records, [
    'contextTokens',
    'context_tokens',
    'contextUsedTokens',
    'context_used_tokens',
    'tokens',
  ])
  const contextWindow = firstNumber(records, [
    'contextWindow',
    'context_window',
    'contextLimit',
    'context_limit',
  ])
  const model = firstString(records, ['model', 'modelId', 'model_id'])

  if (
    inputTokens === undefined && outputTokens === undefined && cacheReadTokens === undefined &&
    cacheWriteTokens === undefined && totalTokens === undefined && costUsd === undefined &&
    contextTokens === undefined && contextWindow === undefined && model === undefined
  ) return null

  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
    ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(costUsd !== undefined ? { costUsd, costSource: 'reported' as const } : {}),
    ...(contextTokens !== undefined ? { contextTokens } : {}),
    ...(contextWindow !== undefined ? { contextWindow } : {}),
    ...(model !== undefined ? { model } : {}),
    observedAt,
    source: 'hook',
  }
}

/** Merge a partial later report without erasing fields another hook already
 * exposed. This is a latest-observation merge, deliberately not an addition:
 * hook payloads differ on whether token counts are per-turn or cumulative. */
export function mergeCodingAgentUsage(
  previous: CodingAgentUsage | undefined,
  next: CodingAgentUsage,
): CodingAgentUsage {
  return { ...previous, ...next, observedAt: Math.max(previous?.observedAt ?? 0, next.observedAt) }
}

export interface CodingAgentRuntimeState {
  terminalStarted: boolean
  terminalAlive: boolean
  terminalFailed: boolean
  agentState?: 'notRunning' | 'running' | 'waitingForInput' | 'finished'
  agentPresent?: boolean
  /** Epoch milliseconds of the last observed PTY output. Omitted means unknown,
   *  never stale: callers must not invent a timestamp they did not observe. */
  lastOutputAt?: number
}

/** A working agent with no output for this long is surfaced as stalled rather
 *  than silently continuing to shimmer. Generous enough to cover long tool runs
 *  and slow remote links, while still turning "no news" into an explicit state. */
export const CODING_AGENT_STALLED_AFTER_MS = 5 * 60_000

/** One status policy shared by the renderer supervisor and the cross-window
 * discovery report. Keeping this pure prevents detached-worker waits from
 * interpreting the same terminal differently. */
export function deriveCodingAgentRunStatus(
  run: CodingAgentRun,
  runtime: CodingAgentRuntimeState,
  now = Date.now(),
): CodingAgentRunStatus {
  if (run.stoppedAt) return 'stopped'
  if (run.endedAt) return run.exitCode === 0 ? 'ready' : 'failed'
  if (runtime.terminalFailed) return 'failed'
  if (!runtime.terminalStarted) return 'starting'
  if (!runtime.terminalAlive) return 'ready'
  switch (runtime.agentState) {
    case 'running':
      return runtime.lastOutputAt !== undefined && now - runtime.lastOutputAt >= CODING_AGENT_STALLED_AFTER_MS
        ? 'stalled'
        : 'working'
    case 'waitingForInput': return 'waiting'
    case 'finished': return 'ready'
    case 'notRunning':
    default:
      return runtime.agentPresent ? 'working' : 'starting'
  }
}

export interface CodingAgentRunSnapshot extends CodingAgentRun {
  status: CodingAgentRunStatus
  agentName: string
  cwd: string
  alive: boolean
  durationMs: number
  contextRemainingTokens?: number
  /** Derived from the canonical agent capability registry. */
  followUpSupported: boolean
  statusLine?: string
  failureReason?: string
}

export const MAX_CONCURRENT_CODING_AGENTS = 5
const CODING_AGENT_TASK_PREFIX = 'Complete this coding task:\n\n'

/** Replace an agent's canonical executable/argv for a project or workflow.
 *  Args replace the canonical argv entirely: appending flags would make one
 *  agent's option parser able to turn another profile's task into a directive. */
export interface AgentCommandOverride {
  command?: string
  args?: readonly string[]
  /** Structured, registry-translated launch preferences. */
  preferences?: AgentEnvironmentPreferences
}

/** Named, reusable launch override. An optional agent makes it apply only when
 *  that exact agent is selected; unrestricted profiles apply to every agent. */
export interface AgentCommandProfile extends AgentCommandOverride {
  agent?: AgentId
}

/** Structured launch preferences that are translated by the canonical agent
 *  registry instead of being passed through as raw CLI flags. */
export interface AgentLaunchPreferences {
  /** Provider/model identifier accepted by the target CLI. Free-form because
   *  model catalogs change frequently and are provider-owned. */
  model?: string
  /** Coarse reasoning effort; mapped only when the CLI exposes a compatible
   *  flag or environment variable. Unsupported levels are dropped. */
  reasoningEffort?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
}

/** Explicit permission posture for a mission launch. `default` means "let the
 *  agent use its own project/user policy"; the other values map to documented
 *  per-CLI modes and never to a generic shell bypass. */
export type AgentPermissionMode = 'default' | 'ask' | 'workspace-write' | 'bypass'

export interface AgentEnvironmentPreferences extends AgentLaunchPreferences {
  permissions?: AgentPermissionMode
  /** Extra spawn environment. Keys cannot reserve Cate's CATE_* namespace and
   *  values are length/NUL-bounded. Invalid entries invalidate the whole object
   *  so a hand edit can never partially become a spawn contract. */
  env?: Record<string, string>
}

export interface AgentCommandOverrides {
  agents?: Partial<Record<AgentId, AgentCommandOverride>>
  profiles?: Record<string, AgentCommandProfile>
}

export const EMPTY_AGENT_COMMAND_OVERRIDES: AgentCommandOverrides = {}

const PROFILE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const MAX_COMMAND_LENGTH = 1_024
const MAX_ARG_LENGTH = 16_384
const MAX_ARGS = 64
const MAX_MODEL_LENGTH = 200
const MAX_ENV_ENTRIES = 64
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/

function validModel(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_MODEL_LENGTH &&
    !hasControlChars(value)
}

function validReasoningEffort(value: unknown): value is NonNullable<AgentLaunchPreferences['reasoningEffort']> {
  return value === 'off' || value === 'minimal' || value === 'low' ||
    value === 'medium' || value === 'high' || value === 'xhigh'
}

function validPermissionMode(value: unknown): value is AgentPermissionMode {
  return value === 'default' || value === 'ask' || value === 'workspace-write' || value === 'bypass'
}

function normalizeAgentEnvironmentPreferences(
  value: unknown,
): AgentEnvironmentPreferences | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const source = value as AgentEnvironmentPreferences
  const clean: AgentEnvironmentPreferences = {}
  if (source.model !== undefined) {
    if (!validModel(source.model)) return undefined
    clean.model = source.model.trim()
  }
  if (source.reasoningEffort !== undefined) {
    if (!validReasoningEffort(source.reasoningEffort)) return undefined
    clean.reasoningEffort = source.reasoningEffort
  }
  if (source.permissions !== undefined) {
    if (!validPermissionMode(source.permissions)) return undefined
    if (source.permissions !== 'default') clean.permissions = source.permissions
  }
  if (source.env !== undefined) {
    if (!validEnv(source.env)) return undefined
    clean.env = Object.fromEntries(Object.entries(source.env).sort(([a], [b]) => a.localeCompare(b)))
  }
  return Object.keys(clean).length > 0 ? clean : undefined
}

function validEnv(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const entries = Object.entries(value)
  if (entries.length > MAX_ENV_ENTRIES) return false
  return entries.every(([key, val]) =>
    ENV_KEY_RE.test(key) &&
    !key.toLowerCase().startsWith('cate_') &&
    typeof val === 'string' &&
    val.length <= MAX_ARG_LENGTH &&
    !val.includes('\0'),
  )
}

function hasControlChars(value: string): boolean {
  return /[\0\x01-\x1f\x7f]/.test(value)
}

function validCommand(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_COMMAND_LENGTH &&
    !hasControlChars(value)
}

function validArgs(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_ARGS && value.every((arg) =>
    typeof arg === 'string' && arg.length <= MAX_ARG_LENGTH && !hasControlChars(arg),
  )
}

/** Validate untrusted settings without throwing. Unknown/malformed entries are
 *  dropped so a bad hand edit cannot poison every subsequent agent launch. */
export function normalizeAgentCommandOverrides(value: unknown): AgentCommandOverrides {
  const result: AgentCommandOverrides = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result
  const source = value as { agents?: unknown; profiles?: unknown }

  if (source.agents && typeof source.agents === 'object' && !Array.isArray(source.agents)) {
    const agents: Partial<Record<AgentId, AgentCommandOverride>> = {}
    for (const agent of AGENTS) {
      const raw = (source.agents as Record<string, unknown>)[agent.id]
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
      const entry = raw as AgentCommandOverride
      const clean: AgentCommandOverride = {}
      if (entry.command !== undefined) {
        if (!validCommand(entry.command)) continue
        clean.command = entry.command
      }
      if (entry.args !== undefined) {
        if (!validArgs(entry.args)) continue
        clean.args = entry.args
      }
      const preferences = normalizeAgentEnvironmentPreferences(entry.preferences)
      if (preferences) clean.preferences = preferences
      if (
        clean.command !== undefined || clean.args !== undefined || clean.preferences !== undefined
      ) agents[agent.id] = clean
    }
    if (Object.keys(agents).length > 0) result.agents = agents
  }

  if (source.profiles && typeof source.profiles === 'object' && !Array.isArray(source.profiles)) {
    const profiles: Record<string, AgentCommandProfile> = {}
    for (const [id, raw] of Object.entries(source.profiles)) {
      if (!PROFILE_ID_RE.test(id) || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue
      const entry = raw as AgentCommandProfile
      const clean: AgentCommandProfile = {}
      if (entry.agent !== undefined) {
        if (!AGENTS.some((agent) => agent.id === entry.agent)) continue
        clean.agent = entry.agent
      }
      if (entry.command !== undefined) {
        if (!validCommand(entry.command)) continue
        clean.command = entry.command
      }
      if (entry.args !== undefined) {
        if (!validArgs(entry.args)) continue
        clean.args = entry.args
      }
      const preferences = normalizeAgentEnvironmentPreferences(entry.preferences)
      if (preferences) clean.preferences = preferences
      if (
        clean.command !== undefined || clean.args !== undefined || clean.preferences !== undefined
      ) profiles[id] = clean
    }
    if (Object.keys(profiles).length > 0) result.profiles = profiles
  }
  return result
}

interface ResolvedAgentCommandOptions {
  workspaceId?: string
  profileId?: string
  strictUnsupported?: boolean
  overrides?: unknown
}

/** Resolve executable + argv once, at the single PTY spawn boundary.
 *  Precedence is explicit profile < agent override < canonical registry; args
 *  always replace rather than concatenate. Explicit profile errors fail closed. */
function resolveRegisteredAgentCommand(
  agent: AgentDef,
  canonicalArgs: string[],
  options: ResolvedAgentCommandOptions = {},
): { executable: string; args: string[] } {
  const overrides = normalizeAgentCommandOverrides(options.overrides)
  let executable = agent.command
  let args = canonicalArgs
  let selectedPreferences: AgentEnvironmentPreferences | undefined

  if (options.profileId !== undefined) {
    const profile = overrides.profiles?.[options.profileId]
    if (!profile) {
      throw new Error(`Unknown coding-agent launch profile: ${options.profileId}`)
    }
    if (profile.agent !== undefined && profile.agent !== agent.id) {
      throw new Error(
        `Coding-agent launch profile ${options.profileId} applies to ${profile.agent}, not ${agent.id}`,
      )
    }
    if (profile.command !== undefined) executable = profile.command
    if (profile.args !== undefined) args = [...profile.args]
    selectedPreferences = profile.preferences
  }

  // Workspace agent override applies only when no explicit profile was chosen:
  // the profile is the more specific user intent and must not be clobbered by
  // a broad per-agent replacement.
  if (options.profileId === undefined) {
    const agentOverride = overrides.agents?.[agent.id]
    if (agentOverride?.command !== undefined) executable = agentOverride.command
    if (agentOverride?.args !== undefined) args = [...agentOverride.args]
    selectedPreferences ??= agentOverride?.preferences
  }

  // Interpolate the task into the override argv. The canonical argv already
  // carries it as a positional; when an override replaces the argv, the user's
  // `{PROMPT}` token is the only way to place it. Without this, a wrapper would
  // receive no task at all. No shell involved, so the text stays one argument.
  args = args.map((arg) => arg.replace(/\{PROMPT\}/g, canonicalArgs[canonicalArgs.length - 1]))

  // Structured preferences are resolved after override argv replacement so they
  // remain meaningful for wrapper commands too. They are not raw user flags:
  // every supported mapping comes from the canonical agent registry.
  if (selectedPreferences?.model !== undefined && supportsLaunchPreference(agent.id, 'model')) {
    args.push(...agent.launchPreferences!.model!.args(selectedPreferences.model))
  }
  if (
    selectedPreferences?.reasoningEffort !== undefined &&
    supportsLaunchPreference(agent.id, 'reasoning')
  ) {
    const effortArgs = agent.launchPreferences!.reasoning![selectedPreferences.reasoningEffort]
    if (effortArgs) args.push(...effortArgs)
  }
  if (selectedPreferences?.permissions && selectedPreferences.permissions !== 'default') {
    const mapping = agent.permissionModes?.[
      selectedPreferences.permissions === 'workspace-write' ? 'workspaceWrite' : selectedPreferences.permissions
    ]
    if (mapping) {
      args.splice(mapping.promptIndex ?? args.length, 0, ...mapping.args)
    } else if (mapping === null && options.strictUnsupported !== false) {
      throw new Error(
        `${agent.displayName} does not support the ${selectedPreferences.permissions} permission mode`,
      )
    }
  }

  return { executable, args }
}

/** Resolve an untrusted tool argument to the closed, canonical agent registry. */
export function parseCodingAgentId(value: unknown): AgentId | null {
  if (typeof value !== 'string') return null
  return AGENTS.some((agent) => agent.id === value) ? (value as AgentId) : null
}

/**
 * Build the exact executable + argv for a Cate-owned coding-agent PTY.
 *
 * No shell is involved, so task text cannot become shell syntax. Prefixing the
 * positional task also prevents option/subcommand injection into the CLI's own
 * argv parser. Every executable comes from AGENTS; callers cannot provide a
 * path or extra flags. OpenCode's prompt-bearing surface is its `run` command.
 */
export function codingAgentCommand(
  launch: Pick<CodingAgentLaunch, 'agentId' | 'prompt' | 'commandProfile'>,
  options: ResolvedAgentCommandOptions = {},
): { executable: string; args: string[] } {
  const agent = AGENTS.find((candidate) => candidate.id === launch.agentId)
  if (!agent) throw new Error(`Unsupported coding agent: ${launch.agentId}`)
  const prompt = launch.prompt.trim()
  if (!prompt) throw new Error('A coding-agent prompt is required')
  if (prompt.includes('\0')) throw new Error('Coding-agent prompts cannot contain NUL bytes')
  return resolveRegisteredAgentCommand(
    agent,
    agent.codingAgentArgs(`${CODING_AGENT_TASK_PREFIX}${prompt}`),
    { ...options, profileId: options.profileId ?? launch.commandProfile },
  )
}

export function codingAgentDisplayName(agentId: string): string {
  return AGENTS.find((agent) => agent.id === agentId)?.displayName ?? agentId
}

export function codingAgentSupportsFollowUp(agentId: AgentId): boolean {
  return AGENTS.find((agent) => agent.id === agentId)?.codingAgentFollowUp ?? false
}

/** Whether the canonical registry can translate a structured launch preference. */
export function supportsLaunchPreference(
  agentId: AgentId,
  preference: 'model' | 'reasoning',
): boolean {
  const agent = AGENTS.find((candidate) => candidate.id === agentId)
  return Boolean(agent?.launchPreferences?.[preference])
}
