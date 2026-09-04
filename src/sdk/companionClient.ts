import {
  COMPANION_MAX_RELAY_PAGE_BYTES,
  COMPANION_PROTOCOL_VERSION,
  COMPANION_RELAY_PAGE_LIMIT,
  isCompanionActionMethod,
  isCompanionReadMethod,
  normalizeCompanionPairingInvitation,
  type CompanionActionMethod,
  type CompanionCapability,
  type CompanionFailure,
  type CompanionPairingInvitation,
  type CompanionPairingProof,
  type CompanionReadMethod,
  type CompanionRelayFrame,
  type CompanionRequest,
  type CompanionResponse,
} from '../shared/companionProtocol'
import {
  deriveCompanionKey,
  openCompanionRelayFrame,
  sealCompanionRelayFrame,
  randomCompanionId,
  type CompanionIdentity,
  type CompanionWireMessage,
} from '../shared/companionCrypto'

const MAX_CACHED_RESPONSES = 64
const MAX_TRANSIENT_READ_RETRIES = 3

export interface CompanionRelayConnection {
  relayUrl: string
  channelId: string
  relayToken: string
}

export interface CompanionRelayPage {
  frames: CompanionRelayFrame[]
  nextCursor: number
  expiresAt: number
}

export interface CompanionRelayFetchOptions {
  fetch?: typeof fetch
  relayTimeoutMs?: number
}

export interface CompanionClientOptions extends CompanionRelayFetchOptions {
  requestTtlMs?: number
  timeoutMs?: number
  pollIntervalMs?: number
  now?: () => number
}

export interface CompanionPairingProofOptions {
  label?: string
  now?: () => number
}

export class CompanionClientError extends Error {
  constructor(
    message: string,
    readonly remoteError?: CompanionFailure['error'],
    readonly status?: number,
  ) {
    super(message)
    this.name = 'CompanionClientError'
  }
}

/** Small HTTP transport shared by browser and React Native wrappers. */
export class CompanionRelayHttpTransport {
  private readonly fetchImpl: typeof fetch
  private readonly baseUrl: string
  private readonly relayTimeoutMs: number

  constructor(
    private readonly connection: CompanionRelayConnection,
    options: CompanionRelayFetchOptions = {},
  ) {
    this.fetchImpl = options.fetch ?? globalThis.fetch
    if (!this.fetchImpl) throw new Error('Fetch is unavailable for companion relay')
    this.baseUrl = normalizeRelayUrl(connection.relayUrl)
    this.relayTimeoutMs = boundedOption(options.relayTimeoutMs ?? 15_000, 1_000, 60_000, 'relay timeout')
    if (!connection.channelId || connection.channelId.length > 128) throw new Error('invalid companion channel')
    if (!connection.relayToken || connection.relayToken.length > 256) throw new Error('invalid companion relay token')
  }

  async postFrame(frame: CompanionRelayFrame): Promise<void> {
    const response = await this.request(this.endpoint('frames'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.connection.relayToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(frame),
    })
    if (response.status !== 202) throw new CompanionClientError(`relay rejected frame (${response.status})`, undefined, response.status)
  }

  async readFrames(after: number): Promise<CompanionRelayPage> {
    if (!Number.isSafeInteger(after) || after < 0) throw new Error('invalid companion relay cursor')
    const response = await this.request(
      `${this.endpoint('frames')}?after=${encodeURIComponent(String(after))}&limit=${COMPANION_RELAY_PAGE_LIMIT}`,
      { headers: { Authorization: `Bearer ${this.connection.relayToken}` } },
    )
    if (!response.ok) throw new CompanionClientError(`relay read failed (${response.status})`, undefined, response.status)
    const body = await readJson(response)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid companion relay response')
    const raw = body as Record<string, unknown>
    const nextCursor = raw.nextCursor
    const expiresAt = raw.expiresAt
    if (!Array.isArray(raw.frames) || typeof nextCursor !== 'number' || !Number.isSafeInteger(nextCursor) || nextCursor < after) {
      throw new Error('invalid companion relay page')
    }
    if (typeof expiresAt !== 'number' || !Number.isSafeInteger(expiresAt)) throw new Error('invalid companion relay expiry')
    const frames = raw.frames.map((frame) => {
      if (!frame || typeof frame !== 'object' || Array.isArray(frame)) throw new Error('invalid companion relay frame')
      return frame as CompanionRelayFrame
    })
    return { frames, nextCursor, expiresAt }
  }

