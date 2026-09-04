import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import type { CompanionDeviceInfo, CompanionPairingStart } from '../../shared/companionPairing'
import { useAppStore } from '../stores/appStore'
import { SearchableBlock, SecondaryButton, SettingRow, Toggle } from './SettingsComponents'

export function CompanionSettings() {
  const workspaceId = useAppStore((state) => state.selectedWorkspaceId)
  const [allowApprove, setAllowApprove] = useState(false)
  const [pairing, setPairing] = useState<CompanionPairingStart | null>(null)
  const [qrSvg, setQrSvg] = useState('')
  const [proof, setProof] = useState('')
  const [devices, setDevices] = useState<CompanionDeviceInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const refreshDevices = async () => {
    try {
      setDevices(await window.electronAPI.companionDevicesList())
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  useEffect(() => {
    void refreshDevices()
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!pairing) {
      setQrSvg('')
      return
    }
    void QRCode.toString(pairing.pairingUri, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 220,
    }).then((svg) => {
      if (!cancelled) setQrSvg(svg)
    }).catch((cause) => {
      if (!cancelled) setError(errorMessage(cause))
    })
    return () => { cancelled = true }
  }, [pairing])

  const beginPairing = async () => {
    if (!workspaceId) {
      setError('Open a workspace before starting companion pairing.')
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      setPairing(await window.electronAPI.companionPairingBegin({ workspaceId, allowApprove }))
      setProof('')
      setNotice('Scan the QR on the companion, then paste its pairing proof below.')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const completePairing = async () => {
    if (!proof.trim()) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const device = await window.electronAPI.companionPairingComplete(proof.trim())
      if (!device) {
        setError('Pairing proof was rejected or has expired.')
        return
      }
      setPairing(null)
      setProof('')
      setNotice(`Paired ${device.label}. The companion can now use its granted capabilities.`)
      await refreshDevices()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (deviceId: string) => {
    setBusy(true)
    setError(null)
    try {
      await window.electronAPI.companionDeviceRevoke(deviceId)
      await refreshDevices()
      setNotice('Companion access revoked.')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const copy = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setNotice(message)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <SearchableBlock keywords="companion mobile web pairing qr relay device revoke approval">
        <p className="text-xs text-muted pb-2">
          Pair a web or mobile companion with this workspace. The local relay starts only while openCate is running;
          session bearers and private host keys never leave the main process.
        </p>
      </SearchableBlock>

      <SettingRow
        label="Allow approved actions"
        description="Enable host-minted one-shot approvals for coding-agent and task updates. Read-only is the default."
      >
        <Toggle checked={allowApprove} onChange={setAllowApprove} />
      </SettingRow>
      <SettingRow
        label="Pair this workspace"
        description={workspaceId ? 'The invitation is scoped to the currently selected workspace.' : 'Open a workspace first.'}
      >
        <SecondaryButton onClick={() => void beginPairing()} disabled={busy || !workspaceId}>
          {busy ? 'Starting…' : 'Show QR'}
        </SecondaryButton>
      </SettingRow>

      {pairing && (
        <SearchableBlock keywords="qr invitation pairing code proof">
          <div className="mt-3 rounded-lg border border-subtle bg-surface-2 p-3 flex flex-col gap-3">
            <div className="flex flex-wrap gap-4 items-start">
              {qrSvg && (
                <div
                  className="rounded bg-white p-2 w-[236px] h-[236px] flex items-center justify-center"
                  aria-label="Companion pairing QR code"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              )}
              <div className="min-w-[220px] flex-1 flex flex-col gap-2">
                <span className="text-xs text-muted">Pairing code (display once)</span>
                <span className="text-2xl font-mono tracking-[0.35em] text-primary">{pairing.code}</span>
                <span className="text-xs text-muted">
                  The QR does not contain this code or the desktop session bearer. The companion returns a proof after scanning.
                </span>
                <SecondaryButton onClick={() => void copy(pairing.pairingUri, 'Invitation copied.')}>Copy invitation</SecondaryButton>
              </div>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Pairing proof from companion
              <textarea
                value={proof}
                onChange={(event) => setProof(event.target.value)}
                rows={4}
                placeholder="Paste the JSON proof returned by the companion"
                className="w-full bg-surface-5 border border-subtle rounded-md px-2 py-1.5 text-xs font-mono text-primary placeholder:text-muted focus:border-focus-blue focus:outline-none"
              />
            </label>
            <div className="flex justify-end gap-2">
              <SecondaryButton onClick={() => { setPairing(null); setProof(''); setNotice(null) }}>
                Cancel
              </SecondaryButton>
              <SecondaryButton onClick={() => void completePairing()} disabled={busy || !proof.trim()}>
                Complete pairing
              </SecondaryButton>
            </div>
          </div>
        </SearchableBlock>
      )}

      {notice && <p className="text-xs text-green-400 py-2" role="status">{notice}</p>}
      {error && <p className="text-xs text-red-400 py-2" role="alert">{error}</p>}

      <SearchableBlock keywords="paired devices revoke access">
        <div className="pt-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-secondary">Paired devices</span>
            <SecondaryButton onClick={() => void refreshDevices()} disabled={busy}>Refresh</SecondaryButton>
          </div>
          {devices.length === 0 && <span className="text-xs text-muted py-2">No active companion devices.</span>}
          {devices.map((device) => (
            <div key={device.deviceId} className="flex items-center justify-between gap-3 py-2 border-b border-subtle">
              <div className="min-w-0 flex flex-col">
                <span className="text-sm text-primary truncate">{device.label}</span>
                <span className="text-xs text-muted">
                  {device.capabilities.length > 1 ? 'Read + approved actions' : 'Read-only'} · expires {formatDate(device.expiresAt)}
                </span>
              </div>
              <SecondaryButton onClick={() => void revoke(device.deviceId)} disabled={busy}>Revoke</SecondaryButton>
            </div>
          ))}
        </div>
      </SearchableBlock>
    </div>
  )
}

function formatDate(value: number): string {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return 'unknown'
  }
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Companion operation failed.'
}
