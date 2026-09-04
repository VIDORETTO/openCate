import {
  normalizeCompanionPairingProof,
  parseCompanionPairingProof,
  type CompanionDeviceInfo,
  type CompanionPairingStart,
} from '../../shared/companionPairing'
import type { CompanionActionMethod, CompanionPairingProof } from '../../shared/companionProtocol'
import {
  createMainCompanionBoundary,
  type MainCompanionBoundary,
} from './mainCompanionGateway'
import { CompanionRelayServer } from './relayServer'
import { CompanionPairingManager } from './pairing'
import type { CompanionRelayResponder } from './relayResponder'

export interface MainCompanionControllerOptions {
  boundary?: MainCompanionBoundary
  relay?: CompanionRelayServer
}

/**
 * Owns the desktop-side companion lifecycle. The relay is loopback-only and
 * starts lazily on the first pairing request; all session bearers and derived
 * keys remain behind this main-process boundary.
 */
export class MainCompanionController {
  readonly pairing: CompanionPairingManager
  private readonly relay: CompanionRelayServer
  private relayAddress: { host: string; port: number } | undefined
  private relayStart: Promise<void> | undefined
  private readonly responders = new Map<string, CompanionRelayResponder>()

  constructor(options: MainCompanionControllerOptions = {}) {
    const boundary = options.boundary ?? createMainCompanionBoundary()
    this.pairing = boundary.pairing
    this.relay = options.relay ?? new CompanionRelayServer()
  }

  async beginPairing(workspaceId: string, allowApprove = false, now = Date.now()): Promise<CompanionPairingStart> {
    if (typeof workspaceId !== 'string' || workspaceId.length === 0 || workspaceId.length > 128) {
      throw new Error('invalid companion workspace')
    }
    await this.ensureRelay()
    const channel = this.relay.openChannel()
    return this.pairing.begin({
      workspaceId,
      allowApprove,
      relay: {
        relayUrl: `http://${this.relayAddress!.host}:${this.relayAddress!.port}`,
        channelId: channel.channelId,
        relayToken: channel.token,
        expiresAt: channel.expiresAt,
      },
    }, now)
  }

  async completePairing(input: unknown, now = Date.now()): Promise<CompanionDeviceInfo | null> {
    const proof = typeof input === 'string' ? parseCompanionPairingProof(input) : normalizeCompanionPairingProof(input)
    const device = await this.pairing.complete(
      proof.pairingId,
      proof.code,
      proof.companionPublicKey,
      proof.label,
      now,
    )
    if (!device) return null
    const responder = this.pairing.getResponder(device.deviceId, {}, now)
    if (!responder) {
      this.pairing.revokeDevice(device.deviceId)
      throw new Error('companion responder unavailable')
    }
    responder.start()
    this.responders.set(device.deviceId, responder)
    return device
  }

  listDevices(now = Date.now()): CompanionDeviceInfo[] {
    return this.pairing.listDevices(now)
  }

  revokeDevice(deviceId: string): void {
    const responder = this.responders.get(deviceId)
    responder?.stop()
    this.responders.delete(deviceId)
    this.pairing.revokeDevice(deviceId)
  }

  grantApproval(
    deviceId: string,
    method: CompanionActionMethod,
    args: unknown,
    now = Date.now(),
  ): string {
    return this.pairing.grantApproval(deviceId, method, args, now)
  }

  async close(): Promise<void> {
    for (const responder of this.responders.values()) responder.stop()
    this.responders.clear()
    await this.relay.close()
    this.relayAddress = undefined
    this.relayStart = undefined
  }

  private async ensureRelay(): Promise<void> {
    if (this.relayAddress) return
    if (!this.relayStart) {
      this.relayStart = this.relay.listen().then((address) => {
        this.relayAddress = address
      }).finally(() => {
        this.relayStart = undefined
      })
    }
    await this.relayStart
  }
}

export type { CompanionPairingProof }
