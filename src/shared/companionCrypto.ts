import {
  COMPANION_MAX_RELAY_FRAME_BYTES,
  COMPANION_PROTOCOL_VERSION,
  validateRelayFrame,
  type CompanionRelayFrame,
} from './companionProtocol'

/**
 * Browser/Node-compatible primitives for the companion channel.
 *
 * Pairing can use an exportable JWK identity for clipboard/QR bootstrap or a
 * non-extractable CryptoKey loaded from the web/mobile identity store. The
 * latter keeps the private half out of localStorage and JSON persistence.
 */

const IDENTITY_PREFIX = 'jwk1.'
const CIPHERTEXT_PREFIX = `c${COMPANION_PROTOCOL_VERSION}.`
const DERIVATION_INFO = new TextEncoder().encode('cate-companion-v1')
const IV_BYTES = 12
const AES_KEY_BITS = 256
const ECDH_BITS = 256
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export interface CompanionIdentity {
  publicKey: string
  privateKey: string | CryptoKey
}

export type CompanionWireMessage =
  | { type: 'request'; request: unknown }
  | { type: 'response'; response: unknown }

export interface SealCompanionFrameOptions {
  channelId: string
  sender: CompanionRelayFrame['sender']
  key: CryptoKey
  message: CompanionWireMessage
  issuedAt?: number
  ttlMs?: number
  frameId?: string
}

export async function createCompanionIdentity(): Promise<CompanionIdentity> {
  const subtle = webCrypto().subtle
  const pair = await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )
  const publicKey = await subtle.exportKey('jwk', pair.publicKey)
  const privateKey = await subtle.exportKey('jwk', pair.privateKey)
  return {
    publicKey: encodeJwk(publicKey),
    privateKey: encodeJwk(privateKey),
  }
}

/** Import an exported identity into a non-extractable private key. Web/mobile
 * stores use this before putting the identity into IndexedDB or a native
 * keychain; the JWK is never required to remain on disk. */
export async function importCompanionPrivateKey(value: string): Promise<CryptoKey> {
  return webCrypto().subtle.importKey(
    'jwk',
    decodeJwk(value),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  )
}

export async function deriveCompanionKey(
  identity: CompanionIdentity,
  peerPublicKey: string,
  context: string,
): Promise<CryptoKey> {
  if (context.length === 0 || context.length > 256) throw new Error('invalid companion key context')
  const subtle = webCrypto().subtle
  const privateKey = isCryptoKey(identity.privateKey)
    ? identity.privateKey
    : await importCompanionPrivateKey(identity.privateKey)
  const peerKey = await subtle.importKey(
    'jwk',
    decodeJwk(peerPublicKey),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const sharedBits = await subtle.deriveBits(
    { name: 'ECDH', public: peerKey },
    privateKey,
    ECDH_BITS,
  )
  const hkdfKey = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey'])
  const salt = await subtle.digest('SHA-256', asArrayBuffer(utf8(context)))
  return subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: asArrayBuffer(DERIVATION_INFO),
    },
    hkdfKey,
    { name: 'AES-GCM', length: AES_KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptCompanionPayload(
  value: unknown,
  key: CryptoKey,
  associatedData = '',
): Promise<string> {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new Error('companion payload is not serializable')
  const plaintext = utf8(serialized)
  if (plaintext.byteLength > COMPANION_MAX_RELAY_FRAME_BYTES) {
    throw new Error('companion payload too large')
  }
  const iv = new Uint8Array(IV_BYTES)
  webCrypto().getRandomValues(iv)
  const ciphertext = await webCrypto().subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: asArrayBuffer(iv),
      ...(associatedData ? { additionalData: asArrayBuffer(utf8(associatedData)) } : {}),
    },
    key,
    asArrayBuffer(plaintext),
  )
  return `${CIPHERTEXT_PREFIX}${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(ciphertext))}`
}

export async function decryptCompanionPayload<T>(
  encoded: string,
  key: CryptoKey,
  associatedData = '',
): Promise<T> {
  try {
    const parts = encoded.split('.')
    if (parts.length !== 3 || parts[0] !== `c${COMPANION_PROTOCOL_VERSION}`) {
      throw new Error('invalid companion ciphertext')
    }
    const iv = decodeBase64Url(parts[1])
    if (iv.byteLength !== IV_BYTES) throw new Error('invalid companion nonce')
    const ciphertext = decodeBase64Url(parts[2])
    const plaintext = await webCrypto().subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: asArrayBuffer(iv),
        ...(associatedData ? { additionalData: asArrayBuffer(utf8(associatedData)) } : {}),
      },
      key,
      asArrayBuffer(ciphertext),
    )
    return JSON.parse(new TextDecoder().decode(plaintext)) as T
  } catch {
    throw new Error('unable to decrypt companion payload')
  }
}

