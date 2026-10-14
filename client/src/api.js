const BASE = import.meta.env.VITE_API_URL || '';

export const getToken = () => localStorage.getItem('token');

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + '/api' + path, { method, headers, body: payload });
  if (res.status === 401 && path !== '/auth/login') {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка ' + res.status);
  return data;
}

export const fileUrl = (p) => (p ? BASE + p : null);

export const qs = (obj) => {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => { if (v !== '' && v !== undefined && v !== null && v !== false) p.set(k, v); });
  const s = p.toString();
  return s ? '?' + s : '';
};
