const CACHE = 'maestro-v3'

const PRECACHE = ['/', '/index.html']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
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
      fetch(e.request).catch(
        () =>
          new Response('{"error":"offline"}', {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          })
      )
    )
    return
  }

  // Navegación / app shell ('/', index.html): red primero. Si fuera cache-first,
  // un teléfono que ya tenía la PWA instalada quedaría pegado para siempre en
  // el HTML del último deploy que alcanzó a cachear, referenciando assets con
  // hash que un deploy posterior ya borró (como pasó con el merge F0-F8).
  if (e.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok && res.type === 'basic') {
            const clone = res.clone()
            caches
              .open(CACHE)
              .then(c => c.put(e.request, clone))
              .catch(() => {})
          }
          return res
        })
        .catch(() =>
          caches.match(e.request).then(cached => cached || new Response('', { status: 503 }))
        )
    )
    return
  }

  // Assets con hash en el nombre (JS/CSS de Vite): cache first es seguro,
  // porque cualquier cambio de contenido trae un nombre de archivo nuevo.
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request)
        .then(res => {
          // Solo cachear respuestas exitosas del mismo origen (no 401, no opacas)
          if (res.ok && res.type === 'basic') {
            const clone = res.clone()
            caches
              .open(CACHE)
              .then(c => c.put(e.request, clone))
              .catch(() => {})
          }
          return res
        })
        .catch(() => cached || new Response('', { status: 503 }))

      return cached || network
    })
  )
})
