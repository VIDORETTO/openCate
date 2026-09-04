const URL_PATTERN = /\b[a-z][a-z\d+.-]{1,20}:\/\/[^\s"'<>]+/gi

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Reduce a URL to its origin so paths, queries, and fragments cannot escape. */
export function scrubSentryUrl(value: string): string {
  try {
    const parsed = new URL(value)
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return '[scrubbed]'
  }
}

/** Remove local home paths and embedded URLs from arbitrary Sentry strings. */
export function scrubSentryString(value: string, home: string): string {
  let scrubbed = value
  if (home) {
    const variants = new Set([home, home.replace(/\\/g, '/'), home.replace(/\//g, '\\')])
    for (const variant of variants) {
      if (!variant) continue
      scrubbed = scrubbed.replace(new RegExp(escapeRegExp(variant), 'gi'), '~')
    }
  }
  return scrubbed.replace(URL_PATTERN, scrubSentryUrl)
}

/**
 * Scrub the serializable Sentry event tree. If Sentry gives us an object that
 * cannot be serialized, drop it instead of falling back to an unsanitized event.
 */
export function scrubSentryEvent(event: unknown, home: string): unknown {
  try {
    const json = JSON.stringify(event, (_key, value: unknown) => (
      typeof value === 'string' ? scrubSentryString(value, home) : value
    ))
    return json === undefined ? null : JSON.parse(json)
  } catch {
    return null
  }
}
