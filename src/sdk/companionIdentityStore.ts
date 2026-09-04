import {
  createCompanionIdentity,
  importCompanionPrivateKey,
  type CompanionIdentity,
} from '../shared/companionCrypto'

export interface CompanionIdentityStore {
  load(): Promise<CompanionIdentity | null>
  save(identity: CompanionIdentity): Promise<void>
  clear(): Promise<void>
}

export interface IndexedDbCompanionIdentityStoreOptions {
  databaseName?: string
  storeName?: string
  key?: string
}

/**
 * Persist a companion identity in IndexedDB without writing the private JWK
 * to localStorage or a JSON file. The stored private half is a non-extractable
 * Web Crypto key, so callers can use it for ECDH without re-exporting it.
 */
export function createIndexedDbCompanionIdentityStore(
  options: IndexedDbCompanionIdentityStoreOptions = {},
): CompanionIdentityStore {
  const databaseName = boundedName(options.databaseName ?? 'cate-companion', 'database')
  const storeName = boundedName(options.storeName ?? 'identity', 'store')
  const key = boundedName(options.key ?? 'current', 'key')
  return {
    async load() {
      const db = await openDatabase(databaseName, storeName)
      try {
        const value = await request<StoredIdentity | undefined>(
          db.transaction(storeName, 'readonly').objectStore(storeName).get(key),
        )
        if (!value || typeof value.publicKey !== 'string' || !isCryptoKey(value.privateKey)) return null
        return { publicKey: value.publicKey, privateKey: value.privateKey }
      } finally {
        db.close()
      }
    },
    async save(identity) {
      const db = await openDatabase(databaseName, storeName)
      try {
        const privateKey = isCryptoKey(identity.privateKey)
          ? identity.privateKey
          : await importCompanionPrivateKey(identity.privateKey)
        await request(db.transaction(storeName, 'readwrite').objectStore(storeName).put({
          publicKey: identity.publicKey,
          privateKey,
        }, key))
      } finally {
        db.close()
      }
    },
    async clear() {
      const db = await openDatabase(databaseName, storeName)
      try {
        await request(db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key))
      } finally {
        db.close()
      }
    },
  }
}

/** Get the device identity once and retain it across browser restarts. */
export async function loadOrCreateCompanionIdentity(store: CompanionIdentityStore): Promise<CompanionIdentity> {
  const existing = await store.load()
  if (existing) return existing
  const created = await createCompanionIdentity()
  await store.save(created)
  const persisted = await store.load()
  if (!persisted) throw new Error('companion identity could not be persisted')
  return persisted
}

/** Useful for wrappers that provide their own secure keychain adapter in tests
 * or native mobile shells. It intentionally keeps values in memory only. */
export function createMemoryCompanionIdentityStore(): CompanionIdentityStore {
  let current: CompanionIdentity | null = null
  return {
    async load() { return current },
    async save(identity) { current = identity },
    async clear() { current = null },
  }
}

interface StoredIdentity {
  publicKey: string
  privateKey: CryptoKey
}

function boundedName(value: string, label: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/u.test(value)) throw new Error(`invalid companion identity ${label}`)
  return value
}

function isCryptoKey(value: unknown): value is CryptoKey {
  return typeof CryptoKey !== 'undefined' && value instanceof CryptoKey
}

function openDatabase(databaseName: string, storeName: string): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is unavailable')
  return new Promise((resolve, reject) => {
    const openRequest = indexedDB.open(databaseName, 1)
    openRequest.onupgradeneeded = () => {
      if (!openRequest.result.objectStoreNames.contains(storeName)) openRequest.result.createObjectStore(storeName)
    }
    openRequest.onsuccess = () => resolve(openRequest.result)
    openRequest.onerror = () => reject(openRequest.error ?? new Error('unable to open companion identity store'))
  })
}

function request<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('companion identity store request failed'))
  })
}
