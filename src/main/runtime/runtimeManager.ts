// =============================================================================
// RuntimeManager — registry + connection lifecycle. LOCAL and remote hosts
// come online through the SAME path: `connect(id, transport, opts)` registers a
// DeferredRuntime synchronously (so resolve() works and the window paints
// before the daemon is online) and drives a RuntimeTransport: bootstrap →
// launch → handshake → version-check → wrap in a RemoteRuntime. The LOCAL
// workspace is just `connect(LOCAL, localTransport, { install: true })`, kicked
// off at startup by `ensureLocalRuntime`. The only things that differ between
// local and remote are the `install` flag (local self-installs) and the
// reconnect policy: local always retries its daemon, while remote/WSL retries
// only when the IPC caller supplies a fresh-transport factory.
// `resolve` of an unknown id throws, which surfaces as a normal IPC error.
// =============================================================================

import log from '../logger'
import { LOCAL_RUNTIME_ID, parseLocator, type RuntimeId } from '../../shared/runtimeLocator'
import type { Runtime } from './types'
import { RuntimeRpcClient } from './rpcClient'
import { RemoteRuntime } from './RemoteRuntime'
import { DeferredRuntime } from './DeferredRuntime'
import { LocalSubprocessTransport } from './transports/localTransport'
import type { RuntimeTransport, RuntimeChannel } from './transports/transport'
import { RUNTIME_VERSION } from '../../runtime/version'
import { RUNTIME_PROTOCOL_VERSION } from '../../runtime/protocol'
import type { RuntimePhase, RuntimeTelemetryEvent, RuntimeTransportKind } from '../../shared/types'

export interface RuntimeConnectOptions {
  install?: boolean
  force?: boolean
  /** Keep a live remote/WSL connection reconnectable after a transport drop. */
  autoReconnect?: boolean
  /** Build a fresh transport for each automatic reconnect attempt. */
  reconnectFactory?: () => Promise<RuntimeTransport>
  /** 1-based attempt number used only by the automatic reconnect loop. */
  reconnectAttempt?: number
}

interface Connection {
  transport: RuntimeTransport
  channel: RuntimeChannel
  client: RuntimeRpcClient
  runtime: RemoteRuntime
  autoReconnect: boolean
  reconnectFactory?: () => Promise<RuntimeTransport>
  reconnectAttempt: number
}

interface ReconnectPlan {
  factory: () => Promise<RuntimeTransport>
  transport: RuntimeTransport['kind']
  attempt: number
  timer: ReturnType<typeof setTimeout>
}

export interface LocalRuntimeTransportOptions {
  root: string
  id: string
  exclusions?: string[]
  env?: NodeJS.ProcessEnv
  idleSuspend?: boolean
}

export interface RuntimeManagerOptions {
  /** Test/host seam for exercising the real LOCAL lifecycle with a controlled
   *  tarball and install root. Production uses forLocalHost by default. */
  localTransportFactory?: (options: LocalRuntimeTransportOptions) => RuntimeTransport | null
}

export class RuntimeManager {
  private readonly runtimes = new Map<RuntimeId, Runtime>()
  private readonly connections = new Map<RuntimeId, Connection>()
  /** Dedupe concurrent connects to the same id (mirrors CodingManager.withLock). */
  private readonly connecting = new Map<RuntimeId, Promise<Runtime>>()
  private statusListener: ((id: RuntimeId, state: RuntimePhase, message?: string) => void) | null = null
  private readonly telemetryListeners = new Set<(event: RuntimeTelemetryEvent) => void>()
  /** Fired when a runtime reaches the fully-`connected` step (a live
   *  RemoteRuntime). Used to eagerly provision enabled extensions onto a newly
   *  reachable host. Separate from the single statusListener so it can have many
   *  subscribers without contending with the IPC status broadcast. */
  private readonly connectedListeners = new Set<(id: RuntimeId, runtime: Runtime) => void>()
  /** Fired when a runtime is REMOVED on transport close (a live drop — crash /
   *  network / daemon exit), for both remote and the LOCAL path. Mirrors
   *  connectedListeners so subscribers can release any per-runtime state that
   *  became stale (extension server sessions, reverse endpoints, provisioned
   *  caches) instead of stranding it against a dead handle. */
  private readonly disconnectedListeners = new Set<(id: RuntimeId) => void>()
  /** The opts the LOCAL daemon was launched with, kept so a crash can be
   *  re-provisioned + relaunched identically. Set by ensureLocalRuntime. */
  private localOpts: { root: string; exclusions?: string[]; env?: NodeJS.ProcessEnv; idleSuspend?: boolean } | null = null
  /** Pending LOCAL auto-reconnect timer — guards against stacking reconnects on
   *  a crash loop (one backoff in flight at a time). */
  private localReconnectTimer: ReturnType<typeof setTimeout> | null = null
  /** Consecutive failed LOCAL starts/crashes since the last successful connect.
   *  Drives the reconnect backoff, the force-reextract escalation, and the
   *  give-up cap so a permanently-broken daemon can't tight-loop forever. Reset
   *  to 0 once LOCAL connects. */
  private localRetryCount = 0
  /** Stop auto-retrying LOCAL after this many consecutive failures. A daemon that
   *  can never start (e.g. a corrupt runtime bundle) would otherwise loop forever;
   *  past the cap we leave `unreachable` so the UI's Retry is the way forward. */
  private static readonly LOCAL_MAX_RETRIES = 4
  /** Bound remote reconnect work so an offline host never creates an endless
   *  background loop. A later explicit ensure/retry starts a fresh budget. */
  private static readonly REMOTE_MAX_RETRIES = 5
  private readonly reconnectPlans = new Map<RuntimeId, ReconnectPlan>()
  /** Last status emitted for the LOCAL runtime, so a window that subscribes to
   *  RUNTIME_STATUS after the startup connect already finished can still seed
   *  its loading blocker. Defaults to `connecting` — ensureLocalRuntime runs at
   *  every app launch, so LOCAL is always coming up until proven otherwise. */
  private lastLocalStatus: { phase: RuntimePhase; message?: string } = { phase: 'connecting' }
  private readonly localTransportFactory: NonNullable<RuntimeManagerOptions['localTransportFactory']>

