const CACHE = 'snackflow-v12'
const APP = '/snack-management-system/'

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([
    APP,
    `${APP}manifest.webmanifest`,
    `${APP}icons/icon.svg`,
  ])))
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Never cache Supabase, authentication, Edge Function or any cross-origin response.
  if (url.origin !== self.location.origin) return

  const isNavigation = request.mode === 'navigate'
  const isStaticAsset = ['style', 'script', 'font', 'image', 'manifest'].includes(request.destination)
  if (!isNavigation && !isStaticAsset) return

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone()
          caches.open(CACHE).then(cache => cache.put(request, copy))
        }
        return response
      })
      .catch(() => caches.match(request).then(hit => hit || (isNavigation ? caches.match(APP) : undefined))),
  )
})
