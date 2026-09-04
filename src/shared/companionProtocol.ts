/**
 * Transport-neutral contract for a future mobile/web companion.
 *
 * The companion surface is deliberately smaller than CATE_API: reads are
 * enumerated, terminal scrollback is not a read method, and writes require an
 * approval id minted by the desktop host. A relay only forwards opaque frames
 * and never needs a openCate account or workspace credentials.
 */

export const COMPANION_PROTOCOL_VERSION = 1
export const COMPANION_MAX_REQUEST_BYTES = 256 * 1024
export const COMPANION_MAX_RESPONSE_BYTES = 512 * 1024
export const COMPANION_MAX_RELAY_FRAME_BYTES = 768 * 1024
export const COMPANION_MAX_INVITATION_BYTES = 16 * 1024
export const COMPANION_RELAY_PAGE_LIMIT = 8
export const COMPANION_MAX_RELAY_PAGE_BYTES = 8 * 1024 * 1024

export const COMPANION_READ_METHODS = [
  'cate.version',
  'cate.workspace.get',
  'cate.panel.list',
  'cate.project.get',
  'cate.tasks.list',
  'cate.tasks.get',
  'cate.context.list',
  'cate.context.get',
  'cate.results.list',
  'cate.results.get',
  'cate.codingAgent.list',
  'cate.codingAgent.inspect',
] as const

export const COMPANION_ACTION_METHODS = [
  'cate.codingAgent.send',
  'cate.tasks.update',
] as const

export type CompanionReadMethod = typeof COMPANION_READ_METHODS[number]
export type CompanionActionMethod = typeof COMPANION_ACTION_METHODS[number]
export type CompanionMethod = CompanionReadMethod | CompanionActionMethod
export type CompanionCapability = 'read' | 'approve'

export interface CompanionRequest {
  version: typeof COMPANION_PROTOCOL_VERSION
  requestId: string
  sessionId: string
  nonce: string
  issuedAt: number
  expiresAt: number
  capability: CompanionCapability
  method: CompanionMethod
  args?: unknown
  /** Required for actions; the desktop minted it after an explicit approval. */
  approvalId?: string
}

export interface CompanionSuccess {
  version: typeof COMPANION_PROTOCOL_VERSION
  requestId: string
  ok: true
  result: unknown
}

export interface CompanionFailure {
  version: typeof COMPANION_PROTOCOL_VERSION
  requestId: string
  ok: false
  error: 'bad-request' | 'unauthorized' | 'expired' | 'read-only' | 'approval-required' | 'too-large' | 'upstream'
  message?: string
}

export type CompanionResponse = CompanionSuccess | CompanionFailure

/**
 * Public bootstrap data for a companion device. The desktop session token is
 * deliberately absent: only the desktop relay responder holds it, while the
 * companion authenticates the encrypted channel with its paired key.
 */
export interface CompanionPairingInvitation {
  version: typeof COMPANION_PROTOCOL_VERSION
  pairingId: string
  workspaceId: string
  relayUrl: string
  channelId: string
  relayToken: string
  sessionId: string
  hostPublicKey: string
  expiresAt: number
}

export interface CompanionPairingProof {
  version: typeof COMPANION_PROTOCOL_VERSION
  pairingId: string
  code: string
  companionPublicKey: string
  label: string
}

/** Opaque end-to-end encrypted frame accepted by a relay. The relay forwards
 *  `ciphertext` and metadata only; it cannot parse a CompanionRequest. */
