// Способы доставки: самовывоз, курьер, Почта России и СДЭК (расчёт по API), ПЭК / Авито / Ozon / 5Post (фиксированный тариф).
// Итоговая цена = базовая + базовая × наценка% + наценка ₽; бесплатно от суммы заказа (если задано).
const https = require('https');

const CARRIERS = {
  pickup: { name: 'Самовывоз', needs: 'none', api: false },
  courier: { name: 'Курьер магазина', needs: 'address', api: false },
  pochta: { name: 'Почта России', needs: 'postcode', api: true },
  cdek_pvz: { name: 'СДЭК — пункт выдачи', needs: 'cdekPoint', api: true },
  cdek_door: { name: 'СДЭК — курьер до двери', needs: 'cdekAddress', api: true },
  pek: { name: 'ПЭК', needs: 'cityAddress', api: false },
  avito: { name: 'Авито Доставка', needs: 'pointText', api: false },
  ozon: { name: 'Ozon (пункт выдачи)', needs: 'pointText', api: false },
  fivepost: { name: '5Post (Пятёрочка, Перекрёсток)', needs: 'pointText', api: false },
  custom: { name: 'Другой способ', needs: 'address', api: false },
};

// Способы по умолчанию: два старых варианта включены, перевозчики — выключены до настройки
function defaultMethods(s = {}) {
  const m = (id, carrier, extra = {}) => ({ id, carrier, name: CARRIERS[carrier].name, enabled: false, price: 0, markupFixed: 0, markupPercent: 0, freeFrom: 0, days: '', description: '', ...extra });
  return [
    m('pickup', 'pickup', { enabled: s.pickupEnabled !== '0', description: s.pickupAddress || '', days: 'в день заказа' }),
    m('courier', 'courier', { enabled: s.courierEnabled !== '0', price: Number(s.courierPrice || 300), freeFrom: Number(s.courierFreeFrom || 0), days: '1–2 дня' }),
    m('pochta', 'pochta'),
    m('cdek_pvz', 'cdek_pvz'),
    m('cdek_door', 'cdek_door'),
    m('pek', 'pek', { price: 600, days: '3–7 дней' }),
    m('avito', 'avito', { price: 250, days: '3–6 дней', description: 'Укажите адрес пункта выдачи Авито' }),
    m('ozon', 'ozon', { price: 200, days: '3–7 дней', description: 'Укажите адрес пункта выдачи Ozon' }),
    m('fivepost', 'fivepost', { price: 200, days: '3–7 дней', description: 'Укажите адрес постамата или магазина' }),
  ];
}

function getMethods(s) {
  let list;
  try { list = JSON.parse(s.deliveryMethods || ''); } catch { list = null; }
  if (!Array.isArray(list) || !list.length) list = defaultMethods(s);
  return list.filter((m) => CARRIERS[m.carrier]).map((m) => ({ ...m, needs: CARRIERS[m.carrier].needs, api: CARRIERS[m.carrier].api }));
}

const applyMarkup = (m, base, subtotal) => {
  if (Number(m.freeFrom) > 0 && subtotal >= Number(m.freeFrom)) return 0;
  const v = base + (base * Number(m.markupPercent || 0)) / 100 + Number(m.markupFixed || 0);
  return Math.max(0, Math.ceil(v));
};

function request(method, url, { body, headers = {}, form } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = form ? new URLSearchParams(form).toString() : body ? JSON.stringify(body) : null;
    const req = https.request({ host: u.host, path: u.pathname + u.search, method, timeout: 15000,
      headers: { Accept: 'application/json', ...(data ? { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } }, (res) => {
      let d = ''; res.on('data', (c) => { d += c; });
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, data: d }); } });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('служба доставки не отвечает')));
    req.end(data || undefined);
  });
}

const fail = (msg) => Object.assign(new Error(msg), { status: 400 });

// ---------- Почта России (открытый тарификатор tariff.pochta.ru) ----------
async function pochtaQuote(s, postcode, weight) {
  if (!/^\d{6}$/.test(String(postcode || ''))) throw fail('Укажите почтовый индекс (6 цифр)');
  if (!/^\d{6}$/.test(String(s.pochtaFromIndex || ''))) throw fail('Почта России: в настройках не указан индекс отделения отправки');
  const object = s.pochtaObject || '4030';
  const q = `json&object=${object}&from=${s.pochtaFromIndex}&to=${postcode}&weight=${Math.max(100, Math.round(weight))}&pack=10`;
  const [t, d] = await Promise.all([
    request('GET', `https://tariff.pochta.ru/v2/calculate/tariff?${q}`),
    request('GET', `https://tariff.pochta.ru/v2/calculate/tariff/delivery?json&object=${object}&from=${s.pochtaFromIndex}&to=${postcode}`).catch(() => null),
  ]);
  if (!t.data?.paynds) throw fail('Почта России: ' + (t.data?.errors?.[0]?.msg?.split('.').slice(-2).join('.').trim() || 'не удалось рассчитать доставку на этот индекс'));
  const dd = d?.data?.delivery;
  return { base: t.data.paynds / 100, days: dd ? (dd.min === dd.max ? `${dd.max} дн.` : `${dd.min}–${dd.max} дн.`) : '' };
}

// ---------- СДЭК (API v2, OAuth) ----------
let cdekToken = { value: null, exp: 0, key: '' };
const cdekBase = (s) => (s.cdekTest === '1' ? 'https://api.edu.cdek.ru' : 'https://api.cdek.ru');
const CDEK_TEST = { id: 'wqGwiQx0gg8mLtiEKsUinjVSICCjtTEP', secret: 'RmAmgvSgSl1yirlz9QupbzOJVqhCxcP5' }; // публичные тестовые ключи из документации СДЭК