  constructor(options: RuntimeManagerOptions = {}) {
    this.localTransportFactory = options.localTransportFactory
      ?? ((transportOptions) => LocalSubprocessTransport.forLocalHost(transportOptions))
    // The LOCAL workspace runs as the runtime daemon subprocess. It's NOT
    // registered here — `ensureLocalRuntime` (called once at startup) provisions
    // and connects it, so resolve() works only once the daemon is online.
  }

  /**
   * Bring the local workspace online by handing a local-host transport to the same
   * `connect()` every remote host uses, with `install: true` so the bundled tarball
   * self-extracts on first run. Call once at startup before the first local op.
   *
   * connect() registers a DeferredRuntime SYNCHRONOUSLY (so resolve(LOCAL) and
   * the window paint don't wait for the ~10s first-run tarball extraction) and
   * connects the daemon in the BACKGROUND. Early IPC ops queue behind the
   * deferred's `ready`, which resolves to the real RemoteRuntime once connected.
   *
   * This runs at app launch, so it must NEVER throw (that would break the launch);
   * the connect runs fire-and-forget. If no local tarball/target is available, it
   * logs + emits `unreachable` and connects nothing. If the background connect
   * fails, connect() drops the deferred and this emits `unreachable`, so every
   * local op fails with a clear error until fixed.
   */
  ensureLocalRuntime(
    opts: { root: string; exclusions?: string[]; env?: NodeJS.ProcessEnv; idleSuspend?: boolean },
    { force = false }: { force?: boolean } = {},
  ): void {
    // Remember the launch opts so a crash can re-provision + relaunch identically
    // (see the LOCAL auto-reconnect in doConnect's onClose handler).
    this.localOpts = opts
    // LOCAL comes online through the SAME public connect() as every remote/WSL
    // host — connect() registers a DeferredRuntime synchronously (so resolve(
    // LOCAL) and first paint don't wait for the daemon) and dedupes concurrent /
    // in-flight connects. So a live or in-flight LOCAL needs nothing here; the
    // auto-reconnect path deletes the entry before calling, so a present
    // non-deferred entry means LOCAL is already live.
    if (this.connecting.has(LOCAL_RUNTIME_ID)) return
    const existing = this.runtimes.get(LOCAL_RUNTIME_ID)
    if (existing && !(existing instanceof DeferredRuntime)) return
    const hint = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV
      ? ' In dev, build it first: `npm run runtime:tarball`.'
      : ''
    const transport = this.localTransportFactory({
      root: opts.root,
      id: LOCAL_RUNTIME_ID,
      exclusions: opts.exclusions,
      env: opts.env,
      idleSuspend: opts.idleSuspend,
    })
    if (!transport) {
      const msg = `No local runtime tarball/target available for this platform.${hint}`
      log.error('[runtime] %s', msg)
      this.emitStatus(LOCAL_RUNTIME_ID, 'unreachable', msg)
      return
    }

    // install:true — the local daemon self-installs (extracts the bundled tarball)
    // on first run; a remote host installs only on an explicit user action. That
    // flag is the ONLY thing distinguishing this from a remote connect. `force`
    // (set by the retry escalation) re-extracts the bundle, repairing a corrupt /
    // partial install. Fire-and-forget: connect() already registered the deferred
    // synchronously (so the window paints), so we just log the eventual outcome.
    // connect() drops the deferred on failure, so resolve(LOCAL) then fails clearly.
    void this.connect(LOCAL_RUNTIME_ID, transport, { install: true, force })
      .then(() => {
        log.info('[runtime] local workspace running on the daemon tarball')
        this.localRetryCount = 0 // a clean connect resets the retry budget
      })
      .catch((err) => {
        const detail = err instanceof Error ? err.message : String(err)
        log.error('[runtime] local daemon failed to start: %s', detail)
        // doConnect already emitted a step-specific status (unreachable/missing);
        // re-emit unreachable with the local-specific hint for the UI.
        this.emitStatus(LOCAL_RUNTIME_ID, 'unreachable', `Local runtime failed to start: ${detail}${hint}`)
        // A failed START (daemon died before the handshake) never armed the
        // onClose crash-reconnect — that only fires after a successful connect.
        // Schedule the retry here so a transient startup failure (or a corrupt
        // extract, repaired by the forced re-extract) recovers without a manual
        // Retry click. A permanently-broken bundle is bounded by LOCAL_MAX_RETRIES.
        this.scheduleLocalReconnect()
      })
  }

