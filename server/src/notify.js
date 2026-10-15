// Уведомления: Web Push (браузер/телефон) и Telegram. Ошибки уведомлений не ломают основную операцию.
const https = require('https');
const webpush = require('web-push');
const prisma = require('./db');

let vapid = null;
async function getVapid() {
  if (vapid) return vapid;
  const rows = await prisma.setting.findMany({ where: { key: { in: ['vapid_public', 'vapid_private'] } } });
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  if (!m.vapid_public) {
    const k = webpush.generateVAPIDKeys(); // создаются один раз и хранятся в базе
    await prisma.setting.createMany({ data: [{ key: 'vapid_public', value: k.publicKey }, { key: 'vapid_private', value: k.privateKey }], skipDuplicates: true });
    return getVapid();
  }
  vapid = { publicKey: m.vapid_public, privateKey: m.vapid_private };
  webpush.setVapidDetails('mailto:admin@botmi.ru', vapid.publicKey, vapid.privateKey);
  return vapid;
}

async function sendPush(where, payload) {
  await getVapid();
  const subs = await prisma.pushSubscription.findMany({ where });
  let sent = 0; const errors = [];
  await Promise.all(subs.map(async (s) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: JSON.parse(s.keys) }, JSON.stringify(payload), { TTL: 3600 }); sent++; }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {}); else errors.push(e.statusCode || e.code || e.message); }
  }));
  return { total: subs.length, sent, errors };
}

const tls = require('tls');
const fs = require('fs');
const path = require('path');
// MAX и Т-Банк используют сертификат НУЦ Минцифры
const CA = [...tls.rootCertificates, fs.readFileSync(path.join(__dirname, '..', 'certs', 'russian_trusted_root_ca.pem'), 'utf8')];

/** HTTP-запрос, всегда возвращает { ok, status, data, error } — без исключений */
function call(url, { method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch { return resolve({ ok: false, error: 'неверный адрес ' + url }); }
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({ host: u.hostname, port: u.port || 443, path: u.pathname + u.search, method, ca: CA, timeout: 12000,
      headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } }, (res) => {
      let d = ''; res.on('data', (c) => { d += c; });
      res.on('end', () => { let j; try { j = JSON.parse(d); } catch { j = d; } resolve({ ok: res.statusCode < 300, status: res.statusCode, data: j }); });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.code === 'ETIMEDOUT' || e.message === 'timeout' ? 'нет ответа (таймаут) — вероятно, сервер не может достучаться до этого адреса' : `ошибка сети: ${e.code || e.message}` }));
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.end(data || undefined);
  });
}

const tgBase = (s) => (s.tgApiBase || 'https://api.telegram.org').replace(/\/$/, '');
async function telegram(s, text) {
  const r = await call(`${tgBase(s)}/bot${s.tgBotToken}/sendMessage`, { method: 'POST', body: { chat_id: s.tgChatId, text, parse_mode: 'HTML', disable_web_page_preview: true } });
  if (r.ok && r.data?.ok) return { ok: true };
  const d = String(r.data?.description || '');
  const hint = /Unauthorized/i.test(d) ? 'неверный токен бота (проверьте у @BotFather)' : /chat not found/i.test(d) ? 'чат не найден — напишите боту /start или проверьте ID чата' : /blocked by the user/i.test(d) ? 'вы заблокировали бота — разблокируйте его' : d || 'код ' + r.status;
  return { ok: false, error: r.error ? `Telegram: ${r.error}. С российских серверов Telegram часто недоступен — используйте MAX или укажите адрес прокси` : `Telegram: ${hint}` };
}
async function telegramUpdates(s) {
  const r = await call(`${tgBase(s)}/bot${s.tgBotToken}/getUpdates?limit=20`);
  if (!r.ok) return { ok: false, error: r.error || `Telegram: ${r.data?.description || 'код ' + r.status}` };
  const chats = new Map();
  for (const u of r.data.result || []) { const c = (u.message || u.channel_post || u.my_chat_member)?.chat; if (c) chats.set(c.id, c.title || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.username); }
  return { ok: true, chats: [...chats].map(([id, name]) => ({ id, name })) };
}

