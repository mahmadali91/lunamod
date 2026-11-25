// Пуш-уведомления витрины: подписка браузера на push (Web Push, VAPID)
import { shopApi } from './api';

const urlB64 = (b) => {
  const p = '='.repeat((4 - (b.length % 4)) % 4);
  const s = atob((b + p).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
};

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// iOS разрешает веб-пуш только установленному на экран «Домой» приложению
export const isIosSafari = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches;

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/').catch(() => null);
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function subscribePush(vapidKey) {
  if (!pushSupported() || !vapidKey) return false;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return false;
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(vapidKey) }));
  await shopApi('/push/subscribe', { method: 'POST', body: sub.toJSON() });
  return true;
}

export async function unsubscribePush() {
  const sub = await currentSubscription();
  if (!sub) return false;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await shopApi('/push/subscribe', { method: 'DELETE', body: { endpoint } }).catch(() => {});
  return true;
}