  async revoke(): Promise<void> {
    const response = await this.request(this.endpoint(''), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.connection.relayToken}` },
    })
    if (response.status !== 204 && response.status !== 404) {
      throw new CompanionClientError(`relay revoke failed (${response.status})`, undefined, response.status)
    }
  }

  private endpoint(suffix: string): string {
    return `${this.baseUrl}/v1/channels/${encodeURIComponent(this.connection.channelId)}${suffix ? `/${suffix}` : ''}`
  }

  private async request(input: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.relayTimeoutMs)
    try {
      return await this.fetchImpl(input, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }
}

export class CompanionClient {
  private readonly transport: CompanionRelayHttpTransport
  private readonly key: CryptoKey
  private readonly now: () => number
  private readonly requestTtlMs: number
  private readonly timeoutMs: number
  private readonly pollIntervalMs: number
  private cursor = 0
  private pollInFlight: Promise<void> | undefined
  private readonly responses = new Map<string, CompanionResponse>()

  private constructor(
    private readonly invitation: CompanionPairingInvitation,
    key: CryptoKey,
    options: CompanionClientOptions,
  ) {
    this.key = key
    this.now = options.now ?? (() => Date.now())
    this.requestTtlMs = boundedOption(options.requestTtlMs ?? 30_000, 1_000, 15 * 60_000, 'request TTL')
    this.timeoutMs = boundedOption(options.timeoutMs ?? 35_000, 1_000, 5 * 60_000, 'request timeout')
    this.pollIntervalMs = boundedOption(options.pollIntervalMs ?? 100, 0, 5_000, 'poll interval')
    this.transport = new CompanionRelayHttpTransport(invitation, options)
  }

  static async fromInvitation(
    input: unknown,
    identity: CompanionIdentity,
    options: CompanionClientOptions = {},
  ): Promise<CompanionClient> {
    const now = options.now?.() ?? Date.now()
    const invitation = normalizeCompanionPairingInvitation(input, now)
    const key = await deriveCompanionKey(identity, invitation.hostPublicKey, invitation.pairingId)
    return new CompanionClient(invitation, key, options)
  }

  static createPairingProof(
    input: unknown,
    identity: CompanionIdentity,
    code: string,
    options: CompanionPairingProofOptions = {},
  ): CompanionPairingProof {
    const invitation = normalizeCompanionPairingInvitation(input, options.now?.() ?? Date.now())
    if (!/^\d{6}$/u.test(code)) throw new CompanionClientError('invalid companion pairing code')
    return {
      version: COMPANION_PROTOCOL_VERSION,
      pairingId: invitation.pairingId,
      code,
      companionPublicKey: identity.publicKey,
      label: normalizeLabel(options.label),
    }
  }

  get pairingId(): string {
    return this.invitation.pairingId
  }

  get workspaceId(): string {
    return this.invitation.workspaceId
  }

  async read<T = unknown>(method: CompanionReadMethod, args?: unknown): Promise<T> {
    if (!isCompanionReadMethod(method)) throw new CompanionClientError('method is not read-only')
    return this.call<T>(method, 'read', args)
  }

  async approve<T = unknown>(
    method: CompanionActionMethod,
    args: unknown,
    approvalId: string,
  ): Promise<T> {
    if (!isCompanionActionMethod(method)) throw new CompanionClientError('method is not an approved action')
    return this.call<T>(method, 'approve', args, approvalId)
  }

  async closeRelayChannel(): Promise<void> {
    await this.transport.revoke()
  }

  private async call<T>(
    method: CompanionReadMethod | CompanionActionMethod,
    capability: CompanionCapability,
    args?: unknown,
    approvalId?: string,
  ): Promise<T> {
    const now = this.now()
    if (now >= this.invitation.expiresAt) throw new CompanionClientError('companion invitation expired')
    const expiresAt = Math.min(now + this.requestTtlMs, this.invitation.expiresAt)
    if (expiresAt <= now) throw new CompanionClientError('companion request window expired')
    const request: CompanionRequest = {
      version: COMPANION_PROTOCOL_VERSION,
      requestId: randomCompanionId('request'),
      sessionId: this.invitation.sessionId,
      nonce: randomCompanionId('nonce'),
      issuedAt: now,
      expiresAt,
      capability,
      method,
      ...(args !== undefined ? { args } : {}),
      ...(approvalId ? { approvalId } : {}),
    }
    const frame = await sealCompanionRelayFrame({
      channelId: this.invitation.channelId,
      sender: 'companion',
      key: this.key,
      message: { type: 'request', request },
      issuedAt: now,
      ttlMs: Math.min(this.requestTtlMs, 2 * 60_000),
    })
    await this.transport.postFrame(frame)
    const response = await this.waitForResponse(request.requestId)
    if (!response.ok) throw new CompanionClientError(response.message ?? response.error, response.error)
    return response.result as T
  }

  private async waitForResponse(requestId: string): Promise<CompanionResponse> {
    const deadline = Date.now() + this.timeoutMs
    let transientReadRetries = 0
    while (Date.now() < deadline) {
      const cached = this.responses.get(requestId)
      if (cached) {
        this.responses.delete(requestId)
        return cached
      }
      try {
        await this.poll()
        transientReadRetries = 0
      } catch (error) {
        if (!isRetryableCompanionReadFailure(error) || transientReadRetries >= MAX_TRANSIENT_READ_RETRIES) throw error
        transientReadRetries += 1
      }
      const afterPoll = this.responses.get(requestId)
      if (afterPoll) {
        this.responses.delete(requestId)
        return afterPoll
      }
      await delay(Math.min(this.pollIntervalMs, Math.max(0, deadline - Date.now())))
    }
    throw new CompanionClientError('companion request timed out')
  }

  private async poll(): Promise<void> {
    const previous = this.pollInFlight ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(async () => {
      const page = await this.transport.readFrames(this.cursor)
      this.cursor = page.nextCursor
      for (const frame of page.frames) {
        if (frame.sender !== 'desktop' || frame.channelId !== this.invitation.channelId) continue
        let message: CompanionWireMessage
        try {
          message = await openCompanionRelayFrame(frame, this.key, this.now())
        } catch {
          continue
        }
        if (message.type !== 'response' || !isCompanionResponse(message.response)) continue
        this.responses.set(message.response.requestId, message.response)
        while (this.responses.size > MAX_CACHED_RESPONSES) {
          const oldest = this.responses.keys().next().value
          if (oldest === undefined) break
          this.responses.delete(oldest)
        }
      }
    })
    const tracker: { promise?: Promise<void> } = {}
    const clearTrackedPoll = () => {
      if (this.pollInFlight === tracker.promise) this.pollInFlight = undefined
    }
    const tracked = current.then(clearTrackedPoll, clearTrackedPoll)
    tracker.promise = tracked
    this.pollInFlight = tracked
    return current
  }
}

function isCompanionResponse(value: unknown): value is CompanionResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const raw = value as Record<string, unknown>
  return raw.version === COMPANION_PROTOCOL_VERSION
    && typeof raw.requestId === 'string'
    && raw.requestId.length > 0
    && typeof raw.ok === 'boolean'
}

async function readJson(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get('content-length')
  if (declaredLength && Number.isSafeInteger(Number(declaredLength)) && Number(declaredLength) > COMPANION_MAX_RELAY_PAGE_BYTES) {
    throw new CompanionClientError('relay response too large')
  }
  const body = await readBoundedText(response)
  try {
    return JSON.parse(body) as unknown
  } catch {
    throw new CompanionClientError('relay returned invalid JSON')
  }
}

function normalizeRelayUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('invalid companion relay URL')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('invalid companion relay URL')
  }
  if (url.protocol !== 'https:' && !isLoopbackHost(url.hostname)) throw new Error('companion relay URL must use HTTPS')
  if (url.search) throw new Error('invalid companion relay URL')
  return value.replace(/\/+$/u, '')
}

async function readBoundedText(response: Response): Promise<string> {
  if (!response.body) {
    const body = await response.text()
    if (new TextEncoder().encode(body).byteLength > COMPANION_MAX_RELAY_PAGE_BYTES) {
      throw new CompanionClientError('relay response too large')
    }
    return body
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let body = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      total += chunk.value.byteLength
      if (total > COMPANION_MAX_RELAY_PAGE_BYTES) {
        await reader.cancel()
        throw new CompanionClientError('relay response too large')
      }
      body += decoder.decode(chunk.value, { stream: true })
    }
    return body + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]' || hostname === 'localhost'
}

function normalizeLabel(value: string | undefined): string {
  const label = (value ?? 'Companion').trim().replace(/[\u0000-\u001f\u007f]/gu, '')
  return (label || 'Companion').slice(0, 80)
}

function boundedOption(value: number, min: number, max: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`invalid companion ${name}`)
  return value
}

function isRetryableCompanionReadFailure(error: unknown): boolean {
  if (error instanceof CompanionClientError) {
    return error.status === 408 || error.status === 429 || (error.status !== undefined && error.status >= 500)
  }
  if (!error || typeof error !== 'object') return false
  const name = 'name' in error && typeof error.name === 'string' ? error.name : undefined
  return name === 'AbortError' || name === 'TypeError'
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
