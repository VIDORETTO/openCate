import { describe, expect, test } from 'vitest'
import { scrubSentryEvent, scrubSentryString, scrubSentryUrl } from './sentryPrivacy'

describe('Sentry privacy scrubbing', () => {
  test('reduces standalone URLs to origin', () => {
    expect(scrubSentryUrl('https://example.test/private?token=secret#fragment'))
      .toBe('https://example.test')
  })

  test('scrubs URLs and local home paths in every event string field', () => {
    const event = scrubSentryEvent({
      message: 'failed at C:\\Users\\gabri\\project\\file.ts',
      request: { url: 'https://example.test/account?token=secret' },
      breadcrumbs: [{ message: 'fetch https://example.test/private?secret=1' }],
    }, 'C:\\Users\\gabri') as { message: string; request: { url: string }; breadcrumbs: Array<{ message: string }> }

    expect(event.message).toBe('failed at ~\\project\\file.ts')
    expect(event.request.url).toBe('https://example.test')
    expect(event.breadcrumbs[0].message).toBe('fetch https://example.test')
    expect(JSON.stringify(event)).not.toContain('secret')
  })

  test('drops an event that cannot be serialized instead of sending it raw', () => {
    const event: Record<string, unknown> = {}
    event.self = event
    expect(scrubSentryEvent(event, 'C:\\Users\\gabri')).toBeNull()
  })

  test('leaves ordinary diagnostic text intact', () => {
    expect(scrubSentryString('renderer-process-gone: exitCode=137', '/home/gabri'))
      .toBe('renderer-process-gone: exitCode=137')
  })
})
