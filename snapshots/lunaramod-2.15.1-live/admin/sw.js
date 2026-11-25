// Service worker админки: пуш-уведомления о новых заказах и сообщениях
self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(d.title || 'Уведомление', { body: d.body || '', icon: '/favicon.svg', badge: '/favicon.svg', tag: d.tag, renotify: true, data: { url: d.url || '/admin/' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/admin/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const w = list.find((c) => c.url.includes('/admin'));
    return w ? w.focus().then((c) => c.navigate(url)) : clients.openWindow(url);
  }));
});
