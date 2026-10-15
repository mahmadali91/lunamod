// Капча без сторонних сервисов: браузер решает небольшую задачу (перебор SHA-256), обычно за 0,3–1 с.
// Возвращает строку-решение для поля captcha в запросе.
export async function solveCaptcha() {
  const c = await fetch('/api/captcha', { cache: 'no-store' }).then((r) => r.json());
  const enc = new TextEncoder();
  const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  const BATCH = 500;
  for (let start = 0; start <= c.maxnumber; start += BATCH) {
    const nums = Array.from({ length: Math.min(BATCH, c.maxnumber - start + 1) }, (_, i) => start + i);
    const hashes = await Promise.all(nums.map((n) => crypto.subtle.digest('SHA-256', enc.encode(c.salt + n))));
    const k = hashes.findIndex((h) => hex(h) === c.challenge);
    if (k >= 0) return btoa(JSON.stringify({ algorithm: c.algorithm, challenge: c.challenge, number: nums[k], salt: c.salt, signature: c.signature }));
  }
  throw new Error('Не удалось пройти проверку. Обновите страницу.');
}
