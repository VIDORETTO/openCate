import { useEffect, useMemo, useState } from 'react'
import {
  CompanionClient,
  createIndexedDbCompanionIdentityStore,
  encodeCompanionPairingProof,
  loadOrCreateCompanionIdentity,
  parseCompanionPairingUri,
  type CompanionClient as CompanionClientType,
  type CompanionPairingInvitation,
} from '../../src/sdk'

const identityStore = createIndexedDbCompanionIdentityStore()

export function App() {
  const [invitationText, setInvitationText] = useState('')
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('My companion')
  const [proof, setProof] = useState('')
  const [client, setClient] = useState<CompanionClientType | null>(null)
  const [invitation, setInvitation] = useState<CompanionPairingInvitation | null>(null)
  const [identityReady, setIdentityReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null)
  const [approvalId, setApprovalId] = useState('')
  const [actionArgs, setActionArgs] = useState('{}')
  const [actionResult, setActionResult] = useState<unknown>(null)

  useEffect(() => {
    let cancelled = false
    void identityStore.load().then((stored) => {
      if (!cancelled) setIdentityReady(Boolean(stored))
    }).catch(() => {
      if (!cancelled) setIdentityReady(false)
    })
    return () => { cancelled = true }
  }, [])

  const expiry = useMemo(() => invitation ? new Date(invitation.expiresAt).toLocaleString() : null, [invitation])

  const preparePairing = async () => {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const nextInvitation = parseCompanionPairingUri(invitationText)
      const identity = await loadOrCreateCompanionIdentity(identityStore)
      const nextClient = await CompanionClient.fromInvitation(nextInvitation, identity)
      const nextProof = CompanionClient.createPairingProof(nextInvitation, identity, code, { label })
      setInvitation(nextInvitation)
      setClient(nextClient)
      setProof(encodeCompanionPairingProof(nextProof))
      setIdentityReady(true)
      setStatus('Proof ready. Paste it into Cate desktop to finish pairing.')
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }

  const refresh = async () => {
    if (!client) return
    setBusy(true)
    setError(null)
    try {
      const version = await client.read('cate.version')
      const workspace = await client.read('cate.workspace.get')
      const panels = await client.read('cate.panel.list')
      setSnapshot({ version, workspace, panels })
      setStatus('Read-only snapshot refreshed.')
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }

  const runApprovedAction = async () => {
    if (!client) return
    setBusy(true)
    setError(null)
    setActionResult(null)
    try {
      const args = JSON.parse(actionArgs) as unknown
      const result = await client.approve('cate.tasks.update', args, approvalId.trim())
      setActionResult(result)
      setStatus('Approved action sent once.')
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }

  const forgetIdentity = async () => {
    setBusy(true)
    try {
      await identityStore.clear()
      setIdentityReady(false)
      setClient(null)
      setInvitation(null)
      setProof('')
      setSnapshot(null)
      setStatus('This browser identity was deleted.')
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">CATE COMPANION</p>
          <h1>Keep an eye on your workspace.</h1>
          <p className="lede">Pair this browser with Cate desktop, read bounded workspace facts, and send only actions that the host approved.</p>
        </div>
        <div className="identity-pill" data-ready={identityReady}>{identityReady ? 'Identity stored locally' : 'No device identity yet'}</div>
      </header>

      <section className="card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">01 · PAIR</p>
            <h2>Scan or paste an invitation</h2>
          </div>
          <span className="badge">E2E encrypted</span>
        </div>
        <label>Invitation URI or JSON
          <textarea value={invitationText} onChange={(event) => setInvitationText(event.target.value)} rows={4} placeholder="cate-companion://pair?invite=…" />
        </label>
        <div className="form-grid">
          <label>Six-digit code
            <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/gu, '').slice(0, 6))} inputMode="numeric" placeholder="000000" />
          </label>
          <label>Device label
            <input value={label} onChange={(event) => setLabel(event.target.value.slice(0, 80))} maxLength={80} />
          </label>
        </div>
        <button onClick={() => void preparePairing()} disabled={busy || !invitationText.trim() || code.length !== 6}>
          {busy ? 'Preparing…' : 'Generate pairing proof'}
        </button>
        {proof && <label>Proof to paste into Cate desktop
          <textarea value={proof} readOnly rows={5} className="mono" />
          <button className="secondary" onClick={() => void navigator.clipboard.writeText(proof)}>Copy proof</button>
        </label>}
        {expiry && <p className="hint">Invitation expires {expiry}. The desktop session token is never placed in this proof.</p>}
      </section>

      <section className="card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">02 · OBSERVE</p>
            <h2>Workspace snapshot</h2>
          </div>
          <button className="secondary" onClick={() => void refresh()} disabled={busy || !client}>Refresh</button>
        </div>
        {!client && <p className="hint">Finish pairing in Cate desktop, then return here to refresh.</p>}
        {snapshot && <pre className="snapshot">{JSON.stringify(snapshot, null, 2)}</pre>}
      </section>

      <section className="card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">03 · ACT</p>
            <h2>Host-approved action</h2>
          </div>
          <span className="badge muted">One-shot approval</span>
        </div>
        <p className="hint">Ask the desktop host to mint an approval for these exact arguments. The approval is consumed once and expires quickly.</p>
        <label>Approval ID
          <input value={approvalId} onChange={(event) => setApprovalId(event.target.value)} className="mono" placeholder="Paste host approval ID" />
        </label>
        <label>Task update arguments (JSON)
          <textarea value={actionArgs} onChange={(event) => setActionArgs(event.target.value)} rows={4} className="mono" />
        </label>
        <button onClick={() => void runApprovedAction()} disabled={busy || !client || !approvalId.trim()}>Send approved task update</button>
        {actionResult !== null && <pre className="snapshot">{JSON.stringify(actionResult, null, 2)}</pre>}
      </section>

      <footer>
        {status && <p className="status" role="status">{status}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="danger" onClick={() => void forgetIdentity()} disabled={busy || !identityReady}>Forget browser identity</button>
      </footer>
    </main>
  )
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Companion operation failed.'
}
