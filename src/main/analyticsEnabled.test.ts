// =============================================================================
// Analytics gating — telemetry is opt-in in packaged builds and always OFF in
// dev/test builds. The notice acknowledgement is not consent.
// =============================================================================

import { describe, expect, test, vi, beforeEach } from 'vitest'

const settings: Record<string, unknown> = {}
const netRequest = vi.fn()
const appendLine = vi.fn()
const removeFile = vi.fn()
const electronApp = {
  getVersion: () => '0.0.0-test',
  getLocale: () => 'en',
  isPackaged: false,
  getPath: () => '/tmp',
}

vi.mock('electron', () => ({
  app: electronApp,
  ipcMain: { on: vi.fn(), handle: vi.fn() },
  net: { request: netRequest },
}))
vi.mock('./settingsFile', () => ({ getSetting: (k: string) => settings[k] }))
vi.mock('./appContext', () => ({
  getCommonContext: () => ({
    install_id: 'test', app_version: '0.0.0-test', platform: 'darwin', arch: 'arm64',
    electron_version: '0', node_version: '0', chrome_version: '0', locale: 'en',
    is_packaged: false, os_release: 'test',
  }),
}))
vi.mock('./logger', () => ({ default: { warn: () => {}, info: () => {}, error: () => {}, debug: () => {} } }))
vi.mock('./jsonFileStore', () => ({
  readJsonFile: (_filename: string, fallback: unknown) => fallback,
  writeJsonFile: () => undefined,
  readTextFile: () => null,
  writeTextFile: () => undefined,
  appendLine,
  removeFile,
}))

const { handleTelemetryConsentChanged, sendEvent } = await import('./analytics')

beforeEach(() => {
  netRequest.mockClear()
  appendLine.mockClear()
  removeFile.mockClear()
  for (const k of Object.keys(settings)) delete settings[k]
  electronApp.isPackaged = false
})

describe('analytics gating', () => {
  test('no send in dev builds, regardless of legacy consent settings', async () => {
    const ok = await sendEvent('app_start')
    expect(ok).toBe(false)
    expect(netRequest).not.toHaveBeenCalled()
  })

  test('does not send in packaged builds without explicit opt-in', async () => {
    electronApp.isPackaged = true
    const ok = await sendEvent('app_start')
    expect(ok).toBe(false)
    expect(netRequest).not.toHaveBeenCalled()
  })

  test('sends in packaged builds after explicit opt-in', async () => {
    electronApp.isPackaged = true
    settings.telemetryEnabled = true
    await sendEvent('app_start')
    expect(netRequest).toHaveBeenCalledTimes(1)
  })

  test('explicit opt-out disables sending in packaged builds', async () => {
    electronApp.isPackaged = true
    settings.telemetryEnabled = false
    await sendEvent('app_start')
    expect(netRequest).not.toHaveBeenCalled()
  })

  test('withdrawn consent immediately purges the offline buffer', () => {
    handleTelemetryConsentChanged(false)
    expect(removeFile).toHaveBeenCalledWith('pending-events.jsonl')
  })

  test('does not re-buffer a request that fails after consent is withdrawn', async () => {
    electronApp.isPackaged = true
    settings.telemetryEnabled = true
    const handlers = new Map<string, (...args: any[]) => void>()
    const request = {
      setHeader: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        handlers.set(event, handler)
        return request
      }),
    }
    netRequest.mockReturnValueOnce(request)

    const sending = sendEvent('app_start')
    settings.telemetryEnabled = false
    handleTelemetryConsentChanged(false)
    handlers.get('error')?.(new Error('offline'))

    await expect(sending).resolves.toBe(false)
    expect(appendLine).not.toHaveBeenCalled()
  })
})
