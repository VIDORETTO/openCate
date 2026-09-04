import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import {
  COMPANION_MAX_RELAY_PAGE_BYTES,
  COMPANION_RELAY_PAGE_LIMIT,
  validateRelayFrame,
  type CompanionRelayFrame,
} from '../../shared/companionProtocol'

const MAX_CHANNELS = 128
const MAX_FRAMES_PER_CHANNEL = 64
const CHANNEL_TTL_MS = 60 * 60_000
const FRAME_TTL_MS = 2 * 60_000
const MAX_BODY_BYTES = 768 * 1024

interface RelayFrameRecord {
  sequence: number
  frame: CompanionRelayFrame
}

interface RelayChannel {
  id: string
  tokenDigest: Buffer
  expiresAt: number
  nextSequence: number
  frames: RelayFrameRecord[]
}

export interface CompanionRelayServerOptions {
  /** Keep the default loopback bind; expose publicly only behind TLS/auth proxy. */
  host?: string
  port?: number
  /** Exact browser origin (or `*` for local development) allowed by CORS. */
  corsOrigin?: string
  now?: () => number
}

export interface RelayChannelTicket {
  channelId: string
  token: string
  expiresAt: number
}

function validateCorsOrigin(value: string): string {
  if (value === '*') return value
  let origin: URL
  try {
    origin = new URL(value)
  } catch {
    throw new Error('Companion relay CORS origin must be * or an absolute HTTP(S) origin')
  }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('Companion relay CORS origin must be * or an absolute HTTP(S) origin')
  }
  return origin.origin
}

export class CompanionRelayServer {
  private readonly server: Server
  private readonly channels = new Map<string, RelayChannel>()
  private readonly host: string
  private readonly port: number
  private readonly corsOrigin: string
  private readonly now: () => number

  constructor(options: CompanionRelayServerOptions = {}) {
    this.host = options.host ?? '127.0.0.1'
    this.port = options.port ?? 0
    this.corsOrigin = validateCorsOrigin(options.corsOrigin ?? '*')
    this.now = options.now ?? (() => Date.now())
    if (this.host !== '127.0.0.1' && this.host !== '::1') {
      throw new Error('Companion relay must bind to loopback or sit behind an authenticated TLS proxy')
    }
    this.server = createServer((req, res) => { void this.handle(req, res) })
  }

