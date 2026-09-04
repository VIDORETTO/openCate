// =============================================================================
// Shared coding-agent, provider, and authentication contracts.
// =============================================================================

/** Provider category — drives which form the auth UI shows. */
export type AuthProviderKind = 'oauth' | 'apiKey'

export interface AuthProviderDescriptor {
  /** Stable pi-ai provider id (e.g. 'anthropic', 'openai', 'google'). */
  id: string
  /** Display name. */
  name: string
  kind: AuthProviderKind
  /** Hint shown under the input (e.g. where to get a key). */
  helpUrl?: string
  /** For OAuth providers: whether a local callback server is needed. */
  usesCallbackServer?: boolean
}

export interface AuthProviderStatus {
  id: string
  connected: boolean
  /** Last connect time as ISO string, if known. */
  connectedAt?: string
  /** Where the credential lives. */
  source?: 'oauth' | 'env' | 'config'
}

/** Result of actively verifying that a provider's credential works.
 *  - `ok`         — the credential authenticated (OAuth token minted/refreshed, or a
 *                   live model request succeeded).
 *  - `needsReauth`— an OAuth token could not be refreshed; the user must sign in again.
 *  - `error`      — a live request failed (bad/expired API key, endpoint unreachable, …). */
export type ProviderHealth = 'ok' | 'needsReauth' | 'error'

export interface ProviderVerification {
  id: string
  health: ProviderHealth
  /** Human-readable failure detail for `needsReauth` / `error`. */
  error?: string
}

/** A openCate-managed OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, a
 *  proxy, ...), written to pi's models.json. */
export interface CustomOpenAIProvider {
  /** Stable pi provider id. `custom-openai` is retained for legacy configs. */
  id: string
  /** Friendly name shown in provider settings. */
  name: string
  baseUrl: string
  /** Empty for local servers that ignore auth; pi gets a placeholder. */
  apiKey: string
  /** Model ids exposed by the endpoint, e.g. ['llama3.1:8b']. */
  models: string[]
}

export interface CateAgentModelRef {
  provider: string
  model: string
}

/** A selectable model, derived session-independently from the connected
 *  providers in auth.json (plus the custom OpenAI endpoint in models.json). */
export interface CodingModelDescriptor {
  provider: string
  /** Model id passed to pi (e.g. `claude-sonnet-4-6`). */
  id: string
  /** Human label for the picker (pi's model name, falling back to the id). */
  label: string
  contextWindow: number
  reasoning: boolean
}

/** Slash command exposed by pi — a skill, prompt template, or extension cmd. */
export interface CodingSlashCommand {
  name: string
  description?: string
  source: 'extension' | 'prompt' | 'skill'
  /** Absolute path to the file that defines this command (if any). */
  path?: string
  /** Where it lives — user-installed vs. shipped with a package. */
  scope?: 'user' | 'project' | 'temporary'
  /** Whether the file is editable/deletable by the user (true for files under
   *  ~/.pi/agent, false for things shipped inside packages). */
  editable?: boolean
}

export interface CodingCreateOptions {
  panelId: string
  workspaceId: string
  cwd: string
  model?: CateAgentModelRef
  systemPrompt?: string
  /** Resume an existing pi session file (jsonl). When set, pi will load it
   *  on start instead of creating a fresh session. */
  sessionFile?: string
  /** Locator of the WORKSPACE this session belongs to, which may differ from
   *  `cwd` when the panel is pinned to a worktree. Main resolves the workspace's
   *  trust state from this to decide whether project MCP config (`.mcp.json` /
   *  `.pi/mcp.json`) may be honoured — those files are repo-controlled and can
   *  start local commands (GHSA-8769-jp52-985f). Absent ⇒ treated as untrusted. */
  workspaceRoot?: string
}

/** Pi agent events forwarded from main to renderer. We keep the shape loose
 *  since pi's event union is large and may evolve — renderer narrows by `type`. */
export interface CodingEventEnvelope {
  panelId: string
  event: {
    type: string
    [key: string]: unknown
  }
}

/** Pi's reasoning levels (mirrors `ThinkingLevel` from pi-agent-core). */
export type CodingThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

/** Image attachment sent alongside a prompt/steer/followUp. Data is raw base64
 *  (no `data:` prefix) so pi can forward it verbatim as `ImageContent`. */
export interface CodingImageAttachment {
  data: string
  mimeType: string
  /** Optional filename, kept around so the renderer can display a chip. */
  fileName?: string
}

/** Snapshot of pi's session stats — fed from `get_session_stats`. */
export interface CodingSessionStats {
  sessionFile?: string
  sessionId?: string
  userMessages: number
  assistantMessages: number
  toolCalls: number
  toolResults: number
  totalMessages: number
  tokens: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    total: number
  }
  cost: number
  contextUsage?: {
    tokens: number | null
    contextWindow: number
    percent: number | null
  }
}

/** Pi RPC session state snapshot. */
export interface CodingRpcState {
  model: { id: string; provider: string; name?: string; contextWindow?: number; reasoning?: boolean } | null
  thinkingLevel: CodingThinkingLevel
  isStreaming: boolean
  isCompacting: boolean
  steeringMode: 'all' | 'one-at-a-time'
  followUpMode: 'all' | 'one-at-a-time'
  sessionFile?: string
  sessionId?: string
  sessionName?: string
  autoCompactionEnabled: boolean
  messageCount: number
  pendingMessageCount: number
}

/** Pi extension UI request — forwarded verbatim through agent:event so the
 *  renderer can render an in-panel dialog. Dialog methods expect a reply via
 *  CODING_UI_RESPONSE; fire-and-forget methods don't. */
export interface CodingExtensionUIRequest {
  id: string
  method: 'select' | 'confirm' | 'input' | 'editor' | 'notify' | 'setStatus' | 'setWidget' | 'setTitle' | 'set_editor_text'
  [key: string]: unknown
}

export interface CodingExtensionUIResponse {
  id: string
  value?: string
  confirmed?: boolean
  cancelled?: boolean
}

/** A pi session file on disk, parsed enough to populate the chat sidebar. */
export interface CodingSessionListEntry {
  /** Absolute path to the .jsonl file. */
  path: string
  /** Pi session id (UUID from header). */
  id: string
  /** Display title — explicit session_info.sessionName when set, otherwise
   *  derived from the first user message. */
  title: string
  /** True iff title came from `set_session_name`. */
  named: boolean
  /** Cwd recorded in the header (so we can filter by workspace). */
  cwd: string
  /** Header timestamp (ISO). */
  createdAt: string
  /** File mtime (ISO). */
  updatedAt: string
  /** Best-effort count of pi `message` entries. */
  messageCount: number
  /** Last `model_change` entry recorded in the session, if any. Used to
   *  restore the chat's prior model selection on resume. */
  lastModel?: { provider: string; model: string }
}

/** OAuth UI events forwarded to renderer during a login flow. */
export type OAuthFlowEvent =
  | { type: 'auth'; url: string; instructions?: string }
  | { type: 'deviceCode'; userCode: string; verificationUri: string; intervalSeconds?: number; expiresInSeconds?: number }
  | { type: 'progress'; message: string }
  | { type: 'prompt'; promptId: string; message: string; placeholder?: string; allowEmpty?: boolean }
  | { type: 'select'; promptId: string; message: string; options: Array<{ id: string; label: string }> }
  | { type: 'manualCode'; promptId: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