  /**
   * Re-provision + relaunch the LOCAL daemon after a crash OR a failed start,
   * using the opts it was started with. Never stacks (one pending timer at a time;
   * the `connecting` map dedupes the connect once it fires) and emits `connecting`
   * so the UI reflects the in-flight retry. Three guards keep a permanently-broken
   * daemon from tight-looping forever:
   *   - exponential backoff (1s → 8s) scaled by the consecutive-failure count;
   *   - a forced re-extract from the 2nd retry on, to repair a corrupt/partial
   *     install (a genuinely broken bundle still fails, but a truncated extract
   *     recovers);
   *   - a hard cap (LOCAL_MAX_RETRIES); past it we stop and leave the last
   *     `unreachable` status, so the UI's Retry button is the way forward.
   * The retry count resets to 0 on any successful connect (see ensureLocalRuntime).
   */
  private scheduleLocalReconnect(): void {
    if (this.localReconnectTimer) return // a reconnect is already pending
    if (!this.localOpts) return // never came up; nothing to relaunch
    if (this.localRetryCount >= RuntimeManager.LOCAL_MAX_RETRIES) {
      log.error(
        '[runtime] local daemon failed %d consecutive times; stopping auto-retry (use Retry to try again)',
        this.localRetryCount,
      )
      return // leave the prior `unreachable` status in place
    }
    this.localRetryCount++
    // Re-extract from the 2nd attempt on — the first retry assumes a transient
    // failure (don't churn a healthy install), later ones suspect a bad extract.
    const force = this.localRetryCount >= 2
    const delay = Math.min(8000, 500 * 2 ** this.localRetryCount)
    this.emitStatus(
      LOCAL_RUNTIME_ID,
      'connecting',
      `Local runtime restarting (attempt ${this.localRetryCount}/${RuntimeManager.LOCAL_MAX_RETRIES})…`,
    )
    this.localReconnectTimer = setTimeout(() => {
      this.localReconnectTimer = null
      // ensureLocalRuntime short-circuits if LOCAL is already registered, never
      // throws, and re-emits its own status; localOpts is non-null here.
      void this.ensureLocalRuntime(this.localOpts!, { force })
    }, delay)
    if (this.localReconnectTimer.unref) this.localReconnectTimer.unref()
  }

  private clearReconnectPlan(id: RuntimeId): void {
    const plan = this.reconnectPlans.get(id)
    if (!plan) return
    clearTimeout(plan.timer)
    this.reconnectPlans.delete(id)
  }

  /** Schedule a bounded reconnect for a remote/WSL transport. The factory is
   * deliberately called per attempt: SSH and WSL transports own processes and
   * sockets that cannot safely be reused after a channel drop. */
  private scheduleRemoteReconnect(
    id: RuntimeId,
    factory: () => Promise<RuntimeTransport>,
    transport: RuntimeTransport['kind'],
    attempt: number,
  ): void {
    if (id === LOCAL_RUNTIME_ID || this.connections.has(id) || this.connecting.has(id) || this.reconnectPlans.has(id)) return
    if (attempt > RuntimeManager.REMOTE_MAX_RETRIES) {
      this.emitTelemetry(id, transport, 'reconnect-give-up', {
        attempt: RuntimeManager.REMOTE_MAX_RETRIES,
        message: 'Automatic reconnect stopped',
      })
      this.emitStatus(id, 'unreachable', 'Automatic reconnect stopped. Use Retry to reconnect.')
      log.warn('[runtime] automatic reconnect exhausted for %s (%s)', id, transport)
      return
    }

    const delayMs = Math.min(15000, 1000 * 2 ** (attempt - 1))
    this.emitTelemetry(id, transport, 'reconnect-scheduled', {
      attempt,
      delayMs,
      message: 'Automatic reconnect scheduled',
    })
    const timer = setTimeout(() => {
      this.reconnectPlans.delete(id)
      if (this.connections.has(id) || this.connecting.has(id)) return
      this.emitStatus(id, 'connecting', `Reconnecting remote runtime (attempt ${attempt}/${RuntimeManager.REMOTE_MAX_RETRIES})…`)
      let connectStarted = false
      const startedAt = Date.now()
      void factory()
        .then((nextTransport) => {
          connectStarted = true
          return this.connect(id, nextTransport, {
            autoReconnect: true,
            reconnectFactory: factory,
            reconnectAttempt: attempt,
          })
        })
        .catch((err) => {
          // connect() already emitted its own failure telemetry/status. A
          // factory failure happens before a transport exists, so emit only a
          // bounded lifecycle event here and keep the detailed error in log.
          if (!connectStarted) {
            this.emitTelemetry(id, transport, 'connect-failure', {
              attempt,
              durationMs: Date.now() - startedAt,
              message: 'Reconnect transport creation failed',
            })
            this.emitStatus(id, 'unreachable', 'Automatic reconnect could not reach the host.')
          }
          if (this.connections.has(id) || this.connecting.has(id)) return
          if (this.isTerminalReconnectError(err)) {
            this.emitTelemetry(id, transport, 'reconnect-give-up', {
              attempt,
              message: 'Automatic reconnect requires user action',
            })
            return
          }
          log.warn('[runtime] automatic reconnect attempt %d for %s failed: %s', attempt, id, err instanceof Error ? err.message : String(err))
          this.scheduleRemoteReconnect(id, factory, transport, attempt + 1)
        })
    }, delayMs)
    this.reconnectPlans.set(id, { factory, transport, attempt, timer })
    if (timer.unref) timer.unref()
  }

