import { describe, expect, test } from 'vitest'
import type { RemoteConnectSpec, RuntimeConnection } from './types'
import {
  isRemoteRuntimeConnection,
  remoteConnectSpecFromConnection,
  runtimeConnectionFromSpec,
  runtimeConnectionLabel,
  runtimeConnectionPath,
} from './runtimeConnection'

describe('runtimeConnection', () => {
  const serverSpec: RemoteConnectSpec = {
    kind: 'server',
    host: 'example.test',
    user: 'cate',
    port: 2222,
    remotePath: '/srv/project',
    auth: { keyPath: '/secret/key', passphrase: 'secret' },
  }

  test('treats absent and explicit local records as local', () => {
    expect(isRemoteRuntimeConnection(undefined)).toBe(false)
    expect(isRemoteRuntimeConnection({ kind: 'local' })).toBe(false)
  })

  test('round-trips server transport fields without persisting auth', () => {
    const connection = runtimeConnectionFromSpec('srv_1', serverSpec)
    expect(runtimeConnectionPath(connection)).toBe('/srv/project')
    expect(runtimeConnectionLabel(connection)).toBe('cate@example.test')
    expect(remoteConnectSpecFromConnection(connection)).toEqual({
      kind: 'server',
      host: 'example.test',
      user: 'cate',
      port: 2222,
      remotePath: '/srv/project',
    })
  })

  test('adapts WSL records consistently', () => {
    const connection = runtimeConnectionFromSpec('wsl_1', {
      kind: 'wsl',
      distro: 'Ubuntu',
      distroPath: '/home/cate/project',
    })
    expect(isRemoteRuntimeConnection(connection)).toBe(true)
    expect(runtimeConnectionPath(connection)).toBe('/home/cate/project')
    expect(runtimeConnectionLabel(connection)).toBe('Ubuntu')
    expect(remoteConnectSpecFromConnection(connection)).toEqual({
      kind: 'wsl',
      distro: 'Ubuntu',
      distroPath: '/home/cate/project',
    })
  })

  test('round-trips container mount and isolation policy', () => {
    const connection = runtimeConnectionFromSpec('ctr_1', {
      kind: 'container',
      engine: 'docker',
      image: 'ghcr.io/cate/runtime:stable',
      hostPath: 'C:/projects/cate',
      containerPath: '/workspace',
      workspaceReadOnly: true,
      networkMode: 'none',
    })
    expect(runtimeConnectionPath(connection)).toBe('/workspace')
    expect(runtimeConnectionLabel(connection)).toBe('docker:ghcr.io/cate/runtime:stable')
    expect(remoteConnectSpecFromConnection(connection)).toEqual({
      kind: 'container',
      engine: 'docker',
      image: 'ghcr.io/cate/runtime:stable',
      hostPath: 'C:/projects/cate',
      containerPath: '/workspace',
      workspaceReadOnly: true,
      networkMode: 'none',
    })
  })

  test('labels a config-owned user without a leading @', () => {
    expect(runtimeConnectionLabel({
      kind: 'server',
      host: 'corp-bastion',
      user: '',
      remotePath: '/srv/project',
    })).toBe('corp-bastion')
  })

  test('narrows stored connection unions', () => {
    const connection: RuntimeConnection = { kind: 'local' }
    expect(isRemoteRuntimeConnection(connection)).toBe(false)
  })
})