  listen(): Promise<{ host: string; port: number }> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error): void => {
        this.server.off('listening', onListening)
        reject(error)
      }
      const onListening = (): void => {
        this.server.off('error', onError)
        const address = this.server.address()
        if (!address || typeof address === 'string') {
          reject(new Error('relay did not expose a TCP address'))
          return
        }
        resolve({ host: this.host, port: address.port })
      }
      this.server.once('error', onError)
      this.server.once('listening', onListening)
      this.server.listen(this.port, this.host)
    })
  }

  async close(): Promise<void> {
    if (!this.server.listening) return
    await new Promise<void>((resolve) => this.server.close(() => resolve()))
  }

  /** Create a channel for an in-process desktop host. The HTTP endpoint uses
   * the same primitive, but exposing this method avoids making the main
   * process round-trip its own bearer token through fetch. */
  openChannel(): RelayChannelTicket {
    this.prune()
    return this.issueChannel()
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.prune()
    this.headers(res)
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    const url = new URL(req.url ?? '/', 'http://relay.local')
    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        this.send(res, 200, { ok: true })
        return
      }
      if (req.method === 'POST' && url.pathname === '/v1/channels') {
        this.send(res, 201, this.issueChannel())
        return
      }
      const match = url.pathname.match(/^\/v1\/channels\/([^/]+)(?:\/frames)?$/)
      if (!match) {
        this.send(res, 404, { error: 'not-found' })
        return
      }
      const channelId = decodeURIComponent(match[1])
      const channel = this.channels.get(channelId)
      if (!channel || channel.expiresAt <= this.now()) {
        this.send(res, 404, { error: 'not-found' })
        return
      }
      if (!this.authorized(req, channel)) {
        this.send(res, 401, { error: 'unauthorized' })
        return
      }
      if (req.method === 'GET' && url.pathname.endsWith('/frames')) {
        this.readFrames(res, channel, url.searchParams.get('after'), url.searchParams.get('limit'))
        return
      }
      if (req.method === 'POST' && url.pathname.endsWith('/frames')) {
        const frame = validateRelayFrame(JSON.parse(await readBody(req)), this.now())
        if (frame.channelId !== channel.id) {
          this.send(res, 400, { error: 'channel-mismatch' })
          return
        }
        if (frame.expiresAt > this.now() + FRAME_TTL_MS) {
          this.send(res, 400, { error: 'frame-window-too-long' })
          return
        }
        channel.frames.push({ sequence: channel.nextSequence++, frame })
        while (channel.frames.length > MAX_FRAMES_PER_CHANNEL) channel.frames.shift()
        this.send(res, 202, { accepted: true })
        return
      }
      if (req.method === 'DELETE' && url.pathname === `/v1/channels/${encodeURIComponent(channel.id)}`) {
        this.channels.delete(channel.id)
        this.send(res, 204, null)
        return
      }
      this.send(res, 405, { error: 'method-not-allowed' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid relay request'
      this.send(res, message.includes('too large') ? 413 : 400, { error: 'bad-request', message: message.slice(0, 200) })
    }
  }

  private issueChannel(): RelayChannelTicket {
    if (this.channels.size >= MAX_CHANNELS) throw new Error('relay channel capacity reached')
    const channelId = randomUUID()
    const token = randomBytes(32).toString('hex')
    const expiresAt = this.now() + CHANNEL_TTL_MS
    this.channels.set(channelId, {
      id: channelId,
      tokenDigest: digest(token),
      expiresAt,
      nextSequence: 1,
      frames: [],
    })
    return { channelId, token, expiresAt }
  }

  private authorized(req: IncomingMessage, channel: RelayChannel): boolean {
    const header = req.headers.authorization
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false
    const received = digest(header.slice('Bearer '.length))
    return received.length === channel.tokenDigest.length && timingSafeEqual(received, channel.tokenDigest)
  }

  private readFrames(
    res: ServerResponse,
    channel: RelayChannel,
    rawAfter: string | null,
    rawLimit: string | null,
  ): void {
    const after = rawAfter == null ? 0 : Number(rawAfter)
    if (!Number.isSafeInteger(after) || after < 0) {
      this.send(res, 400, { error: 'invalid-cursor' })
      return
    }
    const limit = rawLimit == null ? COMPANION_RELAY_PAGE_LIMIT : Number(rawLimit)
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > COMPANION_RELAY_PAGE_LIMIT) {
      this.send(res, 400, { error: 'invalid-limit' })
      return
    }
    const records = channel.frames.filter((record) => record.sequence > after).slice(0, limit)
    const frames = records.map((record) => record.frame)
    const nextCursor = records.length > 0 ? records[records.length - 1].sequence : after
    this.send(res, 200, { frames, nextCursor, expiresAt: channel.expiresAt })
  }

  private headers(res: ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', this.corsOrigin)
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Cache-Control', 'no-store')
  }

  private send(res: ServerResponse, status: number, body: unknown): void {
    if (status === 204) {
      res.writeHead(status)
      res.end()
      return
    }
    const json = JSON.stringify(body)
    if (Buffer.byteLength(json) > COMPANION_MAX_RELAY_PAGE_BYTES) {
      res.writeHead(413)
      res.end()
      return
    }
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) })
    res.end(json)
  }

  private prune(): void {
    const now = this.now()
    for (const [id, channel] of this.channels) {
      if (channel.expiresAt <= now) {
        this.channels.delete(id)
        continue
      }
      channel.frames = channel.frames.filter((record) => record.frame.expiresAt > now)
    }
  }
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let total = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > MAX_BODY_BYTES) {
        reject(new Error('relay body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}