async function cdekAuth(s) {
  const id = s.cdekTest === '1' && !s.cdekClientId ? CDEK_TEST.id : s.cdekClientId;
  const secret = s.cdekTest === '1' && !s.cdekClientSecret ? CDEK_TEST.secret : s.cdekClientSecret;
  if (!id || !secret) throw fail('СДЭК не настроен');
  const key = cdekBase(s) + id;
  if (cdekToken.value && cdekToken.key === key && cdekToken.exp > Date.now() + 60e3) return cdekToken.value;
  const r = await request('POST', `${cdekBase(s)}/v2/oauth/token`, { form: { grant_type: 'client_credentials', client_id: id, client_secret: secret } });
  if (!r.data?.access_token) throw fail('СДЭК: неверные ключи доступа');
  cdekToken = { value: r.data.access_token, exp: Date.now() + (r.data.expires_in || 3600) * 1000, key };
  return cdekToken.value;
}
const cdekGet = async (s, path) => (await request('GET', cdekBase(s) + path, { headers: { Authorization: 'Bearer ' + (await cdekAuth(s)) } })).data;

async function cdekCities(s, q) {
  if (!q || q.trim().length < 2) return [];
  const d = await cdekGet(s, '/v2/location/suggest/cities?' + new URLSearchParams({ name: q.trim(), country_code: 'RU' }));
  return (Array.isArray(d) ? d : []).slice(0, 10).map((c) => ({ code: c.code, name: c.full_name }));
}
async function cdekPoints(s, cityCode) {
  const d = await cdekGet(s, `/v2/deliverypoints?city_code=${Number(cityCode)}&type=PVZ&is_handout=true`);
  return (Array.isArray(d) ? d : []).slice(0, 300).map((p) => ({ code: p.code, name: p.name, address: p.location?.address, workTime: p.work_time }));
}
async function cdekQuote(s, toCityCode, weight, door) {
  if (!toCityCode) throw fail('Выберите город');
  if (!s.cdekFromCityCode) throw fail('СДЭК: в настройках не указан город отправки');
  const r = await request('POST', `${cdekBase(s)}/v2/calculator/tariff`, {
    headers: { Authorization: 'Bearer ' + (await cdekAuth(s)) },
    body: { tariff_code: door ? 137 : 136, from_location: { code: Number(s.cdekFromCityCode) }, to_location: { code: Number(toCityCode) },
      packages: [{ weight: Math.max(100, Math.round(weight)), length: 30, width: 20, height: 10 }] },
  });
  if (!r.data?.total_sum) throw fail('СДЭК: ' + (r.data?.errors?.[0]?.message || 'не удалось рассчитать доставку'));
  const a = r.data.calendar_min ?? r.data.period_min, b = r.data.calendar_max ?? r.data.period_max;
  return { base: r.data.total_sum, days: a ? (a === b ? `${b} дн.` : `${a}–${b} дн.`) : '' };
}

/**
 * Расчёт стоимости доставки. to: { postcode, cityCode, pointCode, address, point }
 * Возвращает { price, base, days, name, info, address } — info сохраняется в заказе.
 */
async function quote(s, methodId, to = {}, { subtotal, weight }) {
  const m = getMethods(s).find((x) => x.id === methodId && x.enabled);
  if (!m) throw fail('Способ доставки недоступен');
  const w = weight || Number(s.defaultWeight || 500);
  let base = Number(m.price || 0), days = m.days || '', info = {}, address = null;
  switch (m.carrier) {
    case 'pickup': info = { address: m.description }; break;
    case 'courier': case 'custom': case 'pek':
      if (!String(to.address || '').trim()) throw fail('Укажите адрес доставки');
      address = String(to.address).trim(); break;
    case 'avito': case 'ozon': case 'fivepost':
      if (!String(to.point || to.address || '').trim()) throw fail('Укажите адрес пункта выдачи');
      address = String(to.point || to.address).trim(); info = { point: address }; break;
    case 'pochta': {
      const r = await pochtaQuote(s, to.postcode, w); base = r.base; days = r.days || days;
      if (!String(to.address || '').trim()) throw fail('Укажите адрес');
      address = `${to.postcode}, ${String(to.address).trim()}`; info = { postcode: to.postcode }; break;
    }
    case 'cdek_pvz': {
      if (!to.pointCode) throw fail('Выберите пункт выдачи СДЭК');
      const r = await cdekQuote(s, to.cityCode, w, false); base = r.base; days = r.days || days;
      address = `СДЭК ${to.pointCode}: ${to.pointAddress || ''}`.trim(); info = { cityCode: to.cityCode, city: to.city, pointCode: to.pointCode, pointAddress: to.pointAddress }; break;
    }
    case 'cdek_door': {
      if (!String(to.address || '').trim()) throw fail('Укажите адрес доставки');
      const r = await cdekQuote(s, to.cityCode, w, true); base = r.base; days = r.days || days;
      address = `${to.city || ''}, ${String(to.address).trim()}`; info = { cityCode: to.cityCode, city: to.city }; break;
    }
    default: throw fail('Способ доставки недоступен');
  }
  return { methodId: m.id, name: m.name, price: applyMarkup(m, base, subtotal), base, days, info: { ...info, days }, address };
}

module.exports = { CARRIERS, defaultMethods, getMethods, quote, cdekCities, cdekPoints, applyMarkup };