const MAX_API = 'https://platform-api2.max.ru';
async function maxSend(s, text) {
  const target = /^-/.test(String(s.maxChatId)) ? `chat_id=${s.maxChatId}` : `user_id=${s.maxChatId}`;
  const r = await call(`${MAX_API}/messages?${target}`, { method: 'POST', headers: { Authorization: s.maxBotToken }, body: { text } });
  if (r.ok) return { ok: true };
  const d = String(r.data?.message || r.data?.code || '');
  const hint = /access_token/i.test(d) ? 'неверный токен бота' : /not found|chat\.not\.found/i.test(d) ? 'получатель не найден — напишите боту в MAX и проверьте ID' : d || 'код ' + r.status;
  return { ok: false, error: r.error ? `MAX: ${r.error}` : `MAX: ${hint}` };
}
async function maxUpdates(s) {
  const r = await call(`${MAX_API}/updates?limit=50&timeout=0`, { headers: { Authorization: s.maxBotToken } });
  if (!r.ok) return { ok: false, error: r.error || `MAX: ${r.data?.message || 'код ' + r.status}` };
  const users = new Map();
  for (const u of r.data.updates || []) { const x = u.message?.sender || u.user; if (x?.user_id) users.set(x.user_id, x.name || [x.first_name, x.last_name].filter(Boolean).join(' ')); }
  return { ok: true, chats: [...users].map(([id, name]) => ({ id, name })) };
}

// Журнал последних уведомлений (для диагностики в настройках)
async function logNotify(entry) {
  try {
    const row = await prisma.setting.findUnique({ where: { key: 'notify_log' } });
    const list = row ? JSON.parse(row.value) : [];
    list.unshift({ at: new Date().toISOString(), ...entry });
    const value = JSON.stringify(list.slice(0, 30));
    await prisma.setting.upsert({ where: { key: 'notify_log' }, update: { value }, create: { key: 'notify_log', value } });
  } catch { /* журнал не критичен */ }
}

const esc = (s) => String(s || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

/** Уведомить сотрудников: { title, body, url } */
async function channelSettings() {
  const rows = await prisma.setting.findMany({ where: { key: { in: ['shop_tgBotToken', 'shop_tgChatId', 'shop_tgApiBase', 'shop_maxBotToken', 'shop_maxChatId', 'shop_siteUrl'] } } });
  return Object.fromEntries(rows.map((r) => [r.key.slice(5), r.value]));
}

async function notifyAdmins({ title, body, url, tag }) {
  const result = { title };
  try {
    const p = await sendPush({ userId: { not: null } }, { title, body, url, tag });
    result.push = p.total ? `${p.sent} из ${p.total}${p.errors.length ? ' (ошибки: ' + p.errors.join(', ') + ')' : ''}` : 'нет подписанных устройств';
    const s = await channelSettings();
    const full = url ? (s.siteUrl || '').replace(/\/$/, '') + url : '';
    if (s.tgBotToken && s.tgChatId) {
      const r = await telegram(s, `<b>${esc(title)}</b>\n${esc(body)}${full ? `\n<a href="${full}">Открыть</a>` : ''}`);
      result.telegram = r.ok ? 'отправлено' : r.error;
    }
    if (s.maxBotToken && s.maxChatId) {
      const r = await maxSend(s, `${title}\n${body}${full ? '\n' + full : ''}`);
      result.max = r.ok ? 'отправлено' : r.error;
    }
  } catch (e) { result.error = e.message; console.error('notify:', e.message); }
  await logNotify(result);
  return result;
}

/** Уведомить покупателя (ответ в чате) */
async function notifyVisitor(visitorKey, { title, body, url }) {
  try { await sendPush({ visitorKey }, { title, body, url, tag: 'chat' }); } catch (e) { console.error('notify visitor:', e.message); }
}

// пуш-подписки принимаются только от сервисов браузеров (иначе сервер можно заставить слать запросы куда угодно)
const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com|push\.yandex\.ru|yandex\.net)$/i;
function pushEndpointOk(u) { try { const x = new URL(u); return x.protocol === 'https:' && PUSH_HOSTS.test(x.hostname); } catch { return false; } }

module.exports = { pushEndpointOk, getVapid, notifyAdmins, notifyVisitor, telegram, telegramUpdates, maxSend, maxUpdates, channelSettings };
