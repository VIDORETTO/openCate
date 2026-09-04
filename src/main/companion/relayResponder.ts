import {
  openCompanionRelayFrame,
  sealCompanionRelayFrame,
  type CompanionWireMessage,
} from '../../shared/companionCrypto'
import type { CompanionRequest } from '../../shared/companionProtocol'
import {
  CompanionRelayHttpTransport,
  type CompanionRelayConnection,
} from '../../sdk/companionClient'
import type { CompanionGateway } from './companionGateway'

export interface CompanionRelayResponderOptions {
  connection: CompanionRelayConnection
  sessionId: string
  sessionToken: string
  key: CryptoKey
  gateway: CompanionGateway
  fetch?: typeof fetch
  pollIntervalMs?: number
  now?: () => number
}

/**
 * Bridges one paired relay channel to the authoritative desktop gateway.
 *
 * The responder owns the session bearer and the derived key. A relay frame is
 * accepted only after authenticated decryption, and a decrypted request is
 * still normalized and authorized by CompanionGateway before dispatch.
 */
export class CompanionRelayResponder {
  private readonly transport: CompanionRelayHttpTransport
  private readonly connection: CompanionRelayConnection
  private readonly sessionId: string
  private readonly sessionToken: string
  private readonly key: CryptoKey
  private readonly gateway: CompanionGateway
  private readonly now: () => number
  private readonly pollIntervalMs: number
  private cursor = 0
  private timer: ReturnType<typeof setInterval> | undefined
  private pollInFlight: Promise<void> | undefined

  constructor(options: CompanionRelayResponderOptions) {
    this.connection = options.connection
    this.transport = new CompanionRelayHttpTransport(options.connection, { fetch: options.fetch })
    this.sessionId = options.sessionId
    this.sessionToken = options.sessionToken
    this.key = options.key
    this.gateway = options.gateway
    this.now = options.now ?? (() => Date.now())
    this.pollIntervalMs = boundedInterval(options.pollIntervalMs ?? 100)
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.poll().catch(() => undefined)
    }, this.pollIntervalMs)
    void this.poll().catch(() => undefined)
  }

  async pollOnce(): Promise<void> {
    await this.poll()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  private async poll(): Promise<void> {
    const previous = this.pollInFlight ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(async () => {
      const page = await this.transport.readFrames(this.cursor)
      this.cursor = page.nextCursor
      for (const frame of page.frames) {
        if (frame.sender !== 'companion' || frame.channelId !== this.connection.channelId) continue
        let message: CompanionWireMessage
        try {
          message = await openCompanionRelayFrame(frame, this.key, this.now())
        } catch {
          continue
        }
        if (message.type !== 'request') continue
        if (!belongsToSession(message.request, this.sessionId)) continue
        const request = message.request as CompanionRequest
        const response = await this.gateway.handle(message.request, this.sessionToken, this.now())
        const responseFrame = await sealCompanionRelayFrame({
          channelId: frame.channelId,
          sender: 'desktop',
          key: this.key,
          message: { type: 'response', response },
          issuedAt: this.now(),
          ttlMs: Math.min(2 * 60_000, Math.max(1, request.expiresAt - this.now())),
        })
        await this.transport.postFrame(responseFrame)
      }
    })
    const tracker: { promise?: Promise<void> } = {}
    const clearTrackedPoll = (): void => {
      if (this.pollInFlight === tracker.promise) this.pollInFlight = undefined
    }
    const tracked = current.then(
      clearTrackedPoll,
      () => { clearTrackedPoll() },
    )
    tracker.promise = tracked
    this.pollInFlight = tracked
    return current
  }
}

function belongsToSession(input: unknown, sessionId: string): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false
  return (input as Record<string, unknown>).sessionId === sessionId
}

function boundedInterval(value: number): number {
  if (!Number.isSafeInteger(value) || value < 25 || value > 5_000) {
    throw new Error('invalid companion responder poll interval')
  }
  return value
}
