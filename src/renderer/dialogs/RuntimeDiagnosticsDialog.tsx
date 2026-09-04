import { ClockCounterClockwise, Pulse, WarningCircle } from '@phosphor-icons/react'
import { Modal } from '../ui/Modal'
import type { RuntimePhase, RuntimeTelemetryEvent, RuntimeTransportKind } from '../../shared/types'

interface RuntimeDiagnosticsDialogProps {
  runtimeId: string
  transport: RuntimeTransportKind
  label: string | null
  status: RuntimePhase | 'local'
  error?: string | null
  events: RuntimeTelemetryEvent[]
  onClose: () => void
}

const EVENT_LABELS: Record<RuntimeTelemetryEvent['kind'], string> = {
  'connect-start': 'Connection started',
  'connect-success': 'Connection established',
  'connect-failure': 'Connection failed',
  disconnect: 'Connection dropped',
  'reconnect-scheduled': 'Reconnect scheduled',
  'reconnect-give-up': 'Reconnect limit reached',
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatEventDetails(event: RuntimeTelemetryEvent): string | null {
  const parts: string[] = []
  if (event.attempt != null) parts.push(`attempt ${event.attempt}`)
  if (event.delayMs != null) parts.push(`in ${event.delayMs} ms`)
  if (event.durationMs != null) parts.push(`${event.durationMs} ms`)
  if (event.code != null) parts.push(`code ${event.code}`)
  return parts.length > 0 ? parts.join(' · ') : null
}

export function RuntimeDiagnosticsDialog({
  runtimeId,
  transport,
  label,
  status,
  error,
  events,
  onClose,
}: RuntimeDiagnosticsDialogProps): JSX.Element {
  return (
    <Modal
      title="Runtime diagnostics"
      icon={<Pulse size={18} weight="duotone" />}
      onClose={onClose}
      width={460}
      height="min(620px, 90vh)"
      bodyClassName="min-h-0 flex-1 overflow-auto"
    >
      <div className="flex flex-col gap-5 p-5 text-[12px]">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-muted">Status</dt>
          <dd className="text-primary font-medium capitalize">{status}</dd>
          <dt className="text-muted">Transport</dt>
          <dd className="text-primary">{transport}</dd>
          <dt className="text-muted">Runtime</dt>
          <dd className="text-secondary truncate" title={runtimeId}>{runtimeId}</dd>
          {label && (
            <>
              <dt className="text-muted">Endpoint</dt>
              <dd className="text-secondary truncate">{label}</dd>
            </>
          )}
        </dl>

        {error && (
          <div className="border border-subtle rounded-md px-3 py-2 text-muted whitespace-pre-wrap break-words">
            <div className="flex items-center gap-2 mb-1 text-red-300 font-medium">
              <WarningCircle size={14} weight="fill" />
              Current error
            </div>
            {error}
          </div>
        )}

        <section aria-labelledby="runtime-event-history" className="min-h-0">
          <div id="runtime-event-history" className="flex items-center gap-2 mb-2 text-primary font-medium">
            <ClockCounterClockwise size={15} />
            Recent lifecycle events
          </div>
          {events.length === 0 ? (
            <p className="text-muted">No lifecycle events recorded in this window.</p>
          ) : (
            <ol className="divide-y divide-subtle border-y border-subtle">
              {[...events].reverse().map((event, index) => {
                const details = formatEventDetails(event)
                return (
                  <li key={`${event.timestamp}-${event.kind}-${index}`} className="py-2.5 flex gap-3">
                    <time className="shrink-0 text-muted tabular-nums" dateTime={new Date(event.timestamp).toISOString()}>
                      {formatTime(event.timestamp)}
                    </time>
                    <div className="min-w-0">
                      <div className="text-secondary">{EVENT_LABELS[event.kind]}</div>
                      {details && <div className="text-muted mt-0.5">{details}</div>}
                      {event.message && <div className="text-muted mt-0.5 break-words">{event.message}</div>}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        <p className="text-[11px] leading-relaxed text-muted">
          This history is kept in memory for this window only. Detailed transport
          errors stay in the main-process log and terminal output is never added here.
        </p>
      </div>
    </Modal>
  )
}
