// Service worker витрины: пуш-уведомления об ответах в чате
self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(d.title || 'Сообщение', { body: d.body || '', icon: '/favicon.svg', tag: d.tag, data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const w = list.find((c) => c.url.includes(self.location.origin));
    return w ? w.focus().then((c) => c.navigate(url)) : clients.openWindow(url);
  }));
});
