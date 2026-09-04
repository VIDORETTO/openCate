export {
  CateApiClient,
  CateApiError,
  CateApiTransportError,
  createCateApiClient,
  type CateApiClientOptions,
} from './cateClient'
export type {
  CateContextCreateArgs,
  CateContextGetArgs,
  CateContextListArgs,
  CateContextPatch,
  CateContextUpdateArgs,
  CateListResponse,
  CateProject,
  CateResultGetArgs,
  CateResultListArgs,
  CateTaskCreateArgs,
  CateTaskGetArgs,
  CateTaskListArgs,
  CateTaskPatch,
  CateTaskResult,
  CateTaskUpdateArgs,
  CatePublicMethod,
} from '../shared/catePublicApi'

export {
  CompanionClient,
  CompanionClientError,
  CompanionRelayHttpTransport,
  type CompanionClientOptions,
  type CompanionPairingProofOptions,
  type CompanionRelayConnection,
  type CompanionRelayFetchOptions,
  type CompanionRelayPage,
} from './companionClient'
export {
  createIndexedDbCompanionIdentityStore,
  createMemoryCompanionIdentityStore,
  loadOrCreateCompanionIdentity,
  type CompanionIdentityStore,
  type IndexedDbCompanionIdentityStoreOptions,
} from './companionIdentityStore'
export {
  createCompanionIdentity,
  decryptCompanionPayload,
  deriveCompanionKey,
  encryptCompanionPayload,
  importCompanionPrivateKey,
  type CompanionIdentity,
} from '../shared/companionCrypto'
export type {
  CompanionActionMethod,
  CompanionCapability,
  CompanionPairingInvitation,
  CompanionPairingProof,
  CompanionReadMethod,
  CompanionRelayFrame,
  CompanionRequest,
  CompanionResponse,
} from '../shared/companionProtocol'
export {
  encodeCompanionPairingProof,
  encodeCompanionPairingUri,
  normalizeCompanionPairingProof,
  parseCompanionPairingProof,
  parseCompanionPairingUri,
} from '../shared/companionPairing'
export type {
  CompanionDeviceInfo,
  CompanionPairingStart,
} from '../shared/companionPairing'
