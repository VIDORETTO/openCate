import { ipcRenderer } from 'electron'
import type { ElectronAPI } from '../shared/electron-api'

// Shared factory for subscription methods exposed by the preload bridge.
// Electron's event object stays inside the bridge; renderer callbacks receive
// only the payload documented by the ElectronAPI contract.
export function createIpcListener<Args extends unknown[]>(
  channel: string,
  callback: (...args: Args) => void,
): () => void {
  const listener = (_event: Electron.IpcRendererEvent, ...args: Args): void => {
    callback(...args)
  }
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

// Shared factory for pure pass-through invoke methods. The type parameter pins
// each forwarder to its ElectronAPI method signature; argument-transforming
// methods remain hand-written in the aggregate preload object.
export function makeInvoker<K extends keyof ElectronAPI>(channel: string): ElectronAPI[K] {
  return ((...args: unknown[]) => ipcRenderer.invoke(channel, ...args)) as ElectronAPI[K]
}
