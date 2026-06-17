const CACHE = 'maestro-v2'

const PRECACHE = [
  '/',
  '/index.html',
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE))
  )
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  // Solo interceptar peticiones GET — HEAD y otros métodos pasan directo
  if (e.request.method !== 'GET') return

  const url = new URL(e.request.url)

  // Peticiones a la API siempre van a la red (sin cache)
  if (url.pathname.startsWith('/api')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response('{"error":"offline"}', {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )
    return
  }

  // App shell: cache first, luego red
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        // Solo cachear respuestas exitosas del mismo origen (no 401, no opacas)
        if (res.ok && res.type === 'basic') {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {})
        }
        return res
      }).catch(() => cached || new Response('', { status: 503 }))

      return cached || network
    })
  )
})
