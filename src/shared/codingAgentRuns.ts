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
}

/** Named, reusable launch override. An optional agent makes it apply only when
 *  that exact agent is selected; unrestricted profiles apply to every agent. */
export interface AgentCommandProfile extends AgentCommandOverride {
  agent?: AgentId
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
      if (clean.command !== undefined || clean.args !== undefined) agents[agent.id] = clean
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
      if (clean.command !== undefined || clean.args !== undefined) profiles[id] = clean
    }
    if (Object.keys(profiles).length > 0) result.profiles = profiles
  }
  return result
}

interface ResolvedAgentCommandOptions {
  workspaceId?: string
  profileId?: string
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
  }

  // Workspace agent override applies only when no explicit profile was chosen:
  // the profile is the more specific user intent and must not be clobbered by
  // a broad per-agent replacement.
  if (options.profileId === undefined) {
    const agentOverride = overrides.agents?.[agent.id]
    if (agentOverride?.command !== undefined) executable = agentOverride.command
    if (agentOverride?.args !== undefined) args = [...agentOverride.args]
  }

  // Interpolate the task into the override argv. The canonical argv already
  // carries it as a positional; when an override replaces the argv, the user's
  // `{PROMPT}` token is the only way to place it. Without this, a wrapper would
  // receive no task at all. No shell involved, so the text stays one argument.
  args = args.map((arg) => arg.replace(/\{PROMPT\}/g, canonicalArgs[canonicalArgs.length - 1]))

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
