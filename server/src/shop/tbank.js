// Интернет-эквайринг Т-Банка (API v2). Подпись Token: параметры корня + Password, сортировка по ключу, конкатенация значений, SHA-256.
const https = require('https');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HOST = 'securepay.tinkoff.ru';
// Т-Банк использует сертификат НУЦ Минцифры — добавляем его к стандартным корневым
const CA = [...tls.rootCertificates, fs.readFileSync(path.join(__dirname, '..', '..', 'certs', 'russian_trusted_root_ca.pem'), 'utf8')];

function token(params, password) {
  const flat = { ...params, Password: password };
  delete flat.Token;
  const keys = Object.keys(flat).filter((k) => flat[k] !== null && flat[k] !== undefined && typeof flat[k] !== 'object').sort();
  return crypto.createHash('sha256').update(keys.map((k) => String(flat[k])).join(''), 'utf8').digest('hex');
}

function call(method, body) {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({ host: HOST, path: '/v2/' + method, method: 'POST', ca: CA, timeout: 20000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let d = ''; res.on('data', (c) => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { reject(new Error('Т-Банк: некорректный ответ')); } });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Т-Банк: нет ответа')));
    req.end(data);
  });
}

const kop = (v) => Math.round(v * 100);

// Т-Банк в Receipt.Taxation принимает только: osn, usn_income, usn_income_outcome, envd, esn, patent.
// Отдельных кодов АУСН в API нет: по разъяснениям ФНС для АУСН в чеке указывается УСН
// с тем же объектом («УСН доходы» / «УСН доходы − расходы»), поэтому маппим.
const TAXATION = {
  ausn_income: 'usn_income',
  ausn_income_outcome: 'usn_income_outcome',
};
const taxationForReceipt = (value) => TAXATION[value] || value;


/** Создание платежа. Возвращает { PaymentId, PaymentURL } */
async function initPayment(s, order, attempt = 0) {
  const base = s.siteUrl.replace(/\/$/, '');
  const body = {
    TerminalKey: s.tbankTerminalKey,
    Amount: kop(order.total),
    OrderId: attempt ? `${order.number}-${attempt}` : order.number,
    Description: `Заказ ${order.number}`.slice(0, 140),
    SuccessURL: order.successUrl || `${base}/order/${order.id}?paid=1`,
    FailURL: order.failUrl || `${base}/order/${order.id}?failed=1`,
    NotificationURL: `${base}/api/shop/tbank/notify`,
    DATA: { Phone: '+' + order.phone },
  };
  if (s.tbankReceipt === '1') {
    const items = order.items.map((i) => ({ Name: i.name.slice(0, 128), Price: kop(i.price), Quantity: i.quantity, Amount: kop(i.price * i.quantity), Tax: s.tbankTax, PaymentMethod: 'full_prepayment', PaymentObject: 'commodity' }));
    if (order.deliveryPrice > 0) items.push({ Name: 'Доставка', Price: kop(order.deliveryPrice), Quantity: 1, Amount: kop(order.deliveryPrice), Tax: s.tbankTax, PaymentMethod: 'full_prepayment', PaymentObject: 'service' });
    body.Receipt = { Phone: '+' + order.phone, Taxation: taxationForReceipt(s.tbankTaxation), Items: items };
  }
  body.Token = token(body, s.tbankPassword);
  const r = await call('Init', body);
  if (!r.Success) throw Object.assign(new Error(`Т-Банк: ${r.Message || 'ошибка'}${r.Details ? ' — ' + r.Details : ''}`), { status: 502 });
  return r;
}

async function getState(s, paymentId) {
  const body = { TerminalKey: s.tbankTerminalKey, PaymentId: String(paymentId) };
  body.Token = token(body, s.tbankPassword);
  return call('GetState', body);
}

/** QR / ссылка на оплату через СБП для созданного платежа (DataType PAYLOAD — ссылка вида https://qr.nspk.ru/...) */
async function getQr(s, paymentId) {
  const body = { TerminalKey: s.tbankTerminalKey, PaymentId: String(paymentId), DataType: 'PAYLOAD' };
  body.Token = token(body, s.tbankPassword);
  const r = await call('GetQr', body);
  if (!r.Success || !r.Data) throw Object.assign(new Error(`СБП: ${r.Message || 'не удалось получить QR'}${r.Details ? ' — ' + r.Details : ''}. Проверьте, что СБП подключена в личном кабинете Т-Бизнеса`), { status: 502, sbpUnavailable: true });
  return r.Data;
}

/** Отмена / полный возврат платежа */
async function cancelPayment(s, paymentId) {
  const body = { TerminalKey: s.tbankTerminalKey, PaymentId: String(paymentId) };
  body.Token = token(body, s.tbankPassword);
  const r = await call('Cancel', body);
  if (!r.Success) throw Object.assign(new Error(`Т-Банк: ${r.Message || 'не удалось вернуть платёж'}${r.Details ? ' — ' + r.Details : ''}`), { status: 502 });
  return r;
}

/** Проверка подписи уведомления от банка */
function verifyNotification(s, body) {
  return Boolean(body && body.Token && body.TerminalKey === s.tbankTerminalKey && token(body, s.tbankPassword) === body.Token);
}

module.exports = { initPayment, getState, getQr, cancelPayment, verifyNotification, token };
