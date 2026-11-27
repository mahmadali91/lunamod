// Дневной / ночной режим. Пока посетитель сам не выбрал — дневной (светлый), независимо от настроек телефона/компьютера.
// Выбор хранится в браузере; класс .dark ставится на <html>.
// Тот же код (короткая версия) встроен в index.html, чтобы страница не «мигала» белым при загрузке.
const KEY = 'theme';
const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function getTheme() { try { return localStorage.getItem(KEY) || 'light'; } catch { return 'light'; } }
export const isDark = (t = getTheme()) => t === 'dark' || (t === 'system' && !!mq?.matches);

export function applyTheme(t = getTheme()) {
  const dark = isDark(t);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1120' : '#ffffff');
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: t, dark } }));
}
export function setTheme(t) { try { localStorage.setItem(KEY, t); } catch { /* приватный режим */ } applyTheme(t); }

mq?.addEventListener?.('change', () => getTheme() === 'system' && applyTheme());
// Печать (этикетки, чеки) — всегда светлая
if (typeof window !== 'undefined') {
  window.addEventListener('beforeprint', () => document.documentElement.classList.remove('dark'));
  window.addEventListener('afterprint', () => applyTheme());
}
