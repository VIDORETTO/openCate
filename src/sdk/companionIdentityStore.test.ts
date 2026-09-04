import { expect, test } from 'vitest'
import { deriveCompanionKey, createCompanionIdentity } from '../shared/companionCrypto'
import {
  createMemoryCompanionIdentityStore,
  loadOrCreateCompanionIdentity,
} from './companionIdentityStore'

test('identity store creates one stable identity and supports forgetting it', async () => {
  const store = createMemoryCompanionIdentityStore()
  const first = await loadOrCreateCompanionIdentity(store)
  const second = await loadOrCreateCompanionIdentity(store)
  expect(second).toBe(first)

  const peer = await createCompanionIdentity()
  await expect(deriveCompanionKey(first, peer.publicKey, 'store-test')).resolves.toBeDefined()
  await store.clear()
  await expect(store.load()).resolves.toBeNull()
})
