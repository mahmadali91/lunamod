// Service worker витрины: работа как приложение (PWA), офлайн-страница, пуш-уведомления
const CACHE = 'shop-v2';
const OFFLINE = '/offline.html';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, '/icons/shop-192.png'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;
  // видео и голосовые идут частями (Range) — их не трогаем, иначе Safari не воспроизводит
  if (req.headers.has('range') || req.destination === 'video' || req.destination === 'audio' || /\.(mp4|webm|mov|m4a|ogg|mp3|m3u8|ts)$/i.test(url.pathname)) return;
  // страницы — всегда из сети (свежие цены и наличие); без сети — офлайн-страница
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }
  // собранные файлы с хэшем в имени и фото товаров — из кэша, если уже скачаны
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/uploads/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.status === 200 && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});

self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(d.title || 'Сообщение', { body: d.body || '', icon: '/icons/shop-192.png', badge: '/icons/shop-192.png', tag: d.tag, data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const w = list.find((c) => c.url.includes(self.location.origin) && !c.url.includes('/admin'));
    return w ? w.focus().then((c) => c.navigate(url)) : clients.openWindow(url);
  }));
});
