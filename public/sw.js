const CACHE_NAME = 'juku-v3'

self.addEventListener('install', () => {
  // 即座に新しいSWを有効化（古いSW・古いキャッシュを残さない）
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // API・Supabase・非GETは触らない
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase')
  ) {
    return
  }

  // ページ遷移（HTML）は常にネットワークから取得する＝古い画面を絶対に出さない。
  // オフライン時のみ、あれば最後のキャッシュを返す。
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    )
    return
  }

  // その他の静的アセットはネットワーク優先＋キャッシュフォールバック
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        return response
      })
      .catch(() => caches.match(event.request))
  )
})
