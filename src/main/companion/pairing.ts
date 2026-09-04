import { createHash, randomInt, randomUUID, timingSafeEqual } from 'crypto'
import {
  createCompanionIdentity,
  deriveCompanionKey,
  type CompanionIdentity,
} from '../../shared/companionCrypto'
import type {
  CompanionActionMethod,
} from '../../shared/companionProtocol'
import {
  encodeCompanionPairingUri,
  type CompanionDeviceInfo,
  type CompanionPairingStart,
} from '../../shared/companionPairing'

export type { CompanionDeviceInfo, CompanionPairingStart } from '../../shared/companionPairing'
import {
  CompanionRelayResponder,
  type CompanionRelayResponderOptions,
} from './relayResponder'
import {
  CompanionGateway,
  type CompanionSessionTicket,
} from './companionGateway'

const PAIRING_TTL_MS = 5 * 60_000
const MAX_PENDING_PAIRINGS = 64
const MAX_PAIRING_ATTEMPTS = 5
const PAIRING_CODE_LENGTH = 6

export interface CompanionRelayPairingConfig {
  relayUrl: string
  channelId: string
  relayToken: string
  expiresAt: number
}

export interface BeginCompanionPairingInput {
  workspaceId: string
  relay: CompanionRelayPairingConfig
  allowApprove?: boolean
}

interface PendingPairing {
  pairingId: string
  codeDigest: Buffer
  attempts: number
  hostIdentity: CompanionIdentity
  session: CompanionSessionTicket
  relay: CompanionRelayPairingConfig
  workspaceId: string
  createdAt: number
  expiresAt: number
}

interface PairedDevice extends CompanionDeviceInfo {
  sessionToken: string
  relay: CompanionRelayPairingConfig
  key: CryptoKey
}

/**
 * Host-side one-time pairing and device lifecycle.
 *
 * Pending pairings and derived keys intentionally live only in memory. A
 * desktop restart invalidates all companion sessions and requires a fresh
 * pairing instead of silently resurrecting a bearer or private key.
 */
export class CompanionPairingManager {
  private readonly pending = new Map<string, PendingPairing>()
  private readonly devices = new Map<string, PairedDevice>()

  constructor(private readonly gateway: CompanionGateway) {}

  async begin(
    input: BeginCompanionPairingInput,
    now = Date.now(),
  ): Promise<CompanionPairingStart> {
    validateRelayConfig(input.relay, now)
    if (!input.workspaceId || input.workspaceId.length > 128) throw new Error('invalid companion workspace')
    this.prune(now)
    while (this.pending.size >= MAX_PENDING_PAIRINGS) {
      const oldest = this.pending.keys().next().value
      if (typeof oldest !== 'string') break
      this.discardPending(oldest)
    }
    const hostIdentity = await createCompanionIdentity()
    const session = this.gateway.issueSession(input.workspaceId, input.allowApprove ?? false, now)
    const pairingId = randomUUID()
    const expiresAt = Math.min(now + PAIRING_TTL_MS, session.expiresAt, input.relay.expiresAt)
    const code = String(randomInt(0, 1_000_000)).padStart(PAIRING_CODE_LENGTH, '0')
    const pending: PendingPairing = {
      pairingId,
      codeDigest: digest(code),
      attempts: 0,
      hostIdentity,
      session,
      relay: { ...input.relay },
      workspaceId: input.workspaceId,
      createdAt: now,
      expiresAt,
    }
    this.pending.set(pairingId, pending)
    const invitation = {
        version: 1,
        pairingId,
        workspaceId: input.workspaceId,
        relayUrl: input.relay.relayUrl,
        channelId: input.relay.channelId,
        relayToken: input.relay.relayToken,
        sessionId: session.sessionId,
        hostPublicKey: hostIdentity.publicKey,
        expiresAt,
      } as const
    return {
      invitation,
      code,
      pairingUri: encodeCompanionPairingUri(invitation, now),
    }
  }

  async complete(
    pairingId: string,
    code: string,
    companionPublicKey: string,
    label = 'Companion',
    now = Date.now(),
  ): Promise<CompanionDeviceInfo | null> {
    const pending = this.pending.get(pairingId)
    if (!pending || pending.expiresAt <= now) {
      if (pending) this.discardPending(pairingId)
      return null
    }
    if (!isPairingCode(code) || !matches(pending.codeDigest, digest(code))) {
      pending.attempts += 1
      if (pending.attempts >= MAX_PAIRING_ATTEMPTS) this.discardPending(pairingId)
      return null
    }
    if (typeof companionPublicKey !== 'string' || companionPublicKey.length === 0 || companionPublicKey.length > 4096) {
      this.discardPending(pairingId)
      return null
    }
    const key = await deriveCompanionKey(pending.hostIdentity, companionPublicKey, pending.pairingId).catch(() => null)
    if (!key) {
      this.discardPending(pairingId)
      return null
    }
    const device: PairedDevice = {
      deviceId: randomUUID(),
      label: normalizeLabel(label),
      workspaceId: pending.workspaceId,
      sessionId: pending.session.sessionId,
      capabilities: pending.session.capabilities,
      companionPublicKey,
      createdAt: now,
      expiresAt: pending.session.expiresAt,
      sessionToken: pending.session.token,
      relay: pending.relay,
      key,
    }
    this.pending.delete(pairingId)
    this.devices.set(device.deviceId, device)
    return publicDevice(device)
  }

