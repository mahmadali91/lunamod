// Отправка SMS: SMS.ru или тестовый режим
const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15000 }, (res) => {
      let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve(d));
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}

/** @returns {Promise<{sent: boolean, test?: boolean}>} */
async function sendSms(settings, phone, text) {
  if (settings.smsMode !== 'smsru') return { sent: false, test: true };
  if (!settings.smsruApiId) throw Object.assign(new Error('SMS-сервис не настроен'), { status: 503 });
  const q = new URLSearchParams({ api_id: settings.smsruApiId, to: phone, msg: text, json: '1' });
  if (settings.smsSender) q.set('from', settings.smsSender);
  const raw = await get('https://sms.ru/sms/send?' + q);
  let r; try { r = JSON.parse(raw); } catch { r = {}; }
  const one = r.sms?.[phone];
  if (r.status !== 'OK' || (one && one.status !== 'OK')) {
    console.error('SMS.ru:', raw.slice(0, 300));
    throw Object.assign(new Error('Не удалось отправить SMS. Попробуйте позже.'), { status: 502 });
  }
  return { sent: true };
}


/** Баланс и дневной лимит SMS.ru (для настроек магазина) */
async function status(apiId) {
  if (!apiId) throw Object.assign(new Error('Укажите API-ключ SMS.ru'), { status: 400 });
  const q = new URLSearchParams({ api_id: apiId, json: '1' });
  const [balRaw, limRaw] = await Promise.all([
    get('https://sms.ru/my/balance?' + q).catch(() => ''),
    get('https://sms.ru/my/limit?' + q).catch(() => ''),
  ]);
  const parse = (raw) => { try { return JSON.parse(raw); } catch { return null; } };
  const bal = parse(balRaw); const lim = parse(limRaw);
  if (!bal || bal.status !== 'OK') {
    const msg = bal && bal.status_text ? 'SMS.ru: ' + bal.status_text : 'SMS.ru: не удалось получить баланс (проверьте API-ключ)';
    throw Object.assign(new Error(msg), { status: 502 });
  }
  const okLim = lim && lim.status === 'OK';
  return { balance: Number(bal.balance) || 0, totalLimit: okLim ? Number(lim.total_limit) : null, usedToday: okLim ? Number(lim.used_today) : null };
}

module.exports = { sendSms, status };