export interface CompanionRelayFrame {
  version: typeof COMPANION_PROTOCOL_VERSION
  frameId: string
  channelId: string
  sender: 'desktop' | 'companion'
  issuedAt: number
  expiresAt: number
  ciphertext: string
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

function isMethod(value: unknown): value is CompanionMethod {
  if (typeof value !== 'string') return false
  return (COMPANION_READ_METHODS as readonly string[]).includes(value)
    || (COMPANION_ACTION_METHODS as readonly string[]).includes(value)
}

export function isCompanionReadMethod(method: string): method is CompanionReadMethod {
  return (COMPANION_READ_METHODS as readonly string[]).includes(method)
}

export function isCompanionActionMethod(method: string): method is CompanionActionMethod {
  return (COMPANION_ACTION_METHODS as readonly string[]).includes(method)
}

function encodedSize(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

export function normalizeCompanionRequest(input: unknown, now = Date.now()): CompanionRequest {
  if (encodedSize(input) > COMPANION_MAX_REQUEST_BYTES) throw new Error('companion request too large')
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('companion request must be an object')
  const raw = input as Record<string, unknown>
  if (raw.version !== COMPANION_PROTOCOL_VERSION) throw new Error('unsupported companion protocol version')
  if (!isBoundedString(raw.requestId, 128)) throw new Error('invalid companion request id')
  if (!isBoundedString(raw.sessionId, 128)) throw new Error('invalid companion session id')
  if (!isBoundedString(raw.nonce, 128)) throw new Error('invalid companion nonce')
  if (!Number.isSafeInteger(raw.issuedAt) || !Number.isSafeInteger(raw.expiresAt)) throw new Error('invalid companion request time')
  if ((raw.issuedAt as number) > now + 30_000 || (raw.expiresAt as number) <= (raw.issuedAt as number)) {
    throw new Error('invalid companion request window')
  }
  if ((raw.expiresAt as number) <= now) throw new Error('expired companion request')
  if ((raw.expiresAt as number) - (raw.issuedAt as number) > 15 * 60_000) {
    throw new Error('companion request window too long')
  }
  if (raw.capability !== 'read' && raw.capability !== 'approve') throw new Error('invalid companion capability')
  if (!isMethod(raw.method)) throw new Error('unsupported companion method')
  if (raw.approvalId !== undefined && !isBoundedString(raw.approvalId, 128)) throw new Error('invalid companion approval')
  if (raw.args !== undefined && encodedSize(raw.args) > COMPANION_MAX_REQUEST_BYTES / 2) {
    throw new Error('companion arguments too large')
  }
  if (isCompanionActionMethod(raw.method) && !isBoundedString(raw.approvalId, 128)) {
    throw new Error('companion action requires approval')
  }
  return {
    version: COMPANION_PROTOCOL_VERSION,
    requestId: raw.requestId,
    sessionId: raw.sessionId,
    nonce: raw.nonce,
    issuedAt: raw.issuedAt as number,
    expiresAt: raw.expiresAt as number,
    capability: raw.capability,
    method: raw.method,
    ...(raw.args !== undefined ? { args: raw.args } : {}),
    ...(raw.approvalId !== undefined ? { approvalId: raw.approvalId as string } : {}),
  }
}

export function companionSuccess(requestId: string, result: unknown): CompanionSuccess | null {
  if (encodedSize(result) > COMPANION_MAX_RESPONSE_BYTES) return null
  return { version: COMPANION_PROTOCOL_VERSION, requestId, ok: true, result }
}

export function companionFailure(
  requestId: string,
  error: CompanionFailure['error'],
  message?: string,
): CompanionFailure {
  return {
    version: COMPANION_PROTOCOL_VERSION,
    requestId,
    ok: false,
    error,
    ...(message ? { message: message.slice(0, 300) } : {}),
  }
}

export function normalizeCompanionPairingInvitation(
  input: unknown,
  now = Date.now(),
): CompanionPairingInvitation {
  if (encodedSize(input) > COMPANION_MAX_INVITATION_BYTES) {
    throw new Error('companion invitation too large')
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('companion invitation must be an object')
  }
  const raw = input as Record<string, unknown>
  const strings: Array<[string, number]> = [
    ['pairingId', 128],
    ['workspaceId', 128],
    ['relayUrl', 2048],
    ['channelId', 128],
    ['relayToken', 256],
    ['sessionId', 128],
    ['hostPublicKey', 4096],
  ]
  if (raw.version !== COMPANION_PROTOCOL_VERSION) {
    throw new Error('unsupported companion invitation version')
  }
  for (const [key, max] of strings) {
    if (!isBoundedString(raw[key], max)) throw new Error(`invalid companion invitation ${key}`)
  }
  if (!Number.isSafeInteger(raw.expiresAt) || (raw.expiresAt as number) <= now) {
    throw new Error('expired companion invitation')
  }
  if ((raw.expiresAt as number) - now > 15 * 60_000) {
    throw new Error('companion invitation window too long')
  }
  let relay: URL
  try {
    relay = new URL(raw.relayUrl as string)
  } catch {
    throw new Error('invalid companion relay URL')
  }
  if (!['http:', 'https:'].includes(relay.protocol) || relay.username || relay.password || relay.hash) {
    throw new Error('invalid companion relay URL')
  }
  if (relay.protocol !== 'https:' && !isLoopbackHost(relay.hostname)) {
    throw new Error('companion relay URL must use HTTPS')
  }
  return {
    version: COMPANION_PROTOCOL_VERSION,
    pairingId: raw.pairingId as string,
    workspaceId: raw.workspaceId as string,
    relayUrl: raw.relayUrl as string,
    channelId: raw.channelId as string,
    relayToken: raw.relayToken as string,
    sessionId: raw.sessionId as string,
    hostPublicKey: raw.hostPublicKey as string,
    expiresAt: raw.expiresAt as number,
  }
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]' || hostname === 'localhost'
}

export function validateRelayFrame(input: unknown, now = Date.now()): CompanionRelayFrame {
  if (encodedSize(input) > COMPANION_MAX_RELAY_FRAME_BYTES) throw new Error('relay frame too large')
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('relay frame must be an object')
  const raw = input as Record<string, unknown>
  if (raw.version !== COMPANION_PROTOCOL_VERSION) throw new Error('unsupported relay protocol version')
  if (!isBoundedString(raw.frameId, 128) || !isBoundedString(raw.channelId, 128)) throw new Error('invalid relay frame identity')
  if (raw.sender !== 'desktop' && raw.sender !== 'companion') throw new Error('invalid relay frame sender')
  if (!Number.isSafeInteger(raw.issuedAt) || !Number.isSafeInteger(raw.expiresAt)) throw new Error('invalid relay frame time')
  if ((raw.issuedAt as number) > now + 30_000 || (raw.expiresAt as number) <= now) throw new Error('expired relay frame')
  if ((raw.expiresAt as number) - (raw.issuedAt as number) > 15 * 60_000) throw new Error('relay frame window too long')
  if (!isBoundedString(raw.ciphertext, COMPANION_MAX_RELAY_FRAME_BYTES)) throw new Error('invalid relay ciphertext')
  return {
    version: COMPANION_PROTOCOL_VERSION,
    frameId: raw.frameId,
    channelId: raw.channelId,
    sender: raw.sender,
    issuedAt: raw.issuedAt as number,
    expiresAt: raw.expiresAt as number,
    ciphertext: raw.ciphertext,
  }
}
