import type { RemoteConnectSpec, RuntimeConnection } from './types'

/** A connection that needs an out-of-process runtime (SSH server or WSL). */
export type RemoteRuntimeConnection = Exclude<RuntimeConnection, { kind: 'local' }>

/** Canonical interpretation of absent/local connection records. */
export function isRemoteRuntimeConnection(
  connection: RuntimeConnection | null | undefined,
): connection is RemoteRuntimeConnection {
  return connection != null && connection.kind !== 'local'
}

/** Runtime-absolute workspace path, independent of the transport kind. */
export function runtimeConnectionPath(connection: RemoteRuntimeConnection): string {
  if (connection.kind === 'server') return connection.remotePath
  if (connection.kind === 'wsl') return connection.distroPath
  return connection.containerPath
}

/** Human-readable endpoint identity used for workspace names and status UI. */
export function runtimeConnectionLabel(
  connection: RemoteRuntimeConnection | RemoteConnectSpec,
): string {
  if (connection.kind === 'server') return `${connection.user ? `${connection.user}@` : ''}${connection.host}`
  if (connection.kind === 'wsl') return connection.distro
  return `${connection.engine ?? 'docker'}:${connection.image}`
}

/** Persistable, secret-free connection record for a newly registered runtime. */
export function runtimeConnectionFromSpec(
  runtimeId: string,
  spec: RemoteConnectSpec,
): RemoteRuntimeConnection {
  if (spec.kind === 'server') {
    return {
      kind: 'server',
      runtimeId,
      host: spec.host,
      user: spec.user,
      port: spec.port,
      remotePath: spec.remotePath,
    }
  }
  if (spec.kind === 'wsl') {
    return {
      kind: 'wsl',
      runtimeId,
      distro: spec.distro,
      distroPath: spec.distroPath,
    }
  }
  return {
    kind: 'container',
    runtimeId,
    engine: spec.engine ?? 'docker',
    image: spec.image,
    hostPath: spec.hostPath,
    containerPath: spec.containerPath,
    workspaceReadOnly: spec.workspaceReadOnly === true,
    networkMode: spec.networkMode ?? 'none',
  }
}

/** Transport input reconstructed from persisted connection data. Secrets stay
 *  outside this adapter and are re-attached by the main-process secret store. */
export function remoteConnectSpecFromConnection(
  connection: RemoteRuntimeConnection,
): RemoteConnectSpec {
  if (connection.kind === 'server') {
    return {
      kind: 'server',
      host: connection.host,
      user: connection.user,
      port: connection.port,
      remotePath: connection.remotePath,
    }
  }
  if (connection.kind === 'wsl') {
    return {
      kind: 'wsl',
      distro: connection.distro,
      distroPath: connection.distroPath,
    }
  }
  return {
    kind: 'container',
    engine: connection.engine,
    image: connection.image,
    hostPath: connection.hostPath,
    containerPath: connection.containerPath,
    workspaceReadOnly: connection.workspaceReadOnly,
    networkMode: connection.networkMode,
  }
}
