// Интеграция с Wildberries (API продавца). Токен хранится только на сервере (настройка wb_token).
// Загрузка карточек: модель WB (imtID) → наша модель (ProductGroup), карточка WB (nmID, свой артикул продавца,
// цвет, фото, видео, характеристики) → карточка товара, размеры (techSize / wbSize, баркоды) → размеры карточки.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const prisma = require('./db');
const { UPLOAD_DIR } = require('./paths');
const { detectBarcodeType } = require('./util');

const CONTENT = 'https://content-api.wildberries.ru';
const PRICES = 'https://discounts-prices-api.wildberries.ru';
const STATUS = 'wb_import_status';

async function getToken() { return (await prisma.setting.findUnique({ where: { key: 'wb_token' } }))?.value || null; }

/** Запрос к API WB с понятной ошибкой; при превышении лимита — пауза и повтор */
async function wb(url, { method = 'GET', body, token } = {}) {
  token = token || (await getToken());
  if (!token) throw Object.assign(new Error('Токен Wildberries не указан'), { status: 400 });
  for (let attempt = 0; attempt < 7; attempt++) {
    let res;
    try {
      res = await fetch(url, { method, headers: { Authorization: token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body && JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    } catch (e) { throw Object.assign(new Error('Wildberries недоступен: ' + (e.cause?.code || e.message)), { status: 502 }); }
    if (res.status === 429) {
      // WB сообщает, через сколько секунд можно повторить
      const wait = Number(res.headers.get('x-ratelimit-retry')) || Number(res.headers.get('retry-after')) || 2 * (attempt + 1);
      await new Promise((r) => setTimeout(r, Math.min(70, wait + 0.5) * 1000));
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw Object.assign(new Error('Wildberries: токен недействителен или истёк — создайте новый в кабинете (Настройки → Доступ к API)'), { status: 400 });
    if (res.status === 403) throw Object.assign(new Error('Wildberries: у токена нет доступа к этому разделу — включите нужную категорию в настройках токена'), { status: 400 });
    if (!res.ok) throw Object.assign(new Error(`Wildberries: ${data.detail || data.title || data.errorText || 'ошибка ' + res.status}`), { status: 502 });
    return data;
  }
  throw Object.assign(new Error('Wildberries: слишком много запросов, попробуйте через минуту'), { status: 429 });
}

/** Что разрешено токену (из его содержимого) и срок действия */
function tokenInfo(token) {
  try {
    const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    // биты категорий доступа по документации WB
    const BITS = { 1: 'Контент', 2: 'Аналитика', 3: 'Цены и скидки', 4: 'Маркетплейс', 5: 'Статистика', 6: 'Продвижение', 7: 'Вопросы и отзывы', 9: 'Чат с покупателями', 10: 'Поставки', 11: 'Возвраты', 12: 'Документы', 13: 'Финансы' };
    const scopes = Object.entries(BITS).filter(([b]) => (p.s >> Number(b)) & 1).map(([, n]) => n);
    return { expires: p.exp ? new Date(p.exp * 1000) : null, readOnly: (p.s >> 30) & 1 ? true : false, scopes, test: !!p.t };
  } catch { return null; }
}

async function getStatus() {
  const row = await prisma.setting.findUnique({ where: { key: STATUS } });
  return row ? JSON.parse(row.value) : { state: 'idle' };
}
async function setStatus(st) {
  const value = JSON.stringify({ ...st, at: new Date().toISOString() });
  await prisma.setting.upsert({ where: { key: STATUS }, update: { value }, create: { key: STATUS, value } });
}

/** Все карточки продавца (по 100, курсором) */
async function fetchCards() {
  const all = [];
  let cursor = { limit: 100 };
  for (let i = 0; i < 200; i++) {
    const d = await wb(`${CONTENT}/content/v2/get/cards/list`, { method: 'POST', body: { settings: { cursor, filter: { withPhoto: -1 } } } });
    all.push(...(d.cards || []));
    if (!d.cards?.length || d.cards.length < cursor.limit) break;
    cursor = { limit: 100, updatedAt: d.cursor.updatedAt, nmID: d.cursor.nmID };
  }
  return all;
}

/** Цены и скидки: nmID → { [techSize]: { price, discounted } } */
async function fetchPrices() {
  const out = {};
  for (let offset = 0; offset < 100000; offset += 1000) {
    const d = await wb(`${PRICES}/api/v2/list/goods/filter?limit=1000&offset=${offset}`);
    const list = d.data?.listGoods || [];
    for (const g of list) out[g.nmID] = Object.fromEntries((g.sizes || []).map((z) => [String(z.techSizeName), { price: z.price, discounted: Math.round(z.discountedPrice) }]));
    if (list.length < 1000) break;
  }
  return out;
}

async function download(url, file) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error('фото ' + res.status);
  fs.writeFileSync(path.join(UPLOAD_DIR, file), Buffer.from(await res.arrayBuffer()));
}

const SKIP_ATTRS = new Set(['Цвет', 'ТНВЭД', 'Ставка НДС', 'Номер декларации соответствия', 'Дата регистрации сертификата/декларации', 'Дата окончания действия сертификата/декларации']);
const val = (v) => (Array.isArray(v) ? v.join(', ') : String(v ?? '')).trim();

/** Импорт карточек WB в учёт. photos: 'missing' — скачивать только для карточек без фото, 'all' — перекачать все */
async function importCards({ photos = 'missing' } = {}) {
  const { slugify, variantName } = require('./routes/products');
  const { generateEan13 } = require('./util');
  await setStatus({ state: 'running', step: 'Получаю карточки из Wildberries', progress: 2 });
  const cards = await fetchCards();
  await setStatus({ state: 'running', step: 'Получаю цены', progress: 8 });
  let prices = {};
  let priceError = null;
  try { prices = await fetchPrices(); } catch (e) { prices = {}; priceError = e.message; }
  const report = { cards: cards.length, models: new Set(cards.map((c) => c.imtID)).size, created: 0, updated: 0, sizes: 0, photos: 0, videos: 0, prices: Object.keys(prices).length, warnings: [] };
  if (priceError) report.warnings.push(`Цены не загружены (${priceError}) — у товаров оставлены прежние цены. Нажмите «Обновить» ещё раз через минуту`);
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const catCache = {};

  for (const [i, c] of cards.entries()) {
    await setStatus({ state: 'running', step: `Карточка ${i + 1} из ${cards.length}: ${c.vendorCode}`, progress: 10 + Math.round((i / cards.length) * 88) });
    try {
      const ch = Object.fromEntries((c.characteristics || []).map((x) => [x.name, x.value]));
      const colors = Array.isArray(ch['Цвет']) ? ch['Цвет'] : ch['Цвет'] ? [ch['Цвет']] : [];
      const color = colors[0] ? colors[0][0].toUpperCase() + colors[0].slice(1) : null;
      const model = [ch['Рост модели на фото'] && `рост ${val(ch['Рост модели на фото'])} см`, ch['Размер на модели'] && `на модели размер ${val(ch['Размер на модели'])}`, ch['Параметры модели на фото (ОГ-ОТ-ОБ)'] && `параметры ${val(ch['Параметры модели на фото (ОГ-ОТ-ОБ)'])}`].filter(Boolean).join(', ');
      const sp = prices[c.nmID] || {};
      const sizePrice = (z) => sp[String(z.techSize)] || Object.values(sp)[0] || null;
      const firstPrice = c.sizes.map(sizePrice).find(Boolean);
      if (!catCache[c.subjectName]) catCache[c.subjectName] = (await prisma.category.findUnique({ where: { name: c.subjectName } })) || (await prisma.category.create({ data: { name: c.subjectName } }));

      await prisma.$transaction(async (tx) => {
        const group = await tx.productGroup.upsert({ where: { wbImtId: c.imtID }, update: {}, create: { wbImtId: c.imtID } });
        let card = await tx.product.findUnique({ where: { wbNmId: c.nmID } });
        if (!card) card = await tx.product.findFirst({ where: { sku: c.vendorCode, parentId: null } });
        const skuOwner = await tx.product.findUnique({ where: { sku: c.vendorCode } });
        const data = {
          name: c.title || c.vendorCode, brand: c.brand || null, description: c.description || null, categoryId: catCache[c.subjectName].id,
          color, groupId: group.id, wbNmId: c.nmID, wbImtId: c.imtID, hasVariants: true, active: true,
          modelInfo: model || null, ...(skuOwner && skuOwner.id !== card?.id ? {} : { sku: c.vendorCode }),
          packLength: c.dimensions?.length || null, packWidth: c.dimensions?.width || null, packHeight: c.dimensions?.height || null,
          weight: c.dimensions?.weightBrutto > 0 ? Math.round(c.dimensions.weightBrutto * 1000) : undefined,
          ...(firstPrice ? { price: firstPrice.discounted, oldPrice: firstPrice.price > firstPrice.discounted ? firstPrice.price : null } : {}),
        };
        if (card) { card = await tx.product.update({ where: { id: card.id }, data }); report.updated++; }
        else { card = await tx.product.create({ data: { ...data, slug: slugify(data.name) || null, showInShop: true } }); report.created++; }
        if (skuOwner && skuOwner.id !== card.id) report.warnings.push(`${c.vendorCode}: такой артикул уже у другого товара — оставлен прежний`);

        // характеристики
        await tx.productAttribute.deleteMany({ where: { productId: card.id } });
        const attrs = Object.entries(ch).filter(([n, v]) => !SKIP_ATTRS.has(n) && val(v)).map(([name, v]) => ({ productId: card.id, name, value: val(v).slice(0, 190) }));
        if (colors.length > 1) attrs.unshift({ productId: card.id, name: 'Цвет', value: colors.join(', ') });
        if (ch['ТНВЭД']) attrs.push({ productId: card.id, name: 'ТН ВЭД', value: val(ch['ТНВЭД']) });
        if (attrs.length) await tx.productAttribute.createMany({ data: attrs });

        // размеры: размер продавца, рос. размер, баркоды, цена со скидкой
        const kids = await tx.product.findMany({ where: { parentId: card.id }, include: { barcodes: true } });
        for (const [si, z] of c.sizes.entries()) {
          const size = String(z.techSize || z.wbSize || 'Единый');
          const pr = sizePrice(z);
          let kid = kids.find((k) => (k.size || '').toLowerCase() === size.toLowerCase()) || kids.find((k) => k.barcodes.some((b) => z.skus?.includes(b.code)));
          const kd = { name: variantName(card.name, card.color, size), size, sizeRu: z.wbSize && String(z.wbSize) !== size ? String(z.wbSize) : null, color: card.color, sort: si,
            categoryId: card.categoryId, brand: card.brand, unit: card.unit, showInShop: card.showInShop, active: true,
            ...(pr ? { price: pr.discounted, oldPrice: pr.price > pr.discounted ? pr.price : null } : kid ? {} : { price: card.price, oldPrice: card.oldPrice }) };
          kid = kid ? await tx.product.update({ where: { id: kid.id }, data: kd }) : await tx.product.create({ data: { ...kd, parentId: card.id, costPrice: card.costPrice } });
          report.sizes++;
          const skus = (z.skus || []).filter(Boolean);
          for (const [bi, code] of skus.entries()) {
            const ex = await tx.barcode.findUnique({ where: { code } });
            if (ex && ex.productId !== kid.id) { report.warnings.push(`Баркод ${code} (${c.vendorCode}, ${size}) уже у другого товара`); continue; }
            if (!ex) await tx.barcode.create({ data: { productId: kid.id, code, type: detectBarcodeType(code), isPrimary: bi === 0 && !(await tx.barcode.count({ where: { productId: kid.id, isPrimary: true } })) } });
          }
          if (!skus.length && !(await tx.barcode.count({ where: { productId: kid.id } }))) await tx.barcode.create({ data: { productId: kid.id, code: await generateEan13(tx), type: 'EAN13', isPrimary: true, generated: true } });
        }
        // если раньше у карточки были свои штрихкоды (товар без размеров) — они больше не нужны
        await tx.barcode.deleteMany({ where: { productId: card.id } });
        c._cardId = card.id;
      }, { timeout: 60000 });

      // фото и видео (вне транзакции — скачивание)
      const cardId = c._cardId;
      const have = await prisma.productImage.findMany({ where: { productId: cardId } });
      if ((photos === 'all' || !have.some((x) => x.kind !== 'video')) && c.photos?.length) {
        const created = [];
        for (const [k, ph] of c.photos.entries()) {
          const url = ph.big || ph.hq || ph.c516x688;
          const file = `wb-${c.nmID}-${k + 1}-${crypto.randomBytes(3).toString('hex')}.webp`;
          try { await download(url, file); created.push({ productId: cardId, path: '/uploads/' + file, sort: k, kind: 'image' }); report.photos++; } catch (e) { report.warnings.push(`${c.vendorCode}: не скачалось фото ${k + 1} (${e.message})`); }
        }
        if (created.length) {
          const old = have.filter((x) => x.kind !== 'video');
          await prisma.productImage.deleteMany({ where: { id: { in: old.map((x) => x.id) } } });
          for (const o of old) if (o.path.startsWith('/uploads/wb-') && !(await prisma.productImage.count({ where: { path: o.path } }))) fs.unlink(path.join(UPLOAD_DIR, path.basename(o.path)), () => {});
          await prisma.productImage.createMany({ data: created });
        }
      }
      // видео WB — потоковое (HLS), храним ссылку
      if (c.video && !have.some((x) => x.kind === 'video' && x.path === c.video)) {
        await prisma.productImage.deleteMany({ where: { productId: cardId, kind: 'video', path: { startsWith: 'https://' } } });
        await prisma.productImage.create({ data: { productId: cardId, path: c.video, kind: 'video', sort: 100 } });
        report.videos++;
      }
    } catch (e) {
      report.warnings.push(`${c.vendorCode}: ${e.message.split('\n').pop()}`);
    }
  }
  // модели из одной карточки — без группы (на сайте нечего выбирать)
  report.warnings = report.warnings.slice(0, 100);
  await setStatus({ state: 'done', step: 'Готово', progress: 100, report });
  return report;
}

module.exports = { wb, tokenInfo, getToken, getStatus, setStatus, importCards, fetchCards };