  private isTerminalReconnectError(err: unknown): boolean {
    if (err instanceof RuntimeManager.NotInstalled) return true
    const message = err instanceof Error ? err.message : String(err)
    return /runtime (protocol|version) mismatch/i.test(message)
  }

  /**
   * Re-attempt the LOCAL connect on demand — the renderer's Retry path after the
   * startup connect (or a crash relaunch) failed and left every local op dying
   * with "No runtime registered". Reuses the opts from startup; a live
   * runtime or in-flight connect is reused, never duplicated. Resolves once
   * the connect settles, so the caller can re-run the op that failed.
   */
  async retryLocal(): Promise<{ ok: boolean; error?: string }> {
    if (this.isConnected(LOCAL_RUNTIME_ID)) return { ok: true }
    if (!this.localOpts) return { ok: false, error: 'The local runtime has not been initialised yet.' }
    this.ensureLocalRuntime(this.localOpts)
    // ensureLocalRuntime kicks connect() synchronously, so the attempt (this
    // one's, or an in-flight one it deduped onto) is observable here.
    const inFlight = this.connecting.get(LOCAL_RUNTIME_ID)
    if (!inFlight) {
      // No attempt could even start (no tarball/target for this platform);
      // ensureLocalRuntime already emitted `unreachable` with the reason.
      return { ok: false, error: this.lastLocalStatus.message ?? 'The local runtime is unavailable.' }
    }
    try {
      await inFlight
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Wire a status sink (the IPC layer broadcasts these to the renderer). */
  setStatusListener(fn: (id: RuntimeId, state: RuntimePhase, message?: string) => void): void {
    this.statusListener = fn
  }

  /** Subscribe to bounded runtime lifecycle telemetry. Detailed transport
   * errors remain in the main-process log; this stream is safe to broadcast to
   * renderer windows and diagnostics panels. */
  onTelemetry(cb: (event: RuntimeTelemetryEvent) => void): () => void {
    this.telemetryListeners.add(cb)
    return () => { this.telemetryListeners.delete(cb) }
  }

  /** Subscribe to runtime `connected` events (live RemoteRuntime). Fires for
   *  LOCAL's real connect and every remote/WSL connect. Returns an unsubscribe. */
  onConnected(cb: (id: RuntimeId, runtime: Runtime) => void): () => void {
    this.connectedListeners.add(cb)
    return () => { this.connectedListeners.delete(cb) }
  }

  private emitConnected(id: RuntimeId, runtime: Runtime): void {
    for (const cb of this.connectedListeners) {
      try { cb(id, runtime) } catch { /* a subscriber must not break connect */ }
    }
  }

  /** Subscribe to runtime `disconnected` events (a live transport drop removed
   *  the runtime). Fires exactly once per drop, for LOCAL and remote alike.
   *  Returns an unsubscribe. */
  onDisconnected(cb: (id: RuntimeId) => void): () => void {
    this.disconnectedListeners.add(cb)
    return () => { this.disconnectedListeners.delete(cb) }
  }

  private emitDisconnected(id: RuntimeId): void {
    for (const cb of this.disconnectedListeners) {
      // A subscriber must never throw into the channel close handler (that runs
      // synchronously from the transport). Isolate + log each failure.
      try { cb(id) } catch (err) {
        log.warn('[runtime] onDisconnected subscriber for %s failed: %O', id, err)
      }
    }
  }

  private emitStatus(id: RuntimeId, state: RuntimePhase, message?: string): void {
    if (id === LOCAL_RUNTIME_ID) this.lastLocalStatus = { phase: state, ...(message != null ? { message } : {}) }
    try { this.statusListener?.(id, state, message) } catch { /* listener must not break connect */ }
  }

  private emitTelemetry(
    runtimeId: RuntimeId,
    transport: RuntimeTransportKind,
    kind: RuntimeTelemetryEvent['kind'],
    details: Omit<RuntimeTelemetryEvent, 'runtimeId' | 'transport' | 'kind' | 'timestamp'> = {},
  ): void {
    const event: RuntimeTelemetryEvent = {
      runtimeId,
      transport,
      kind,
      timestamp: Date.now(),
      ...details,
    }
    for (const cb of this.telemetryListeners) {
      try { cb(event) } catch (err) {
        log.warn('[runtime] telemetry subscriber failed: %O', err)
      }
    }
  }

  /** Last status emitted for the LOCAL runtime. Seeds the renderer's startup
   *  loading blocker, since the local connect can finish (or fail) before a
   *  window subscribes to the RUNTIME_STATUS broadcast. */
  localStatus(): { phase: RuntimePhase; message?: string } {
    return this.lastLocalStatus
  }

  /** Resolve a runtime by id. Throws if it isn't registered/connected. */
  resolve(id: RuntimeId): Runtime {
    const runtime = this.runtimes.get(id)
    if (!runtime) {
      throw new Error(`No runtime registered for id "${id}"`)
    }
    return runtime
  }

  has(id: RuntimeId): boolean {
    return this.runtimes.has(id)
  }

  /** True only when a runtime is FULLY connected (a live RemoteRuntime), not
   *  while a connect is still in flight (a DeferredRuntime is registered but the
   *  daemon isn't online yet). Backed by the connections map, which doConnect
   *  populates only at the final `connected` step. */
  isConnected(id: RuntimeId): boolean {
    return this.connections.has(id)
  }

  /** Register (or replace) a runtime. The local runtime cannot be replaced. */
  register(runtime: Runtime): void {
    if (runtime.id === LOCAL_RUNTIME_ID) {
      throw new Error('The local runtime is built in and cannot be replaced')
    }
    this.runtimes.set(runtime.id, runtime)
  }

  /** Remove a registered runtime (no-op for the local runtime). */
  unregister(id: RuntimeId): void {
    if (id === LOCAL_RUNTIME_ID) return
    this.runtimes.delete(id)
  }

  /**
   * TEST SEAM: register a stand-in LOCAL runtime synchronously, without a
   * transport. In production the LOCAL workspace is provisioned by
   * `ensureLocalRuntime` (a daemon subprocess over a transport); unit tests
   * that exercise the fs/git IPC handlers directly use this to register an
   * in-process runtime so `resolve(LOCAL_RUNTIME_ID)` works. Not used by the
   * app at runtime.
   */
  registerLocalForTest(runtime: Runtime): void {
    this.runtimes.set(LOCAL_RUNTIME_ID, runtime)
  }

  /**
   * Establish (or reuse) a connection to a remote/WSL runtime over `transport`.
   * Concurrent calls for the same id share one in-flight connect.
   *
   * `opts.install` controls what happens when the host is reachable but the
   * daemon isn't installed: a plain probe (install=false — reconnect / restore /
   * retry) STOPS at the `missing` phase; only an explicit install (install=true)
   * runs bootstrap. `opts.force` wipes any existing install first (clean
   * reinstall). `opts.autoReconnect` enables a bounded remote/WSL reconnect
   * loop, using `opts.reconnectFactory` to create a new transport per attempt.
   * The phase is driven entirely from here, step by step.
   */
  connect(
    id: RuntimeId,
    transport: RuntimeTransport,
    opts: RuntimeConnectOptions = {},
  ): Promise<Runtime> {
    // A user-triggered ensure/retry takes ownership of the next attempt and
    // cancels a pending automatic timer. Reconnect attempts themselves already
    // removed their timer before calling this method.
    if ((opts.reconnectAttempt ?? 0) < 1) this.clearReconnectPlan(id)
    // Dedupe an in-flight connect FIRST, so concurrent callers share one attempt
    // AND the DeferredRuntime this connect registers below can't short-circuit
    // its own in-flight connect via the existing-entry check.
    const inFlight = this.connecting.get(id)
    if (inFlight) return inFlight
    // A DeferredRuntime is only ever registered for the duration of an in-flight
    // connect (deduped above), so any entry that ISN'T a deferred is a live
    // connection — reused as-is (reconnect / restore / retry).
    const existing = this.runtimes.get(id)
    if (existing && !(existing instanceof DeferredRuntime)) return Promise.resolve(existing)

    // Register a DeferredRuntime SYNCHRONOUSLY so resolve(id) works (and the
    // window can paint) the instant connect() is called — identically for LOCAL
    // and remote. Early ops queue behind `ready`, which settles with the connect
    // outcome below. The returned promise still resolves to the REAL runtime
    // (or rejects), so awaiting callers get connect-completion semantics.
    let resolveReady!: (c: Runtime) => void
    let rejectReady!: (err: unknown) => void
    const ready = new Promise<Runtime>((res, rej) => { resolveReady = res; rejectReady = rej })
    // A bare `ready` must not emit an unhandled-rejection warning when no op was
    // queued before a failed connect (queued ops see the rejection themselves).
    ready.catch(() => {})
    this.runtimes.set(id, new DeferredRuntime(id, ready))

    const startedAt = Date.now()
    const attempt = opts.reconnectAttempt != null && opts.reconnectAttempt > 0 ? opts.reconnectAttempt : undefined
    this.emitTelemetry(id, transport.kind, 'connect-start', {
      ...(attempt != null ? { attempt } : {}),
      message: attempt != null ? 'Automatic reconnect started' : 'Connection started',
    })
    const promise = this.doConnect(id, transport, opts)
      .then((real) => {
        // doConnect already replaced the deferred with the real runtime.
        resolveReady(real)
        this.emitTelemetry(id, transport.kind, 'connect-success', {
          ...(attempt != null ? { attempt } : {}),
          durationMs: Date.now() - startedAt,
          message: 'Connection established',
        })
        return real
      })
      .catch((err) => {
        // doConnect failed before registering the real runtime, so the deferred
        // is still the registered entry. Drop it (guarding identity against a
        // concurrent replace) so resolve(id) fails clearly and a later connect
        // isn't short-circuited by a stale deferred.
        const cur = this.runtimes.get(id)
        if (cur instanceof DeferredRuntime) this.runtimes.delete(id)
        rejectReady(err)
        this.emitTelemetry(id, transport.kind, 'connect-failure', {
          ...(attempt != null ? { attempt } : {}),
          durationMs: Date.now() - startedAt,
          message: attempt != null ? 'Automatic reconnect failed' : 'Connection failed',
        })
        throw err
      })
      .finally(() => {
        this.connecting.delete(id)
      })
    this.connecting.set(id, promise)
    return promise
  }

  /** Raised when a probe (install=false) finds the host reachable but the daemon
   *  not installed. Carries the `missing` phase; the IPC layer treats it as a
   *  non-error outcome (the user installs explicitly). */
  static readonly NotInstalled = class extends Error {
    constructor() { super('Runtime is not installed on the host') }
  }

  /** launch → attach reader → await hello. Caller checks versions. Captures
   *  daemon stderr and a pre-handshake exit so failures carry a real reason
   *  (not just a 10s timeout). The install-state probe and bootstrap run
   *  separately in doConnect so each step maps to its own phase. */
  private async launchAndHandshake(
    transport: RuntimeTransport,
  ): Promise<{ channel: RuntimeChannel; client: RuntimeRpcClient; hello: Awaited<RuntimeRpcClient['ready']> }> {
    const channel = await transport.launch()
    const client = new RuntimeRpcClient((line) => channel.write(line))
    channel.onData((chunk) => client.handleChunk(chunk))

    let stderr = ''
    channel.onStderr?.((chunk) => {
      stderr += typeof chunk === 'string' ? chunk : chunk.toString('utf-8')
      if (stderr.length > 8192) stderr = stderr.slice(-8192)
    })
    // If the daemon dies before the handshake (node missing, node-pty missing,
    // crash), reject immediately instead of waiting out the hello timeout.
    channel.onClose(({ code }) => client.dispose(`runtime process exited (code ${code ?? 'unknown'})`))

    try {
      const hello = await client.ready
      return { channel, client, hello }
    } catch (err) {
      const base = err instanceof Error ? err.message : String(err)
      const detail = stderr.trim() ? `. Daemon output: ${stderr.trim().slice(-600)}` : ''
      throw new Error(`${base}${detail}`)
    }
  }

  /**
   * The probe pipeline. Each step maps a failure to a canonical phase, so the
   * renderer never has to guess which state we're in — the first failing step
   * IS the state:
   *   1. reach host + check install   → fail = `unreachable`
   *   2. not installed                → `missing` (probe), or install when asked
   *   3. launch + handshake           → fail = `unreachable`
   *   4. protocol/version sane        → mismatch = `missing` (reinstall needed)
   *   5. all pass                     → `connected`
   */
  private async doConnect(
    id: RuntimeId,
    transport: RuntimeTransport,
    { install = false, force = false, autoReconnect = false, reconnectFactory, reconnectAttempt = 0 }: RuntimeConnectOptions,
  ): Promise<Runtime> {
    // Step 1: reach the host and probe whether the daemon is installed. A
    // transport without isInstalled (local subprocess / in-proc fakes) is
    // treated as always-installed.
    this.emitStatus(id, 'connecting')
    let installed: boolean
    try {
      installed = transport.isInstalled ? await transport.isInstalled(RUNTIME_VERSION) : true
    } catch (err) {
      await transport.dispose().catch(() => {})
      this.emitStatus(id, 'unreachable', err instanceof Error ? err.message : String(err))
      throw err
    }

    // Step 2: install only when explicitly asked. A plain probe stops at
    // `missing` — the user installs from there (delete → missing → Install).
    if (force || !installed) {
      if (!install) {
        await transport.dispose().catch(() => {})
        this.emitStatus(id, 'missing', 'The runtime daemon is not installed on the host.')
        throw new RuntimeManager.NotInstalled()
      }
      this.emitStatus(id, 'installing')
      try {
        await transport.bootstrap(RUNTIME_VERSION, force)
      } catch (err) {
        await transport.dispose().catch(() => {})
        this.emitStatus(id, 'missing', err instanceof Error ? err.message : String(err))
        throw err
      }
      this.emitStatus(id, 'connecting') // installing → back to connecting for launch
    }

    // Step 3: launch + handshake. (Still 'connecting' from step 1 when we didn't
    // install, so no redundant re-emit here.)
    let attempt: Awaited<ReturnType<RuntimeManager['launchAndHandshake']>>
    try {
      attempt = await this.launchAndHandshake(transport)
    } catch (err) {
      await transport.dispose().catch(() => {})
      this.emitStatus(id, 'unreachable', err instanceof Error ? err.message : String(err))
      throw err
    }

    // Step 4: protocol/version sanity. A mismatch means the installed bundle is
    // wrong — surface `missing` so the user reinstalls (no silent auto-upgrade).
    if (
      attempt.hello.protocolVersion !== RUNTIME_PROTOCOL_VERSION ||
      attempt.hello.runtimeVersion !== RUNTIME_VERSION
    ) {
      attempt.client.dispose()
      attempt.channel.kill()
      await transport.dispose().catch(() => {})
      const msg =
        attempt.hello.protocolVersion !== RUNTIME_PROTOCOL_VERSION
          ? `Runtime protocol mismatch (daemon ${attempt.hello.protocolVersion}, client ${RUNTIME_PROTOCOL_VERSION})`
          : `Runtime version mismatch (daemon ${attempt.hello.runtimeVersion}, client ${RUNTIME_VERSION})`
      this.emitStatus(id, 'missing', msg)
      throw new Error(msg)
    }

    // Step 5: connected.
    const { channel, client, hello } = attempt
    const runtime = new RemoteRuntime(id, client)
    const conn: Connection = {
      transport,
      channel,
      client,
      runtime,
      autoReconnect,
      reconnectFactory,
      reconnectAttempt,
    }
    channel.onClose(({ code }) => {
      client.dispose('Runtime connection closed')
      // A *live* drop is the interesting one; an intentional teardown already
      // logged its own reason. Always record the close (with exit/disconnect
      // code) so a reconnect loop is visible in main.log — previously only
      // `connected` was logged, so a flapping connection looked healthy. The
      // `live=` flag tells a reader whether this was the active transport.
      log.info('[runtime] disconnected %s (%s) code=%s live=%s', id, transport.kind, code ?? 'unknown', this.connections.get(id) === conn)
      // Only report a *drop* if this is still the live connection. An
      // intentional teardown (disposeConnection during reinstall/remove)
      // removes it first and drives the phase itself — a late close event from
      // the killed channel must not clobber that back to 'disconnected'.
      if (this.connections.get(id) !== conn) return
      this.connections.delete(id)
      this.runtimes.delete(id)
      // Notify subscribers the runtime is gone (both LOCAL and remote reach
      // here). Fires exactly once per live drop — the intentional-teardown case
      // returned above (disposeConnection removed the connection first). Lets the
      // extension layer release the stranded server sessions / reverse endpoints
      // that were bound to this now-dead runtime handle.
      this.emitDisconnected(id)
      this.emitTelemetry(id, transport.kind, 'disconnect', {
        ...(conn.reconnectAttempt > 0 ? { attempt: conn.reconnectAttempt } : {}),
        code,
        message: 'Transport closed',
      })
      // Release SSH/WSL child processes and ask the factory for a fresh
      // transport on the next attempt. This is intentionally best-effort: the
      // channel has already reported its close and a reconnect must not wait on
      // cleanup of a dead process.
      void transport.dispose().catch(() => {})
      // The LOCAL workspace runs as a daemon subprocess. A remote drop is the
      // user's to reconnect, but a LOCAL crash leaves the whole workspace dead
      // (resolve(LOCAL) throws) until app restart — so auto-reconnect it. The
      // intentional-teardown case already returned above (disposeConnection
      // deletes the connection first), so reaching here for LOCAL means a real
      // crash.
      if (id === LOCAL_RUNTIME_ID) {
        this.scheduleLocalReconnect()
        return
      }
      if (conn.autoReconnect && conn.reconnectFactory) {
        this.emitStatus(id, 'disconnected', 'Connection lost. Retrying automatically.')
        this.scheduleRemoteReconnect(id, conn.reconnectFactory, transport.kind, 1)
        return
      }
      this.emitStatus(id, 'disconnected')
    })
    this.runtimes.set(id, runtime)
    this.connections.set(id, conn)
    log.info('[runtime] connected %s (%s) node=%s', id, transport.kind, hello.node.version)
    this.emitStatus(id, 'connected')
    this.emitConnected(id, runtime)
    return runtime
  }

  /** Ids of currently-connected remote/WSL runtimes. */
  connectedIds(): RuntimeId[] {
    return [...this.connections.keys()]
  }

  /** Ids of every registered runtime (LOCAL deferred/real + any remote/WSL).
   *  Used to fan window-close grant clears out to every host. */
  registeredIds(): RuntimeId[] {
    return [...this.runtimes.keys()]
  }

  /** Re-assert the `connected` phase for an already-registered runtime. Used
   *  by the ensure short-circuit so a renderer that missed the original
   *  broadcast (e.g. a window opened after the connect) still learns it's live —
   *  keeps the phase main-driven instead of having the client assume it. */
  reportConnected(id: RuntimeId): void {
    if (this.runtimes.has(id)) this.emitStatus(id, 'connected')
  }

  /** Emit a phase for an id that has no in-flight connect — used by the IPC layer
   *  when a connect can't even be ATTEMPTED (e.g. the SSH key file is missing or
   *  an unsupported format), so the renderer shows the real reason instead of a
   *  bare "failed to connect". doConnect owns the phase once a connect starts. */
  report(id: RuntimeId, phase: RuntimePhase, message?: string): void {
    this.emitStatus(id, phase, message)
  }

  /** Tear down a remote connection and unregister it. */
  async disposeConnection(id: RuntimeId): Promise<void> {
    this.clearReconnectPlan(id)
    const conn = this.connections.get(id)
    if (!conn) return
    this.connections.delete(id)
    this.runtimes.delete(id)
    conn.client.dispose('Runtime disposed')
    try { conn.channel.kill() } catch { /* ignore */ }
    await conn.transport.dispose().catch(() => {})
  }

  /**
   * Literally delete the runtime: stop any running daemon, then remove its
   * install from the host over a fresh transport (rm -rf ~/.cate/runtime).
   * Drives the phase to `missing` on success so the next state is the clean
   * "needs install" — the user reinstalls from there. Emits `unreachable` if the
   * host can't be reached to remove it. The transport is disposed either way.
   */
  async deleteInstall(id: RuntimeId, transport: RuntimeTransport): Promise<void> {
    await this.disposeConnection(id)
    try {
      if (transport.uninstall) await transport.uninstall()
      this.emitStatus(id, 'missing', 'Runtime deleted. Click Install to set it up again.')
    } catch (err) {
      this.emitStatus(id, 'unreachable', err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      await transport.dispose().catch(() => {})
    }
  }

  /** Tear down every connection (app quit). Cancels any pending LOCAL reconnect
   *  so a quit during a crash backoff doesn't relaunch the daemon. */
  async disposeAll(): Promise<void> {
    if (this.localReconnectTimer) {
      clearTimeout(this.localReconnectTimer)
      this.localReconnectTimer = null
    }
    for (const id of this.reconnectPlans.keys()) this.clearReconnectPlan(id)
    await Promise.all([...this.connections.keys()].map((id) => this.disposeConnection(id)))
  }
}

/** Process-wide singleton used by the IPC handlers. */
export const runtimes = new RuntimeManager()

/**
 * Forward a persistent per-window file grant to the runtime that OWNS the
 * granted path. The main process keeps its own grant maps (for its own path
 * checks), but the owning runtime (the LOCAL daemon, or a remote/WSL one) runs
 * its own authoritative check against its OWN grant map, so a Save-As / restored
 * grant must be mirrored there too. Decodes the locator's host-absolute path and
 * forwards only when the runtime is registered. Best-effort: a rejected RPC
 * never breaks the dialog / restore flow. Mirrors workspaceManager.forwardAllowedRoot.
 */
/**
 * Decode a cwd/path-bearing locator and resolve its target runtime in one hop.
 * Shared by the fs/git IPC routers (filesystem.ts's `fileRuntimeFor`, git.ts's
 * `vcsFor`), which both did the identical parse+resolve before building their
 * host-specific view (`.vcs` vs the whole runtime) on top. Returns the resolved
 * runtime plus the decoded path and the runtime id (needed to re-encode any
 * path handed back to the renderer).
 */
export function resolveLocator(locator: string): { runtime: Runtime; path: string; runtimeId: string } {
  const { runtimeId, path } = parseLocator(locator)
  return { runtime: runtimes.resolve(runtimeId), path, runtimeId }
}

export function forwardFileGrant(rawPath: string, ownerWindowId: number): void {
  const { runtimeId, path } = parseLocator(rawPath)
  if (!path || !runtimes.has(runtimeId)) return
  runtimes.resolve(runtimeId).grantFileAccess(path, ownerWindowId).catch(() => { /* best-effort */ })
}

/** Forward a one-shot scoped write allowance to the owning runtime. See
 *  forwardFileGrant for the rationale; same best-effort, decode-first contract. */
export function forwardScopedWriteAllowance(rawPath: string, ownerWindowId: number): void {
  const { runtimeId, path } = parseLocator(rawPath)
  if (!path || !runtimes.has(runtimeId)) return
  runtimes.resolve(runtimeId).registerScopedWriteAllowance(path, ownerWindowId).catch(() => { /* best-effort */ })
}

/**
 * On window close, drop that window's per-window grants on EVERY registered
 * runtime — additions are forwarded per-runtime (by the path's owner), but a
 * close has only a window id, no locator, so we can't know which runtimes
 * accumulated grants for it. Forwarding to all is cheap and keeps the daemons
 * from leaking stale per-window grants. Best-effort: a rejected RPC never breaks
 * window teardown. Mirrors pathValidation.clearFileGrantsForWindow.
 */
export function forwardClearFileGrantsForWindow(windowId: number): void {
  forwardToAll((c) => c.clearFileGrantsForWindow(windowId))
}

/** Forward a per-window scoped-write-allowance clear to all runtimes. See
 *  forwardClearFileGrantsForWindow for the rationale. Mirrors
 *  pathValidation.clearScopedWriteAllowancesForWindow. */
export function forwardClearScopedWriteAllowancesForWindow(windowId: number): void {
  forwardToAll((c) => c.clearScopedWriteAllowancesForWindow(windowId))
}

/** Run a best-effort RPC against every registered runtime. A single
 *  runtime's rejection is swallowed per-call so it never aborts the others. */
function forwardToAll(fn: (runtime: Runtime) => Promise<unknown>): void {
  for (const id of runtimes.registeredIds()) {
    fn(runtimes.resolve(id)).catch(() => { /* best-effort */ })
  }
}
