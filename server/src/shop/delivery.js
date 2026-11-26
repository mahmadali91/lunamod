// Способы доставки: самовывоз, курьер, Почта России и СДЭК (расчёт по API), ПЭК / Авито / Ozon / 5Post (фиксированный тариф).
// Итоговая цена = базовая + базовая × наценка% + наценка ₽; бесплатно от суммы заказа (если задано).
const https = require('https');

const CARRIERS = {
  pickup: { name: 'Самовывоз', needs: 'none', api: false },
  courier: { name: 'Курьер магазина', needs: 'address', api: false },
  pochta: { name: 'Почта России', needs: 'postcode', api: true },
  cdek_pvz: { name: 'СДЭК — пункт выдачи', needs: 'cdekPoint', api: true },
  cdek_door: { name: 'СДЭК — курьер до двери', needs: 'cdekAddress', api: true },
  yandex_pvz: { name: 'Яндекс Доставка — пункт выдачи', needs: 'yandexPoint', api: true },
  yandex_door: { name: 'Яндекс Доставка — курьер до двери', needs: 'address', api: true },
  yandex_express: { name: 'Яндекс Доставка — экспресс сегодня', needs: 'address', api: true },
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
    m('yandex_pvz', 'yandex_pvz', { days: '2–5 дней' }),
    m('yandex_door', 'yandex_door', { days: '1–4 дня' }),
    m('yandex_express', 'yandex_express', { days: 'сегодня, 1–3 часа', description: 'Только по Москве и области' }),
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
  return (Array.isArray(d) ? d : []).slice(0, 5000).map((p) => ({ code: p.code, name: p.name, address: p.location?.address, workTime: p.work_time, lat: p.location?.latitude, lon: p.location?.longitude }));
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

// ---------- Яндекс Доставка (API для бизнеса) ----------
// Доставка по России (ПВЗ и курьер в другой день): b2b-authproxy.taxi.yandex.net/api/b2b/platform/...
// Экспресс сегодня: b2b.taxi.yandex.net/b2b/cargo/integration/v2/...
// Тестовая среда (только адреса по Москве): токен — тестовый из документации Яндекс Доставки, вводится в настройках.
const YA_TEST = {
  host: 'https://b2b.taxi.tst.yandex.net',
  station: 'fbed3aa1-2cc6-4370-ab4d-59c5cc9bb924',
  from: 'Москва, Ленинградский проспект, 27',
};
function yaCfg(s) {
  const test = s.yandexTest === '1';
  return {
    test,
    platform: test ? YA_TEST.host : 'https://b2b-authproxy.taxi.yandex.net',
    express: test ? YA_TEST.host : 'https://b2b.taxi.yandex.net',
    token: String(s.yandexToken || '').trim(),
    station: String(s.yandexStationId || '').trim() || (test ? YA_TEST.station : ''),
    from: String(s.yandexFromAddress || '').trim() || (test ? YA_TEST.from : ''),
  };
}
async function yaCall(s, kind, method, path, body) {
  const c = yaCfg(s);
  if (!c.token) throw fail('Яндекс Доставка: в настройках не указан токен API');
  const r = await request(method, (kind === 'express' ? c.express : c.platform) + path, { body, headers: { Authorization: 'Bearer ' + c.token, 'Accept-Language': 'ru' } });
  if (r.status >= 400 || typeof r.data !== 'object') {
    const msg = (r.data && (r.data.message || r.data.code)) || String(r.data || '').slice(0, 200) || 'HTTP ' + r.status;
    throw Object.assign(new Error('Яндекс Доставка: ' + msg), { status: r.status >= 500 ? 502 : 400, code: r.data?.code });
  }
  return r.data;
}
const rub = (v) => Number(String(v || '').replace(/[^\d.]/g, '')) || 0; // «200.08 RUB» → 200.08
const kop = (v) => Math.round(Number(v || 0) * 100);
const DIMS = { dx: 30, dy: 20, dz: 10 }; // коробка по умолчанию, см

async function yandexCities(s, q) {
  if (String(q || '').trim().length < 2) return [];
  const d = await yaCall(s, 'platform', 'POST', '/api/b2b/platform/location/detect', { location: String(q).trim() });
  const seen = new Set();
  return (d.variants || []).filter((v) => v.geo_id && !seen.has(v.geo_id) && seen.add(v.geo_id)).slice(0, 15).map((v) => ({ code: v.geo_id, name: v.address }));
}

const DAY = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const hm = (t) => `${String(t?.hours ?? 0).padStart(2, '0')}:${String(t?.minutes ?? 0).padStart(2, '0')}`;
function workTime(schedule) {
  const r = schedule?.restrictions || [];
  if (!r.length) return '';
  const all = r.every((x) => hm(x.time_from) === hm(r[0].time_from) && hm(x.time_to) === hm(r[0].time_to));
  if (all && r.length === 7) return hm(r[0].time_from) === '00:00' && hm(r[0].time_to) === '23:59' ? 'круглосуточно' : `ежедневно ${hm(r[0].time_from)}–${hm(r[0].time_to)}`;
  return r.map((x) => `${(x.days || []).map((d) => DAY[d]).join(',')} ${hm(x.time_from)}–${hm(x.time_to)}`).join('; ');
}
const pointsCache = new Map(); // geoId → { at, list }
async function yandexPoints(s, geoId) {
  const id = Number(geoId);
  if (!id) throw fail('Не выбран город');
  const key = yaCfg(s).platform + id;
  const hit = pointsCache.get(key);
  if (hit && Date.now() - hit.at < 3600e3) return hit.list;
  const d = await yaCall(s, 'platform', 'POST', '/api/b2b/platform/pickup-points/list', { geo_id: id });
  const list = (d.points || [])
    .filter((p) => (p.payment_methods || []).includes('already_paid') && !p.deactivation_date)
    .map((p) => ({ code: p.id, name: p.name || '', type: p.type === 'terminal' ? 'постамат' : p.is_post_office ? 'Почта России' : 'пункт выдачи',
      address: p.address?.full_address || '', workTime: workTime(p.schedule), lat: p.position?.latitude, lon: p.position?.longitude, dropoff: Boolean(p.available_for_dropoff) }))
    .sort((a, b) => a.address.localeCompare(b.address, 'ru'));
  pointsCache.set(key, { at: Date.now(), list });
  if (pointsCache.size > 200) pointsCache.delete(pointsCache.keys().next().value);
  return list;
}

/** Цена доставки. kind: pvz | door | express. Возвращает { base, days } */
async function yandexQuote(s, kind, to, weight, subtotal) {
  const c = yaCfg(s);
  const w = Math.max(100, Math.round(weight || 500));
  if (kind === 'express') {
    if (!c.from) throw fail('Яндекс Доставка: в настройках не указан адрес, откуда забирать заказ');
    const d = await yaCall(s, 'express', 'POST', '/b2b/cargo/integration/v2/check-price', {
      items: [{ quantity: 1, size: { length: DIMS.dx / 100, width: DIMS.dy / 100, height: DIMS.dz / 100 }, weight: w / 1000 }],
      route_points: [{ fullname: c.from }, { fullname: String(to.address).trim() }],
      requirements: { taxi_class: 'courier' },
    });
    if (!d.price) throw fail('Яндекс Доставка: экспресс по этому адресу недоступен');
    return { base: Math.ceil(rub(d.price)), days: d.eta ? `сегодня, ~${Math.max(1, Math.round(d.eta / 60 + 1))} ч` : 'сегодня' };
  }
  if (!c.station) throw fail('Яндекс Доставка: в настройках не указан склад отправки (ID станции)');
  const destination = kind === 'pvz' ? { platform_station_id: String(to.pointCode) } : { address: String(to.address).trim() };
  const d = await yaCall(s, 'platform', 'POST', '/api/b2b/platform/pricing-calculator', {
    source: { platform_station_id: c.station }, destination, tariff: kind === 'pvz' ? 'self_pickup' : 'time_interval',
    total_weight: w, total_assessed_price: kop(subtotal), client_price: 0, payment_method: 'already_paid',
    places: [{ physical_dims: { weight_gross: w, ...DIMS } }],
  }).catch((e) => { if (e.code === 'no_delivery_options') throw fail('Яндекс Доставка: по этому адресу доставки нет'); throw e; });
  const days = Number(d.delivery_days);
  return { base: Math.ceil(rub(d.pricing_total)), days: days ? `${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}` : '' };
}

const yaKind = (carrier) => ({ yandex_pvz: 'pvz', yandex_door: 'door', yandex_express: 'express' }[carrier]);
const splitName = (n) => { const p = String(n || 'Покупатель').trim().split(/\s+/); return { first_name: p[0] || 'Покупатель', last_name: p.slice(1).join(' ') || '-' }; };
const phone7 = (p) => '+' + String(p || '').replace(/\D/g, '');

/**
 * Передать заказ в Яндекс Доставку. order: заказ с items[{ name, price, quantity, productId, weight }], info — deliveryInfo.
 * Возвращает объект для deliveryInfo.yandex: { kind, requestId | claimId, status, price, createdAt }
 */
async function yandexCreate(s, order, info) {
  const kind = yaKind(info.carrier);
  if (!kind) throw fail('Заказ оформлен не на Яндекс Доставку');
  const c = yaCfg(s);
  const weight = Math.max(100, Math.round(order.items.reduce((a, i) => a + (Number(i.weight) || Number(s.defaultWeight) || 500) * i.quantity, 0)));
  const paid = order.paymentStatus === 'paid';
  // наложенный платёж через Яндекс не подключаем: передаём только оплаченные заказы (или по явному подтверждению админа)
  if (!paid && !info.allowUnpaid) throw fail('Заказ не оплачен. Передать в Яндекс можно оплаченный заказ — или подтвердите, что деньги получены другим способом.');
  if (kind === 'express') {
    if (!c.from) throw fail('Яндекс Доставка: в настройках не указан адрес, откуда забирать заказ');
    const claim = await yaCall(s, 'express', 'POST', '/b2b/cargo/integration/v2/claims/create?request_id=' + encodeURIComponent(order.number + '-' + Date.now()), {
      items: order.items.map((i) => ({ extra_id: order.number, pickup_point: 1, droppof_point: 2, title: String(i.name).slice(0, 255),
        size: { length: DIMS.dx / 100, width: DIMS.dy / 100, height: DIMS.dz / 100 }, weight: (Number(i.weight) || Number(s.defaultWeight) || 500) / 1000,
        cost_value: Number(i.price).toFixed(2), cost_currency: 'RUB', quantity: Math.max(1, Math.round(i.quantity)) })),
      route_points: [
        { point_id: 1, visit_order: 1, type: 'source', contact: { name: s.yandexFromName || s.title || 'Магазин', phone: phone7(s.yandexFromPhone || s.phone) }, address: { fullname: c.from } },
        { point_id: 2, visit_order: 2, type: 'destination', contact: { name: order.name || 'Покупатель', phone: phone7(order.phone) }, address: { fullname: order.address }, external_order_id: order.number },
      ],
      client_requirements: { taxi_class: 'courier' },
      comment: [`Заказ ${order.number}`, order.comment].filter(Boolean).join('. ').slice(0, 1000),
    });
    // Яндекс оценивает заявку несколько секунд, затем её нужно подтвердить
    const r = await yandexExpressAccept(s, claim.id);
    return { kind, claimId: claim.id, status: r.status, price: r.price, createdAt: new Date().toISOString() };
  }
  if (!c.station) throw fail('Яндекс Доставка: в настройках не указан склад отправки (ID станции)');
  if (kind === 'pvz' && !info.pointCode) throw fail('В заказе нет пункта выдачи Яндекса');
  const barcode = order.number + '-1';
  const destination = kind === 'pvz'
    ? { type: 'platform_station', platform_station: { platform_id: String(info.pointCode) } }
    : { type: 'custom_location', custom_location: { details: { full_address: order.address } } };
  const offers = await yaCall(s, 'platform', 'POST', '/api/b2b/platform/offers/create', {
    info: { operator_request_id: order.number + (info.yandexTry ? '-' + info.yandexTry : ''), comment: String(order.comment || '').slice(0, 500) },
    source: { platform_station: { platform_id: c.station } },
    destination,
    items: order.items.map((i, n) => ({ count: Math.max(1, Math.round(i.quantity)), name: String(i.name).slice(0, 255), article: String(i.article || i.productId || n + 1),
      billing_details: { unit_price: kop(i.price), assessed_unit_price: kop(i.price) }, place_barcode: barcode })),
    places: [{ physical_dims: { weight_gross: weight, ...DIMS }, barcode }],
    billing_info: { payment_method: 'already_paid' },
    recipient_info: { ...splitName(order.name), phone: phone7(order.phone) },
    last_mile_policy: kind === 'pvz' ? 'self_pickup' : 'time_interval',
  });
  const offer = (offers.offers || [])[0];
  if (!offer) throw fail('Яндекс Доставка: нет вариантов доставки для этого заказа');
  const conf = await yaCall(s, 'platform', 'POST', '/api/b2b/platform/offers/confirm', { offer_id: offer.offer_id });
  return { kind, requestId: conf.request_id, status: 'CREATED', price: rub(offer.offer_details?.pricing_total), deliveryFrom: offer.offer_details?.delivery_interval?.min || null, createdAt: new Date().toISOString() };
}

/** Экспресс: дождаться оценки и подтвердить заявку (до ~20 с). */
async function yandexExpressAccept(s, claimId) {
  let info = null;
  for (let i = 0; i < 10; i++) {
    info = await yaCall(s, 'express', 'POST', '/b2b/cargo/integration/v2/claims/info?claim_id=' + encodeURIComponent(claimId), {});
    if (info.status !== 'new' && info.status !== 'estimating') break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (info?.status === 'ready_for_approval') {
    await yaCall(s, 'express', 'POST', '/b2b/cargo/integration/v2/claims/accept?claim_id=' + encodeURIComponent(claimId), { version: info.version });
    info = await yaCall(s, 'express', 'POST', '/b2b/cargo/integration/v2/claims/info?claim_id=' + encodeURIComponent(claimId), {});
  }
  return { status: info?.status || 'new', price: rub(info?.pricing?.final_price || info?.pricing?.offer?.price), version: info?.version };
}

const YA_STATUS = {
  // доставка по России
  CREATED: 'заявка создана', DRAFT: 'черновик', VALIDATING: 'проверяется', CREATED_IN_PLATFORM: 'создана', DELIVERY_PROCESSING_STARTED: 'принята в обработку',
  DELIVERY_TRACK_RECIEVED: 'присвоен трек', SORTING_CENTER_AT_START: 'на складе отправки', DELIVERY_LOADED: 'передана в доставку', DELIVERY_AT_START: 'в пути',
  DELIVERY_TRANSPORTATION_RECIPIENT: 'везут получателю', DELIVERY_ARRIVED_PICKUP_POINT: 'ждёт в пункте выдачи', DELIVERY_DELIVERED: 'доставлен',
  CANCELLED: 'отменена', CANCELLED_BY_RECIPIENT: 'отменена получателем', RETURN_PREPARING: 'готовится возврат', RETURN_RETURNED: 'возвращён',
  // экспресс
  new: 'новая', estimating: 'оценивается', ready_for_approval: 'ждёт подтверждения', accepted: 'подтверждена', performer_lookup: 'ищем курьера',
  performer_draft: 'ищем курьера', performer_found: 'курьер найден', pickup_arrived: 'курьер у отправителя', ready_for_pickup_confirmation: 'курьер у отправителя',
  pickuped: 'курьер забрал заказ', delivery_arrived: 'курьер у получателя', ready_for_delivery_confirmation: 'курьер у получателя', delivered: 'доставлен',
  delivered_finish: 'доставлен', returning: 'возврат', returned_finish: 'возвращён', cancelled: 'отменена', cancelled_with_payment: 'отменена (платно)',
  cancelled_by_taxi: 'отменена курьером', failed: 'ошибка', estimating_failed: 'не удалось оценить', performer_not_found: 'курьер не найден',
};
const yaStatusText = (st) => YA_STATUS[st] || st || '—';

/** Обновить статус заявки. y — deliveryInfo.yandex. Возвращает обновлённый y. */
async function yandexRefresh(s, y) {
  if (y.kind === 'express') {
    let info = await yaCall(s, 'express', 'POST', '/b2b/cargo/integration/v2/claims/info?claim_id=' + encodeURIComponent(y.claimId), {});
    if (info.status === 'ready_for_approval') { const r = await yandexExpressAccept(s, y.claimId); info = { ...info, status: r.status }; }
    return { ...y, status: info.status, price: rub(info.pricing?.final_price) || y.price, updatedAt: new Date().toISOString() };
  }
  const d = await yaCall(s, 'platform', 'GET', '/api/b2b/platform/request/info?request_id=' + encodeURIComponent(y.requestId));
  return { ...y, status: d.state?.status || y.status, statusDescription: d.state?.description || '', sharingUrl: d.sharing_url || y.sharingUrl || null, updatedAt: new Date().toISOString() };
}

/** Отменить заявку. */
async function yandexCancel(s, y) {
  if (y.kind === 'express') {
    const ci = await yaCall(s, 'express', 'POST', '/b2b/cargo/integration/v2/claims/cancel-info?claim_id=' + encodeURIComponent(y.claimId), {});
    const info = await yaCall(s, 'express', 'POST', '/b2b/cargo/integration/v2/claims/info?claim_id=' + encodeURIComponent(y.claimId), {});
    await yaCall(s, 'express', 'POST', '/b2b/cargo/integration/v2/claims/cancel?claim_id=' + encodeURIComponent(y.claimId), { version: info.version, cancel_state: ci.cancel_state || 'free' });
    return { ...y, status: 'cancelled', updatedAt: new Date().toISOString() };
  }
  const d = await yaCall(s, 'platform', 'POST', '/api/b2b/platform/request/cancel', { request_id: y.requestId });
  return { ...y, status: d.status === 'CREATED' ? 'CANCELLED' : d.status || 'CANCELLED', statusDescription: d.description || '', updatedAt: new Date().toISOString() };
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
    case 'yandex_pvz': {
      if (!to.pointCode) throw fail('Выберите пункт выдачи Яндекса');
      const r = await yandexQuote(s, 'pvz', to, w, subtotal); base = r.base; days = r.days || days;
      address = `Яндекс ПВЗ: ${to.pointAddress || to.pointCode}`; info = { carrier: m.carrier, cityCode: to.cityCode, city: to.city, pointCode: to.pointCode, pointAddress: to.pointAddress }; break;
    }
    case 'yandex_door': case 'yandex_express': {
      if (!String(to.address || '').trim()) throw fail('Укажите адрес доставки');
      const r = await yandexQuote(s, m.carrier === 'yandex_door' ? 'door' : 'express', to, w, subtotal); base = r.base; days = r.days || days;
      address = String(to.address).trim(); info = { carrier: m.carrier }; break;
    }
    default: throw fail('Способ доставки недоступен');
  }
  return { methodId: m.id, name: m.name, price: applyMarkup(m, base, subtotal), base, days, info: { ...info, days }, address };
}

module.exports = { CARRIERS, defaultMethods, getMethods, quote, cdekCities, cdekPoints, applyMarkup, yandexCities, yandexPoints, yandexCreate, yandexRefresh, yandexCancel, yaStatusText, yaKind };
