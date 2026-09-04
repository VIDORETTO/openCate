import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import {
  companionFailure,
  companionSuccess,
  isCompanionActionMethod,
  isCompanionReadMethod,
  normalizeCompanionRequest,
  type CompanionActionMethod,
  type CompanionMethod,
  type CompanionRequest,
  type CompanionResponse,
} from '../../shared/companionProtocol'
import type { InvokeScope } from '../extensions/cateApiHandlers'

const SESSION_TTL_MS = 15 * 60_000
const APPROVAL_TTL_MS = 60_000
const MAX_SESSIONS = 256
const MAX_NONCES_PER_SESSION = 512

interface StoredApproval {
  method: CompanionActionMethod
  argsDigest: Buffer
  expiresAt: number
}

interface StoredSession {
  id: string
  workspaceId: string
  tokenDigest: Buffer
  canApprove: boolean
  expiresAt: number
  nonces: Set<string>
  approvals: Map<string, StoredApproval>
}

export interface CompanionSessionTicket {
  sessionId: string
  token: string
  capabilities: readonly ['read'] | readonly ['read', 'approve']
  expiresAt: number
}

export class CompanionSessionStore {
  private readonly sessions = new Map<string, StoredSession>()

  issue(workspaceId: string, allowApprove = false, now = Date.now()): CompanionSessionTicket {
    if (!workspaceId || workspaceId.length > 128) throw new Error('invalid companion workspace')
    this.prune(now)
    while (this.sessions.size >= MAX_SESSIONS) {
      const oldest = this.sessions.keys().next().value
      if (typeof oldest !== 'string') break
      this.sessions.delete(oldest)
    }
    const sessionId = randomUUID()
    const token = randomBytes(32).toString('hex')
    const expiresAt = now + SESSION_TTL_MS
    this.sessions.set(sessionId, {
      id: sessionId,
      workspaceId,
      tokenDigest: digest(token),
      canApprove: allowApprove,
      expiresAt,
      nonces: new Set(),
      approvals: new Map(),
    })
    return {
      sessionId,
      token,
      capabilities: allowApprove ? ['read', 'approve'] : ['read'],
      expiresAt,
    }
  }

  revoke(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  grantApproval(sessionId: string, method: CompanionActionMethod, args: unknown, now = Date.now()): string {
    const session = this.sessions.get(sessionId)
    if (!session || !session.canApprove || session.expiresAt <= now) throw new Error('companion approval unavailable')
    const approvalId = randomBytes(24).toString('hex')
    session.approvals.set(approvalId, {
      method,
      argsDigest: digest(canonicalJson(args)),
      expiresAt: Math.min(session.expiresAt, now + APPROVAL_TTL_MS),
    })
    return approvalId
  }

  authorize(
    sessionId: string,
    token: string,
    nonce: string,
    now = Date.now(),
  ): { session: StoredSession } | { error: 'unauthorized' | 'expired' } {
    const session = this.sessions.get(sessionId)
    if (!session) return { error: 'unauthorized' }
    if (session.expiresAt <= now) {
      this.sessions.delete(sessionId)
      return { error: 'expired' }
    }
    const actual = digest(token)
    if (actual.length !== session.tokenDigest.length || !timingSafeEqual(actual, session.tokenDigest)) {
      return { error: 'unauthorized' }
    }
    if (session.nonces.has(nonce)) return { error: 'unauthorized' }
    session.nonces.add(nonce)
    while (session.nonces.size > MAX_NONCES_PER_SESSION) {
      const oldest = session.nonces.values().next().value
      if (typeof oldest !== 'string') break
      session.nonces.delete(oldest)
    }
    return { session }
  }

  consumeApproval(sessionId: string, approvalId: string, method: CompanionActionMethod, args: unknown, now = Date.now()): boolean {
    const session = this.sessions.get(sessionId)
    const approval = session?.approvals.get(approvalId)
    if (!session || !approval || approval.expiresAt <= now || approval.method !== method) return false
    const actualDigest = digest(canonicalJson(args))
    const matches = approval.argsDigest.length === actualDigest.length
      && timingSafeEqual(approval.argsDigest, actualDigest)
    session.approvals.delete(approvalId)
    return matches
  }

  private prune(now: number): void {
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(id)
    }
  }
}

export interface CompanionGatewayDeps {
  forward: InvokeScope['forward']
  dispatch: (scope: InvokeScope, method: CompanionMethod, args: unknown) => Promise<unknown>
}

export class CompanionGateway {
  constructor(
    private readonly deps: CompanionGatewayDeps,
    private readonly sessions = new CompanionSessionStore(),
  ) {}

  issueSession(workspaceId: string, allowApprove = false, now?: number): CompanionSessionTicket {
    return this.sessions.issue(workspaceId, allowApprove, now)
  }

  revokeSession(sessionId: string): void {
    this.sessions.revoke(sessionId)
  }

  grantApproval(sessionId: string, method: CompanionActionMethod, args: unknown, now?: number): string {
    return this.sessions.grantApproval(sessionId, method, args, now)
  }

  async handle(input: unknown, token: string, now = Date.now()): Promise<CompanionResponse> {
    const requestId = requestIdOf(input)
    let request: CompanionRequest
    try {
      request = normalizeCompanionRequest(input, now)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid request'
      return companionFailure(requestId, message.includes('expired') ? 'expired' : 'bad-request', message)
    }

    const authorization = this.sessions.authorize(request.sessionId, token, request.nonce, now)
    if ('error' in authorization) return companionFailure(request.requestId, authorization.error)

    if (request.capability === 'read' && !isCompanionReadMethod(request.method)) {
      return companionFailure(request.requestId, 'read-only')
    }
    if (isCompanionActionMethod(request.method)) {
      if (request.capability !== 'approve' || !request.approvalId) {
        return companionFailure(request.requestId, 'approval-required')
      }
      if (!this.sessions.consumeApproval(request.sessionId, request.approvalId, request.method, request.args, now)) {
        return companionFailure(request.requestId, 'approval-required')
      }
    }

    const scope: InvokeScope = {
      extensionId: 'companion',
      workspaceId: authorization.session.workspaceId,
      panelId: undefined,
      caller: 'companion',
      grantedScopes: isCompanionActionMethod(request.method)
        ? ['workspace.read', 'project.read', 'project.write', 'panel', 'coding-agent']
        : ['workspace.read', 'project.read', 'panel', 'coding-agent'],
      forward: this.deps.forward,
    }
    try {
      const result = await this.deps.dispatch(scope, request.method, request.args)
      return companionSuccess(request.requestId, result)
        ?? companionFailure(request.requestId, 'too-large')
    } catch {
      return companionFailure(request.requestId, 'upstream')
    }
  }
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function requestIdOf(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'unknown'
  const requestId = (input as Record<string, unknown>).requestId
  return typeof requestId === 'string' && requestId.length <= 128 ? requestId : 'unknown'
}
