import React from 'react'
import { MagnifyingGlass, X } from '@phosphor-icons/react'
import { agentSessionKey, type AgentSessionSummary, type AgentTranscriptMessage } from '../../shared/agentSessions'

function formatDate(value: number): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function sessionLabel(session: AgentSessionSummary): string {
  return session.title || `${session.agentId} · ${session.sessionId.slice(0, 12)}`
}

function TranscriptMessage({ message }: { message: AgentTranscriptMessage }) {
  return (
    <div className="rounded-lg border border-subtle bg-surface-1/60 px-2.5 py-2" data-agent-session-message>
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-muted">
        <span>{message.role}{message.toolName ? ` · ${message.toolName}` : ''}</span>
        {message.createdAt ? <span>{formatDate(message.createdAt)}</span> : null}
      </div>
      <div className="whitespace-pre-wrap break-words text-[11px] text-primary">{message.text}</div>
    </div>
  )
}

export const AgentSessionHistoryPopover: React.FC<{
  rootPath: string
  onClose: () => void
}> = ({ rootPath, onClose }) => {
  const [query, setQuery] = React.useState('')
  const [sessions, setSessions] = React.useState<AgentSessionSummary[]>([])
  const [selected, setSelected] = React.useState<AgentSessionSummary | null>(null)
  const [messages, setMessages] = React.useState<AgentTranscriptMessage[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void window.electronAPI.agentSessionHistoryList(rootPath, query)
      .then((next) => {
        if (!cancelled) setSessions(next)
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível carregar o histórico.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [query, rootPath])

  const selectSession = React.useCallback(async (session: AgentSessionSummary) => {
    setSelected(session)
    setMessages([])
    setError(null)
    if (!session.transcriptPath) return
    setLoading(true)
    try {
      setMessages(await window.electronAPI.agentSessionHistoryLoad(rootPath, session))
    } catch {
      setError('Não foi possível reproduzir este transcript.')
    } finally {
      setLoading(false)
    }
  }, [rootPath])

  return (
    <div
      className="absolute left-0 top-full z-30 mt-1 flex w-[min(720px,calc(100vw-24px))] flex-col overflow-hidden rounded-xl border border-subtle bg-surface-0 shadow-2xl"
      data-agent-session-history
      role="dialog"
      aria-label="Histórico de sessões de agentes"
    >
      <div className="flex items-center gap-2 border-b border-subtle px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-primary">Histórico de sessões</div>
          <div className="text-[10px] text-muted">Replay read-only; o resume continua sendo uma ação separada.</div>
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-hover hover:text-primary" title="Fechar histórico">
          <X size={14} />
        </button>
      </div>
      <div className="flex items-center gap-2 border-b border-subtle px-3 py-2">
        <MagnifyingGlass size={13} className="text-muted" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por título, agente, modelo, caminho ou conteúdo"
          className="min-w-0 flex-1 bg-transparent text-[11px] text-primary outline-none placeholder:text-muted"
          data-agent-session-search
        />
      </div>
      <div className="grid min-h-[260px] grid-cols-[minmax(190px,0.36fr)_minmax(0,0.64fr)]">
        <div className="max-h-[420px] overflow-y-auto border-r border-subtle p-1.5">
          {loading && sessions.length === 0 ? <div className="px-2 py-3 text-[11px] text-muted">Carregando…</div> : null}
          {!loading && sessions.length === 0 ? <div className="px-2 py-3 text-[11px] text-muted">Nenhuma sessão observada neste workspace.</div> : null}
          {sessions.map((session) => {
            const active = selected ? agentSessionKey(selected) === agentSessionKey(session) : false
            return (
              <button
                key={agentSessionKey(session)}
                type="button"
                onClick={() => { void selectSession(session) }}
                className={`mb-0.5 w-full rounded-lg px-2 py-1.5 text-left ${active ? 'bg-surface-2' : 'hover:bg-hover'}`}
                data-agent-session-item
              >
                <div className="truncate text-[11px] text-primary">{sessionLabel(session)}</div>
                <div className="mt-0.5 truncate text-[10px] text-muted">
                  {session.agentId} · {formatDate(session.updatedAt)}
                </div>
                <div className="truncate text-[10px] text-muted/70">{session.cwd || 'cwd indisponível'}</div>
              </button>
            )
          })}
        </div>
        <div className="max-h-[420px] overflow-y-auto p-2.5">
          {!selected ? <div className="py-8 text-center text-[11px] text-muted">Selecione uma sessão para reproduzir o transcript.</div> : null}
          {selected ? (
            <>
              <div className="mb-2 border-b border-subtle pb-2">
                <div className="text-[12px] text-primary">{sessionLabel(selected)}</div>
                <div className="mt-0.5 text-[10px] text-muted">
                  {selected.resumable ? 'Resume disponível no CLI' : 'Resume não disponível'} · {selected.source === 'native-transcript' ? 'transcript nativo' : 'somente metadados'}
                </div>
              </div>
              {!selected.transcriptPath ? <div className="py-6 text-center text-[11px] text-muted">Este CLI não forneceu um transcript legível.</div> : null}
              {selected.transcriptPath && !loading && messages.length === 0 ? <div className="py-6 text-center text-[11px] text-muted">Transcript vazio, removido ou ainda não legível.</div> : null}
              <div className="space-y-1.5">
                {messages.map((message) => <TranscriptMessage key={message.id} message={message} />)}
              </div>
            </>
          ) : null}
          {error ? <div className="mt-2 rounded bg-danger/10 px-2 py-1.5 text-[11px] text-danger">{error}</div> : null}
        </div>
      </div>
    </div>
  )
}
