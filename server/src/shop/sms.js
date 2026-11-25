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

module.exports = { sendSms };