  getResponder(
    deviceId: string,
    options: Pick<CompanionRelayResponderOptions, 'fetch' | 'pollIntervalMs' | 'now'> = {},
    now = Date.now(),
  ): CompanionRelayResponder | null {
    const device = this.activeDevice(deviceId, now)
    if (!device) return null
    return new CompanionRelayResponder({
      connection: device.relay,
      sessionId: device.sessionId,
      sessionToken: device.sessionToken,
      key: device.key,
      gateway: this.gateway,
      ...options,
    })
  }

  grantApproval(
    deviceId: string,
    method: CompanionActionMethod,
    args: unknown,
    now = Date.now(),
  ): string {
    const device = this.activeDevice(deviceId, now)
    if (!device) throw new Error('companion device unavailable')
    return this.gateway.grantApproval(device.sessionId, method, args, now)
  }

  revokeDevice(deviceId: string): void {
    const device = this.devices.get(deviceId)
    if (!device) return
    this.gateway.revokeSession(device.sessionId)
    this.devices.delete(deviceId)
  }

  revokeWorkspace(workspaceId: string): void {
    for (const device of this.devices.values()) {
      if (device.workspaceId === workspaceId) this.revokeDevice(device.deviceId)
    }
    for (const [pairingId, pending] of this.pending) {
      if (pending.workspaceId === workspaceId) this.discardPending(pairingId)
    }
  }

  listDevices(now = Date.now()): CompanionDeviceInfo[] {
    this.prune(now)
    return [...this.devices.values()].map(publicDevice)
  }

  private activeDevice(deviceId: string, now: number): PairedDevice | null {
    const device = this.devices.get(deviceId)
    if (!device || device.expiresAt <= now) {
      if (device) this.revokeDevice(deviceId)
      return null
    }
    return device
  }

  private discardPending(pairingId: string): void {
    const pending = this.pending.get(pairingId)
    if (!pending) return
    this.gateway.revokeSession(pending.session.sessionId)
    this.pending.delete(pairingId)
  }

  private prune(now: number): void {
    for (const [pairingId, pending] of this.pending) {
      if (pending.expiresAt <= now) this.discardPending(pairingId)
    }
    for (const device of this.devices.values()) {
      if (device.expiresAt <= now) this.revokeDevice(device.deviceId)
    }
  }
}

function publicDevice(device: PairedDevice): CompanionDeviceInfo {
  return {
    deviceId: device.deviceId,
    label: device.label,
    workspaceId: device.workspaceId,
    sessionId: device.sessionId,
    capabilities: device.capabilities,
    companionPublicKey: device.companionPublicKey,
    createdAt: device.createdAt,
    expiresAt: device.expiresAt,
  }
}

function validateRelayConfig(config: CompanionRelayPairingConfig, now: number): void {
  if (!config || typeof config !== 'object') throw new Error('invalid companion relay')
  if (!config.channelId || config.channelId.length > 128) throw new Error('invalid companion relay channel')
  if (!config.relayToken || config.relayToken.length > 256) throw new Error('invalid companion relay token')
  if (typeof config.relayUrl !== 'string' || config.relayUrl.length === 0 || config.relayUrl.length > 2048) {
    throw new Error('invalid companion relay URL')
  }
  if (!Number.isSafeInteger(config.expiresAt) || config.expiresAt <= now) throw new Error('expired companion relay')
  let relay: URL
  try {
    relay = new URL(config.relayUrl)
  } catch {
    throw new Error('invalid companion relay URL')
  }
  if (!['http:', 'https:'].includes(relay.protocol) || relay.username || relay.password || relay.hash) {
    throw new Error('invalid companion relay URL')
  }
  if (relay.protocol !== 'https:' && !isLoopbackHost(relay.hostname)) {
    throw new Error('companion relay URL must use HTTPS')
  }
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]' || hostname === 'localhost'
}

function isPairingCode(value: string): boolean {
  return typeof value === 'string' && /^\d{6}$/u.test(value)
}

function normalizeLabel(value: string): string {
  if (typeof value !== 'string') return 'Companion'
  const trimmed = value.trim().replace(/[\u0000-\u001f\u007f]/gu, '')
  return (trimmed || 'Companion').slice(0, 80)
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

function matches(expected: Buffer, actual: Buffer): boolean {
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
