import {
  COMPANION_MAX_INVITATION_BYTES,
  COMPANION_PROTOCOL_VERSION,
  normalizeCompanionPairingInvitation,
  type CompanionPairingInvitation,
  type CompanionPairingProof,
} from './companionProtocol'

export interface CompanionPairingStart {
  invitation: CompanionPairingInvitation
  /** Display once beside the QR; never persist or log this value. */
  code: string
  /** `cate-companion://` URI containing the invitation, but not the code. */
  pairingUri: string
}

export interface CompanionDeviceInfo {
  deviceId: string
  label: string
  workspaceId: string
  sessionId: string
  capabilities: readonly ['read'] | readonly ['read', 'approve']
  companionPublicKey: string
  createdAt: number
  expiresAt: number
}

/** Encode the public bootstrap invitation for a QR scanner or clipboard. The
 * desktop session bearer and pairing code are not included; the relay token
 * is channel-scoped and the actual requests remain E2E encrypted. */
export function encodeCompanionPairingUri(invitation: CompanionPairingInvitation, now = Date.now()): string {
  const normalized = normalizeCompanionPairingInvitation(invitation, now)
  return `cate-companion://pair?invite=${encodeURIComponent(JSON.stringify(normalized))}`
}

/** Accept either the QR URI or a pasted invitation JSON object. */
export function parseCompanionPairingUri(input: unknown, now = Date.now()): CompanionPairingInvitation {
  if (typeof input !== 'string' || input.length === 0 || input.length > COMPANION_MAX_INVITATION_BYTES * 2) {
    throw new Error('invalid companion pairing URI')
  }
  const trimmed = input.trim()
  if (trimmed.startsWith('{')) {
    try {
      return normalizeCompanionPairingInvitation(JSON.parse(trimmed), now)
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('companion')) throw error
      throw new Error('invalid companion pairing URI')
    }
  }
  let uri: URL
  try {
    uri = new URL(trimmed)
  } catch {
    throw new Error('invalid companion pairing URI')
  }
  if (uri.protocol !== 'cate-companion:' || uri.hostname !== 'pair' || uri.username || uri.password || uri.hash) {
    throw new Error('invalid companion pairing URI')
  }
  const invite = uri.searchParams.get('invite')
  if (!invite) throw new Error('invalid companion pairing URI')
  try {
    return normalizeCompanionPairingInvitation(JSON.parse(invite), now)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('companion')) throw error
    throw new Error('invalid companion pairing URI')
  }
}

export function normalizeCompanionPairingProof(input: unknown): CompanionPairingProof {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('companion pairing proof must be an object')
  }
  const raw = input as Record<string, unknown>
  if (raw.version !== COMPANION_PROTOCOL_VERSION
    || typeof raw.pairingId !== 'string' || raw.pairingId.length === 0 || raw.pairingId.length > 128
    || typeof raw.code !== 'string' || !/^\d{6}$/u.test(raw.code)
    || typeof raw.companionPublicKey !== 'string' || raw.companionPublicKey.length === 0 || raw.companionPublicKey.length > 4096
    || typeof raw.label !== 'string' || raw.label.length > 80) {
    throw new Error('invalid companion pairing proof')
  }
  return {
    version: COMPANION_PROTOCOL_VERSION,
    pairingId: raw.pairingId,
    code: raw.code,
    companionPublicKey: raw.companionPublicKey,
    label: raw.label,
  }
}

export function encodeCompanionPairingProof(proof: CompanionPairingProof): string {
  return JSON.stringify(normalizeCompanionPairingProof(proof))
}

export function parseCompanionPairingProof(input: unknown): CompanionPairingProof {
  if (typeof input !== 'string' || input.trim().length === 0 || input.length > 16 * 1024) {
    throw new Error('invalid companion pairing proof')
  }
  try {
    return normalizeCompanionPairingProof(JSON.parse(input))
  } catch {
    throw new Error('invalid companion pairing proof')
  }
}
