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
  await Promise.all(subs.map(async (s) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: JSON.parse(s.keys) }, JSON.stringify(payload), { TTL: 3600 }); }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {}); }
  }));
}

function telegram(token, chatId, text) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
    const req = https.request({ host: 'api.telegram.org', path: `/bot${token}/sendMessage`, method: 'POST', timeout: 10000, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve(d));
    });
    req.on('error', () => resolve(null)); req.on('timeout', () => req.destroy());
    req.end(data);
  });
}

const esc = (s) => String(s || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

/** Уведомить сотрудников: { title, body, url } */
async function notifyAdmins({ title, body, url, tag }) {
  try {
    await sendPush({ userId: { not: null } }, { title, body, url, tag });
    const rows = await prisma.setting.findMany({ where: { key: { in: ['shop_tgBotToken', 'shop_tgChatId', 'shop_siteUrl'] } } });
    const s = Object.fromEntries(rows.map((r) => [r.key.slice(5), r.value]));
    if (s.tgBotToken && s.tgChatId) {
      const link = url ? `\n<a href="${(s.siteUrl || '').replace(/\/$/, '')}${url}">Открыть</a>` : '';
      await telegram(s.tgBotToken, s.tgChatId, `<b>${esc(title)}</b>\n${esc(body)}${link}`);
    }
  } catch (e) { console.error('notify:', e.message); }
}

/** Уведомить покупателя (ответ в чате) */
async function notifyVisitor(visitorKey, { title, body, url }) {
  try { await sendPush({ visitorKey }, { title, body, url, tag: 'chat' }); } catch (e) { console.error('notify visitor:', e.message); }
}

module.exports = { getVapid, notifyAdmins, notifyVisitor, telegram };
