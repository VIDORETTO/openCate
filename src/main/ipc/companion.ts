import { ipcMain } from 'electron'
import {
  COMPANION_APPROVAL_GRANT,
  COMPANION_DEVICE_REVOKE,
  COMPANION_DEVICES_LIST,
  COMPANION_PAIRING_BEGIN,
  COMPANION_PAIRING_COMPLETE,
} from '../../shared/ipc-channels'
import { isCompanionActionMethod, type CompanionActionMethod } from '../../shared/companionProtocol'
import { MainCompanionController } from '../companion/desktopController'

const MAX_APPROVAL_ARGS_BYTES = 256 * 1024

export interface CompanionPairingBeginRequest {
  workspaceId: string
  allowApprove?: boolean
}

export interface CompanionApprovalGrantRequest {
  deviceId: string
  method: CompanionActionMethod
  args: unknown
}

export function registerHandlers(controller: MainCompanionController): void {
  ipcMain.handle(COMPANION_PAIRING_BEGIN, async (_event, input: unknown) => {
    const request = normalizeBeginRequest(input)
    return controller.beginPairing(request.workspaceId, request.allowApprove)
  })

  ipcMain.handle(COMPANION_PAIRING_COMPLETE, async (_event, input: unknown) => {
    return controller.completePairing(input)
  })

  ipcMain.handle(COMPANION_DEVICES_LIST, () => controller.listDevices())

  ipcMain.handle(COMPANION_DEVICE_REVOKE, (_event, deviceId: unknown) => {
    if (typeof deviceId !== 'string' || deviceId.length === 0 || deviceId.length > 128) {
      throw new Error('invalid companion device')
    }
    controller.revokeDevice(deviceId)
  })

  ipcMain.handle(COMPANION_APPROVAL_GRANT, (_event, input: unknown) => {
    const request = normalizeApprovalRequest(input)
    return controller.grantApproval(request.deviceId, request.method, request.args)
  })
}

function normalizeBeginRequest(input: unknown): CompanionPairingBeginRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid companion pairing request')
  const raw = input as Record<string, unknown>
  if (typeof raw.workspaceId !== 'string' || raw.workspaceId.length === 0 || raw.workspaceId.length > 128) {
    throw new Error('invalid companion workspace')
  }
  return { workspaceId: raw.workspaceId, allowApprove: raw.allowApprove === true }
}

function normalizeApprovalRequest(input: unknown): CompanionApprovalGrantRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid companion approval request')
  const raw = input as Record<string, unknown>
  if (typeof raw.deviceId !== 'string' || raw.deviceId.length === 0 || raw.deviceId.length > 128) {
    throw new Error('invalid companion device')
  }
  if (typeof raw.method !== 'string' || !isCompanionActionMethod(raw.method)) {
    throw new Error('invalid companion approval method')
  }
  if (raw.args === undefined) throw new Error('companion approval args are required')
  const encoded = JSON.stringify(raw.args)
  if (encoded === undefined || Buffer.byteLength(encoded, 'utf8') > MAX_APPROVAL_ARGS_BYTES) {
    throw new Error('companion approval args too large')
  }
  return { deviceId: raw.deviceId, method: raw.method, args: raw.args }
}