export function companionRelayAssociatedData(frame: Pick<
  CompanionRelayFrame,
  'version' | 'frameId' | 'channelId' | 'sender' | 'issuedAt' | 'expiresAt'
>): string {
  return JSON.stringify([
    frame.version,
    frame.frameId,
    frame.channelId,
    frame.sender,
    frame.issuedAt,
    frame.expiresAt,
  ])
}

export async function sealCompanionRelayFrame(options: SealCompanionFrameOptions): Promise<CompanionRelayFrame> {
  const issuedAt = options.issuedAt ?? Date.now()
  const ttlMs = options.ttlMs ?? 2 * 60_000
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > 15 * 60_000) {
    throw new Error('invalid companion frame window')
  }
  const frame: Pick<CompanionRelayFrame, 'version' | 'frameId' | 'channelId' | 'sender' | 'issuedAt' | 'expiresAt'> = {
    version: COMPANION_PROTOCOL_VERSION,
    frameId: options.frameId ?? randomCompanionId('frame'),
    channelId: options.channelId,
    sender: options.sender,
    issuedAt,
    expiresAt: issuedAt + ttlMs,
  }
  const ciphertext = await encryptCompanionPayload(
    options.message,
    options.key,
    companionRelayAssociatedData(frame),
  )
  return { ...frame, ciphertext }
}

export async function openCompanionRelayFrame<T extends CompanionWireMessage = CompanionWireMessage>(
  frame: CompanionRelayFrame,
  key: CryptoKey,
  now = Date.now(),
): Promise<T> {
  const normalized = validateRelayFrame(frame, now)
  return decryptCompanionPayload<T>(
    normalized.ciphertext,
    key,
    companionRelayAssociatedData(normalized),
  )
}

export function randomCompanionId(prefix = 'id'): string {
  const bytes = new Uint8Array(16)
  webCrypto().getRandomValues(bytes)
  return `${prefix}-${encodeBase64Url(bytes)}`
}

function webCrypto(): Crypto {
  const value = globalThis.crypto
  if (!value?.subtle || !value.getRandomValues) throw new Error('Web Crypto is unavailable')
  return value
}

function isCryptoKey(value: unknown): value is CryptoKey {
  return typeof CryptoKey !== 'undefined' && value instanceof CryptoKey
}

function encodeJwk(value: JsonWebKey): string {
  return `${IDENTITY_PREFIX}${encodeBase64Url(utf8(JSON.stringify(value)))}`
}

function decodeJwk(value: string): JsonWebKey {
  try {
    if (!value.startsWith(IDENTITY_PREFIX)) throw new Error('invalid companion key')
    const decoded = JSON.parse(new TextDecoder().decode(decodeBase64Url(value.slice(IDENTITY_PREFIX.length)))) as unknown
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('invalid companion key')
    return decoded as JsonWebKey
  } catch {
    throw new Error('invalid companion key')
  }
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

function encodeBase64Url(bytes: Uint8Array): string {
  let output = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0
    const third = index + 2 < bytes.length ? bytes[index + 2] : 0
    output += BASE64_ALPHABET[first >> 2]
    output += BASE64_ALPHABET[((first & 3) << 4) | (second >> 4)]
    output += index + 1 < bytes.length ? BASE64_ALPHABET[((second & 15) << 2) | (third >> 6)] : '='
    output += index + 2 < bytes.length ? BASE64_ALPHABET[third & 63] : '='
  }
  return output.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/u.test(value) || value.length % 4 === 1) {
    throw new Error('invalid base64url')
  }
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const padding = padded.endsWith('==') ? 2 : padded.endsWith('=') ? 1 : 0
  const bytes = new Uint8Array((padded.length / 4) * 3 - padding)
  for (let index = 0, output = 0; index < padded.length; index += 4) {
    const first = BASE64_ALPHABET.indexOf(padded[index])
    const second = BASE64_ALPHABET.indexOf(padded[index + 1])
    const third = padded[index + 2] === '=' ? 0 : BASE64_ALPHABET.indexOf(padded[index + 2])
    const fourth = padded[index + 3] === '=' ? 0 : BASE64_ALPHABET.indexOf(padded[index + 3])
    if (first < 0 || second < 0 || third < 0 || fourth < 0) throw new Error('invalid base64url')
    if (output < bytes.length) bytes[output++] = (first << 2) | (second >> 4)
    if (output < bytes.length) bytes[output++] = ((second & 15) << 4) | (third >> 2)
    if (output < bytes.length) bytes[output++] = ((third & 3) << 6) | fourth
  }
  return bytes
}
