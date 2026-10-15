// API витрины: токен покупателя хранится отдельно от админского
const KEY = 'shop_token';
export const shopToken = {
  get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
  set: (t) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* приватный режим */ } },
};

export async function shopApi(path, { method = 'GET', body } = {}) {
  const headers = {};
  const t = shopToken.get();
  if (t) headers.Authorization = 'Bearer ' + t;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch('/api/shop' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && t) shopToken.set(null);
  if (!res.ok) throw Object.assign(new Error(data.error || 'Ошибка ' + res.status), { status: res.status });
  return data;
}

export const img = (p) => p || null;
export const fmtPhone = (p) => (p ? `+${p[0]} ${p.slice(1, 4)} ${p.slice(4, 7)}-${p.slice(7, 9)}-${p.slice(9)}` : '');
