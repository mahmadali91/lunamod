// Капча без сторонних сервисов: «доказательство работы» (как ALTCHA).
// Сервер выдаёт задачу: найти число n, при котором SHA-256(salt + n) = challenge (n ≤ maxnumber).
// Браузер перебирает числа ~0,3–1 с — человеку незаметно, а массовые запросы ботов становятся дорогими.
// Задача подписана (HMAC), живёт 10 минут и принимается только один раз.
const crypto = require('crypto');

const SECRET = (process.env.JWT_SECRET || 'change-me-please') + ':captcha';
const TTL = 10 * 60e3;
const used = new Map(); // подпись → срок, чтобы одно решение нельзя было использовать дважды

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hmac = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('hex');

function createChallenge(maxnumber = 60000) {
  const salt = `${crypto.randomBytes(12).toString('hex')}?expires=${Math.floor((Date.now() + TTL) / 1000)}`;
  const number = crypto.randomInt(Math.floor(maxnumber * 0.1), maxnumber);
  const challenge = sha(salt + number);
  return { algorithm: 'SHA-256', challenge, maxnumber, salt, signature: hmac(challenge) };
}

/** payload — base64(JSON {algorithm, challenge, number, salt, signature}) или объект */
function verify(payload) {
  let p = payload;
  try { if (typeof p === 'string') p = JSON.parse(Buffer.from(p, 'base64').toString()); } catch { return false; }
  if (!p || p.algorithm !== 'SHA-256' || typeof p.salt !== 'string' || typeof p.challenge !== 'string' || typeof p.signature !== 'string') return false;
  const exp = Number((p.salt.match(/[?&]expires=(\d+)/) || [])[1]) * 1000;
  if (!exp || exp < Date.now()) return false;
  const sig = hmac(p.challenge);
  if (sig.length !== p.signature.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(p.signature))) return false;
  if (sha(p.salt + Number(p.number)) !== p.challenge) return false;
  const now = Date.now();
  for (const [k, t] of used) if (t < now) used.delete(k);
  if (used.has(p.signature)) return false;
  used.set(p.signature, exp);
  return true;
}

/** Проверка капчи в обработчике: решение в теле запроса (captcha) или заголовке X-Captcha */
function check(req) {
  return verify(req.body?.captcha || req.headers['x-captcha']);
}

module.exports = { createChallenge, verify, check };
