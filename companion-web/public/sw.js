const CACHE_NAME = 'opencate-companion-v1'
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './opencate-logo.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  const isStaticAsset = request.mode === 'navigate'
    || ['font', 'image', 'manifest', 'script', 'style'].includes(request.destination)
  if (!isStaticAsset) return

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (!response.ok) return response
        return caches.open(CACHE_NAME)
          .then((cache) => cache.put(request, response.clone()))
          .then(() => response)
      })
      return network.catch(() => cached ?? (
        request.mode === 'navigate'
          ? caches.match('./index.html')
          : new Response('', { status: 503, statusText: 'Offline' })
      ))
    }),
  )
})
