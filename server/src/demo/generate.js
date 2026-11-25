// Демо-данные: 20 категорий, 100 товаров с иллюстрациями, продажи за год, реализация.
// Все созданные записи запоминаются в настройке demo_data, чтобы их можно было удалить одной кнопкой.
const fs = require('fs');
const path = require('path');
const prisma = require('../db');
const { UPLOAD_DIR } = require('../paths');
const { generateEan13 } = require('../util');
const { CATEGORIES, COLORS, SIZES } = require('./catalog');
const { garmentSvg } = require('./images');

const KEY = 'demo_data';
const STATUS = 'demo_status';
const rnd = (a, b) => a + Math.random() * (b - a);
const irnd = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const price90 = (v) => Math.max(90, Math.round(v / 100) * 100 - 10);
const day = (d) => { const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - d); return x; };
// Время внутри дня, но не позже текущего момента (для сегодняшних продаж)
const atHour = (date, h, m = irnd(0, 59)) => {
  const x = new Date(date); x.setHours(h, m, irnd(0, 59), 0);
  const now = Date.now();
  return x.getTime() > now ? new Date(Math.max(new Date(date).getTime(), now - irnd(1, 240) * 60e3)) : x;
};
const chunks = (arr, n = 500) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

async function setStatus(status) {
  const value = JSON.stringify({ ...status, at: new Date().toISOString() });
  await prisma.setting.upsert({ where: { key: STATUS }, update: { value }, create: { key: STATUS, value } });
}

async function getStatus() {
  const [s, d] = await Promise.all([prisma.setting.findUnique({ where: { key: STATUS } }), prisma.setting.findUnique({ where: { key: KEY } })]);
  return { ...(s ? JSON.parse(s.value) : { state: 'idle' }), loaded: Boolean(d) };
}

async function maxId(model) {
  const r = await prisma[model].aggregate({ _max: { id: true } });
  return r._max.id || 0;
}

async function nextSeq(key) {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row ? Number(row.value) : 0;
}

/**
 * @param {{ perCategory?: number, days?: number }} opts — уменьшенные значения используются в тестах
 */
async function generateDemo({ perCategory = 5, days = 365 } = {}) {
  if (await prisma.setting.findUnique({ where: { key: KEY } })) throw Object.assign(new Error('Демо-данные уже загружены'), { status: 400 });
  const created = { categories: [], products: [], groups: [], sizeCharts: [], counterparties: [], channels: [], warehouses: [], images: [], sales: null, receipts: null };
  // Список созданного сохраняется по ходу — даже после сбоя всё можно удалить кнопкой
  const save = async () => {
    const value = JSON.stringify(created);
    await prisma.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  };
  const t0 = Date.now();
  await setStatus({ state: 'running', step: 'Склады и справочники' });

  // --- Склады, каналы, контрагенты ---
  let warehouses = await prisma.warehouse.findMany({ where: { active: true }, orderBy: { id: 'asc' } });
  if (warehouses.length < 2) {
    for (const [name, address] of [['Основной склад', 'ул. Складская, 1'], ['Магазин', 'ТЦ «Центральный», 1 этаж']].slice(warehouses.length)) {
      const w = await prisma.warehouse.create({ data: { name, address } });
      created.warehouses.push(w.id); warehouses.push(w);
    }
  }
  const [wMain, wShop] = warehouses;

  let channels = await prisma.salesChannel.findMany({ where: { active: true }, orderBy: { id: 'asc' } });
  if (channels.length < 3) {
    const want = [['Розница', 'retail', '#2a78d6'], ['Instagram', 'online', '#eb6834'], ['Маркетплейс', 'marketplace', '#1baf7a'], ['Опт', 'wholesale', '#eda100']];
    for (const [name, type, color] of want.filter(([n]) => !channels.some((c) => c.name === n))) {
      const c = await prisma.salesChannel.create({ data: { name, type, color } });
      created.channels.push(c.id); channels.push(c);
    }
  }
  const chWeights = channels.map((c) => ({ retail: 6, online: 3, marketplace: 3, wholesale: 0.4 }[c.type] || 1));
  const wholesale = channels.find((c) => c.type === 'wholesale') || channels[0];
  const pickChannel = () => { let r = Math.random() * chWeights.reduce((a, b) => a + b, 0); for (let i = 0; i < channels.length; i++) { r -= chWeights[i]; if (r <= 0) return channels[i]; } return channels[0]; };

  const people = [];
  for (const [name, type, phone, note] of [
    ['ООО «Текстиль-Опт»', 'supplier', '+7 495 100-20-30', 'Основной поставщик'],
    ['ИП Каримов (фабрика «Шёлковый путь»)', 'supplier', '+7 900 111-22-33', 'Поставщик'],
    ['ИП Соколова — бутик «Лето»', 'customer', '+7 916 555-01-01', 'Берёт под реализацию'],
    ['ООО «Модный квартал»', 'customer', '+7 926 555-02-02', 'Берёт под реализацию'],
    ['ИП Алиев — магазин «Стиль»', 'customer', '+7 903 555-03-03', 'Берёт под реализацию'],
    ['Шоу-рум «Белый лён»', 'customer', '+7 977 555-04-04', 'Берёт под реализацию'],
    ['ИП Морозова — точка на рынке', 'customer', '+7 985 555-05-05', 'Берёт под реализацию'],
    ['Анна Петрова', 'customer', '+7 999 123-45-67', 'Постоянный покупатель'],
    ['Мария Иванова', 'customer', '+7 999 765-43-21', 'Постоянный покупатель'],
  ]) {
    const c = await prisma.counterparty.create({ data: { name, type, phone, note: note + ' (демо)' } });
    created.counterparties.push(c.id); people.push(c);
  }
  await save();
  const suppliers = people.filter((p) => p.type === 'supplier');
  const partners = people.filter((p) => /реализац/.test(p.note));
  const regulars = people.filter((p) => /Постоянный/.test(p.note));

  // --- Размерные таблицы ---
  const charts = {};
  for (const [key, name, data] of [
    ['cloth', 'Женская одежда (демо)', { head: ['Размер', 'RU', 'Обхват груди, см', 'Обхват талии, см', 'Обхват бёдер, см'], rows: [['XS', '40-42', '80-84', '62-66', '88-92'], ['S', '42-44', '84-88', '66-70', '92-96'], ['M', '44-46', '88-92', '70-74', '96-100'], ['L', '46-48', '92-96', '74-78', '100-104'], ['XL', '48-50', '96-100', '78-82', '104-108']], note: 'Измеряйте по самым выступающим точкам. Если параметры между размерами — берите больший.' }],
    ['jeans', 'Джинсы (демо)', { head: ['Размер (W)', 'RU', 'Обхват талии, см', 'Обхват бёдер, см'], rows: [['26', '42', '66', '92'], ['27', '42-44', '68', '94'], ['28', '44', '71', '96'], ['29', '44-46', '73', '98'], ['30', '46', '76', '101'], ['31', '46-48', '78', '103'], ['32', '48', '81', '106']], note: '' }],
  ]) {
    const c = await prisma.sizeChart.create({ data: { name, data: JSON.stringify(data) } });
    charts[key] = c.id; created.sizeCharts.push(c.id);
  }

  // --- Категории и товары «как на WB»: модель → карточка на каждый цвет (свой артикул и фото) → размеры со штрихкодами ---
  const products = []; // то, что продаётся: размеры (или карточка без размеров)
  const BRANDS = ['Demo Wear', 'Demo Wear', 'Demo Basic', 'Urban Line']; // у демо-товаров заметно «демо» в бренде
  const SIZE_W = { XS: 0.5, S: 1, M: 1.4, L: 1.2, XL: 0.6, 26: 0.5, 27: 0.8, 28: 1.2, 29: 1.3, 30: 1.1, 31: 0.7, 32: 0.5 };
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  let n = 0, cards = 0;
  for (const cat of CATEGORIES) {
    await setStatus({ state: 'running', step: `Товары: ${cat.name}`, progress: Math.round((n / (CATEGORIES.length * perCategory)) * 40) });
    let category = await prisma.category.findUnique({ where: { name: cat.name } });
    if (!category) { category = await prisma.category.create({ data: { name: cat.name } }); created.categories.push(category.id); }
    const firstSize = cat.items[0]?.[3];
    if (!category.sizeChartId && charts[firstSize]) await prisma.category.update({ where: { id: category.id }, data: { sizeChartId: charts[firstSize] } });
    for (const [i, [name, spec, [pMin, pMax], sizeType, colorKeys, material, pattern]] of cat.items.slice(0, perCategory).entries()) {
      n++;
      const price = price90(rnd(pMin, pMax));
      const costPrice = Math.round(price * rnd(0.42, 0.55));
      const sizes = sizeType === 'one' ? [] : SIZES[sizeType];
      const onSale = Math.random() < 0.15;
      const brand = pick(BRANDS);
      const colors = colorKeys.slice(0, 3);
      const group = colors.length > 1 ? await prisma.productGroup.create({ data: {} }) : null;
      if (group) created.groups.push(group.id);
      const modelW = rnd(0.4, 2.2); // популярность модели
      for (const [k, ck] of colors.entries()) {
        const [colorName, hex] = COLORS[ck];
        const cardName = `${name}, ${colorName.toLowerCase()}`;
        const card = await prisma.product.create({ data: {
          name: cardName, sku: `${cat.code}-${1000 + i * 10 + k}`, color: colorName, brand, groupId: group?.id || null,
          description: `${name}. Материал: ${material}. Цвет: ${colorName.toLowerCase()}. Демо-товар.`,
          price, oldPrice: onSale ? price90(price * 1.25) : null, costPrice, minStock: irnd(2, 4), categoryId: category.id,
          hasVariants: sizes.length > 0, modelInfo: sizes.length ? `рост ${irnd(168, 176)} см, на модели размер ${sizes[Math.min(1, sizes.length - 1)]}` : null,
          attributes: { create: [{ name: 'Материал', value: material }, { name: 'Сезон', value: pick(['Всесезон', 'Демисезон', 'Лето', 'Зима']) }] },
        } });
        cards++; created.products.push(card.id);
        // фото карточки — в её цвете
        const imgs = [];
        for (const j of [0, 1]) {
          const file = `demo-${card.id}-${j}.svg`;
          fs.writeFileSync(path.join(UPLOAD_DIR, file), garmentSvg({ ...spec, pattern: j ? spec.pattern || pattern : spec.pattern }, hex));
          imgs.push({ productId: card.id, path: '/uploads/' + file, sort: j });
          created.images.push(file);
        }
        await prisma.productImage.createMany({ data: imgs });
        const colorW = modelW * (k === 0 ? 1.3 : rnd(0.5, 1));
        const weightBase = colorW * (price < 2500 ? 1.6 : price > 7000 ? 0.5 : 1);
        if (!sizes.length) {
          await prisma.barcode.create({ data: { productId: card.id, code: await generateEan13(), type: 'EAN13', isPrimary: true, generated: true } });
          products.push({ ...card, weight: weightBase });
          continue;
        }
        for (const [si, size] of sizes.entries()) {
          const v = await prisma.product.create({ data: { name: `${cardName} · ${size}`, parentId: card.id, color: colorName, size, sort: si, brand,
            price, oldPrice: card.oldPrice, costPrice, minStock: 1, categoryId: category.id } });
          await prisma.barcode.create({ data: { productId: v.id, code: await generateEan13(), type: 'EAN13', isPrimary: true, generated: true } });
          created.products.push(v.id);
          products.push({ ...v, weight: (weightBase * (SIZE_W[size] || 1)) / sizes.length * 2.2 });
        }
      }
    }
    await save();
  }
  // --- Продажи, приходы и реализация за период (в памяти, потом пачками) ---
  await setStatus({ state: 'running', step: 'Продажи за год', progress: 45 });
  let saleId = await maxId('sale'), itemId = await maxId('saleItem'), payId = await maxId('salePayment');
  let rcId = await maxId('receipt'), rcItemId = await maxId('receiptItem');
  const firstSale = saleId + 1, firstRc = rcId + 1;
  let saleSeq = await nextSeq('sale_seq'), rcSeq = await nextSeq('receipt_seq');
  const sales = [], items = [], payments = [], receipts = [], rcItems = [], moves = [];
  const stock = new Map(); // `${pid}:${wid}` → qty
  const st = (pid, wid) => stock.get(`${pid}:${wid}`) || 0;
  const add = (pid, wid, q) => stock.set(`${pid}:${wid}`, st(pid, wid) + q);
  const totalW = products.reduce((a, p) => a + p.weight, 0);
  const pickProduct = () => { let r = Math.random() * totalW; for (const p of products) { r -= p.weight; if (r <= 0) return p; } return products[0]; };
  const avgPerDay = 14; // единиц в день
  const lowAtEnd = new Set(products.filter(() => Math.random() < 0.08).map((p) => p.id));

  // партии в памяти: у каждого прихода своя закупочная цена (поставщик и сезон), продажа списывает FIFO
  const lots = new Map(); // `${pid}:${wid}` → [{...batch}]
  const allLots = [];
  const putLot = (pid, wid, q, cost, date, supplierId, receiptId, note) => {
    const st0 = st(pid, wid) - q; // остаток до прихода (минус гасится первым)
    const lot = { productId: pid, warehouseId: wid, quantity: q, remaining: Math.max(0, q - Math.max(0, -st0)), costPrice: cost, date, supplierId, receiptId, note, createdAt: date };
    allLots.push(lot); const key = `${pid}:${wid}`; lots.set(key, [...(lots.get(key) || []), lot]);
  };
  const takeLots = (p, wid, q) => {
    let need = q, sum = 0;
    for (const lot of lots.get(`${p.id}:${wid}`) || []) { if (need <= 0) break; const t = Math.min(need, lot.remaining); lot.remaining -= t; need -= t; sum += t * lot.costPrice; }
    if (need > 0) sum += need * p.costPrice;
    return Math.round((sum / q) * 100) / 100;
  };
  const receipt = (date, wid, list, supplier) => {
    rcId++; rcSeq++;
    let total = 0;
    // закупочная цена меняется от партии к партии: поставщик, сезон, курс
    const k = (supplier && supplier === suppliers[1] ? 0.93 : 1) * [1.02, 1, 0.98, 0.97, 0.96, 0.98, 1, 1.02, 1.04, 1.06, 1.08, 1.1][date.getMonth()] * rnd(0.97, 1.03);
    for (const { p, q } of list) {
      rcItemId++;
      const cost = Math.round(p.costPrice * k);
      rcItems.push({ id: rcItemId, receiptId: rcId, productId: p.id, quantity: q, costPrice: cost });
      moves.push({ productId: p.id, warehouseId: wid, quantity: q, type: 'RECEIPT', note: 'П-' + String(rcSeq).padStart(6, '0'), receiptId: rcId, createdAt: date });
      add(p.id, wid, q); total += q * cost;
      putLot(p.id, wid, q, cost, date, supplier?.id || null, rcId, null);
    }
    receipts.push({ id: rcId, number: 'П-' + String(rcSeq).padStart(6, '0'), date, warehouseId: wid, counterpartyId: supplier?.id || null, total, note: 'Демо' });
  };

  // Пополнение: склад держим на уровне ~1,5 месяца продаж, магазин — ~2 недели
  const restock = (date, monthsLeft) => {
    for (const [wid, cover] of [[wMain.id, 45], [wShop?.id, 14]]) {
      if (!wid) continue;
      const list = [];
      for (const p of products) {
        if (lowAtEnd.has(p.id) && monthsLeft < 1) continue;
        const daily = (p.weight / totalW) * avgPerDay * (wid === wMain.id ? 0.75 : 0.35) * 1.4;
        // в магазине держим не все размеры; закупаем партиями «кратно» и с разбросом
        if (wid !== wMain.id && Math.random() < 0.35) continue;
        const target = Math.max(wid === wMain.id ? 3 : 1, Math.ceil(daily * cover * rnd(0.6, 1.5)));
        const need = target - st(p.id, wid);
        if (need > 1 || (need > 0 && st(p.id, wid) <= 0)) list.push({ p, q: need + irnd(0, 3) });
      }
      if (list.length) receipt(date, wid, list, pick(suppliers));
    }
  };

  const sell = (date, { wid, channel, counterparty, consign, priceK = 1, lines }) => {
    saleId++; saleSeq++;
    const number = 'S-' + String(saleSeq).padStart(6, '0');
    let subtotal = 0;
    const its = [];
    for (const { p, q } of lines) {
      itemId++;
      const price = consign ? Math.round(p.price * priceK) : p.price;
      its.push({ id: itemId, saleId, productId: p.id, quantity: q, returned: 0, price, costPrice: takeLots(p, wid, q) });
      subtotal += q * price;
    }
    const discount = !consign && Math.random() < 0.12 ? Math.round(subtotal * pick([0.05, 0.1])) : 0;
    const sale = { id: saleId, number, date, status: 'completed', channelId: channel?.id || null, counterpartyId: counterparty?.id || null, warehouseId: wid,
      discount, total: subtotal - discount, consignment: Boolean(consign), paidAmount: consign ? 0 : subtotal - discount,
      paymentMethod: consign ? 'consignment' : pick(['cash', 'card', 'card', 'transfer']), dueDate: consign ? new Date(date.getTime() + 30 * 864e5) : null, note: 'Демо' };
    sales.push(sale); items.push(...its);
    for (const it of its) {
      moves.push({ productId: it.productId, warehouseId: wid, quantity: -it.quantity, type: 'SALE', note: number, saleId, createdAt: date });
      add(it.productId, wid, -it.quantity);
    }
    return { sale, its };
  };

  restock(atHour(day(days), 9), 12);
  const consignments = [];
  for (let d = days - 1; d >= 0; d--) {
    const date = day(d);
    if (date.getDate() === 1 || date.getDate() === 15) restock(atHour(date, 8), d / 30);
    const month = date.getMonth(), dow = date.getDay();
    const season = [0.75, 0.8, 1.25, 1.0, 1.05, 1.0, 0.9, 0.95, 1.1, 1.05, 1.3, 1.6][month];
    const weekend = dow === 0 || dow === 6 ? 1.35 : 1;
    const nSales = Math.max(1, Math.round(rnd(4, 9) * season * weekend));
    for (let k = 0; k < nSales; k++) {
      const channel = pickChannel();
      const wid = channel.type === 'retail' && wShop && Math.random() < 0.6 ? wShop.id : wMain.id;
      const lines = [];
      for (let j = 0, cnt = channel.type === 'wholesale' ? irnd(2, 4) : Math.random() < 0.7 ? 1 : irnd(2, 3); j < cnt; j++) {
        const p = pickProduct();
        if (!lines.some((l) => l.p.id === p.id)) lines.push({ p, q: channel.type === 'wholesale' ? irnd(2, 5) : 1 });
      }
      sell(atHour(date, irnd(10, 20)), { wid, channel, counterparty: Math.random() < 0.08 ? pick(regulars) : null, lines });
    }
    // Реализация: раз в ~6 дней партнёру уходит партия товара
    if (d % 9 === 3) {
      const partner = pick(partners);
      const lines = [];
      for (let j = 0, cnt = irnd(3, 6); j < cnt; j++) { const p = pickProduct(); if (!lines.some((l) => l.p.id === p.id)) lines.push({ p, q: irnd(2, 4) }); }
      consignments.push({ ...sell(atHour(date, irnd(11, 17)), { wid: wMain.id, channel: wholesale, counterparty: partner, consign: true, priceK: 0.75, lines }), age: d });
    }
  }

  // Оплаты и возвраты по реализации: старые почти закрыты, свежие — в долгу, часть просрочена
  for (const { sale, its, age } of consignments) {
    if (age > 20 && Math.random() < 0.45) {
      for (const it of its) {
        const r = Math.random() < 0.4 ? irnd(1, Math.max(1, Math.floor(it.quantity / 2))) : 0;
        if (!r) continue;
        it.returned = r;
        const date = new Date(sale.date.getTime() + irnd(10, 25) * 864e5);
        moves.push({ productId: it.productId, warehouseId: sale.warehouseId, quantity: r, type: 'RETURN', note: 'Возврат ' + sale.number, saleId: sale.id, createdAt: date });
        add(it.productId, sale.warehouseId, r);
        putLot(it.productId, sale.warehouseId, r, it.costPrice, date, null, null, 'Возврат');
      }
      sale.total = its.reduce((a, i) => a + (i.quantity - i.returned) * i.price, 0);
    }
    const share = age > 60 ? (Math.random() < 0.85 ? 1 : rnd(0.4, 0.8)) : age > 30 ? pick([1, 1, 0.5, 0.3, 0]) : pick([0, 0, 0.3, 0.5]);
    let toPay = Math.round(sale.total * share);
    const parts = toPay > 0 ? irnd(1, 3) : 0;
    for (let i = 0; i < parts; i++) {
      const amount = i === parts - 1 ? toPay : Math.round(toPay / (parts - i) * rnd(0.6, 1));
      toPay -= amount;
      payId++;
      payments.push({ id: payId, saleId: sale.id, amount, method: pick(['cash', 'transfer']), note: 'Демо', date: new Date(Math.min(Date.now(), sale.date.getTime() + irnd(5, 40) * 864e5)) });
      sale.paidAmount += amount;
    }
  }

  // --- Запись в базу пачками ---
  created.sales = [firstSale, saleId];
  created.receipts = [firstRc, rcId];
  await save();
  const steps = [['receipt', receipts], ['receiptItem', rcItems], ['sale', sales], ['saleItem', items], ['salePayment', payments], ['stockMovement', moves]];
  let done = 0;
  const totalRows = steps.reduce((a, [, rows]) => a + rows.length, 0);
  for (const [model, rows] of steps) {
    for (const part of chunks(rows)) {
      await prisma[model].createMany({ data: part });
      done += part.length;
      await setStatus({ state: 'running', step: 'Запись в базу', progress: 50 + Math.round((done / totalRows) * 48) });
    }
  }
  const stockRows = [...stock.entries()].map(([k, quantity]) => { const [productId, warehouseId] = k.split(':').map(Number); return { productId, warehouseId, quantity }; });
  for (const part of chunks(stockRows)) await prisma.stock.createMany({ data: part });
  // партии: история закупок по своей цене и остаток каждой партии после продаж (FIFO)
  for (const part of chunks(allLots)) await prisma.batch.createMany({ data: part });
  // закупочная цена в карточке — по последней партии
  const lastCost = {};
  allLots.forEach((l) => { if (l.receiptId) lastCost[l.productId] = l.costPrice; });
  for (const [pid, c] of Object.entries(lastCost)) await prisma.product.update({ where: { id: Number(pid) }, data: { costPrice: c } });
  for (const [key, value] of [['sale_seq', saleSeq], ['receipt_seq', rcSeq]]) {
    await prisma.setting.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value) } });
  }

  await save();
  const summary = { products: cards, models: n, variants: products.length, categories: CATEGORIES.length, sales: sales.length, consignments: consignments.length, receipts: receipts.length, seconds: Math.round((Date.now() - t0) / 1000) };
  await setStatus({ state: 'done', step: 'Готово', progress: 100, summary });
  return summary;
}

async function removeDemo() {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  if (!row) throw Object.assign(new Error('Демо-данные не загружены'), { status: 400 });
  const d = JSON.parse(row.value);
  const inRange = (r) => (r && r[0] <= r[1] ? { gte: r[0], lte: r[1] } : { in: [] });
  // движения по демо-продажам/приходам, затем сами документы (позиции и оплаты удаляются каскадом)
  await prisma.stockMovement.deleteMany({ where: { OR: [{ saleId: inRange(d.sales) }, { receiptId: inRange(d.receipts) }] } });
  await prisma.sale.deleteMany({ where: { id: inRange(d.sales) } });
  await prisma.receipt.deleteMany({ where: { id: inRange(d.receipts) } });
  let archived = 0;
  // сначала размеры, потом карточки
  const list = await prisma.product.findMany({ where: { id: { in: d.products } }, select: { id: true, parentId: true }, orderBy: { id: 'desc' } });
  for (const { id } of [...list.filter((x) => x.parentId), ...list.filter((x) => !x.parentId)]) {
    try { await prisma.product.delete({ where: { id } }); } catch { await prisma.product.updateMany({ where: { id }, data: { active: false } }); archived++; }
  }
  if (d.groups?.length) await prisma.productGroup.deleteMany({ where: { id: { in: d.groups }, products: { none: {} } } });
  if (d.sizeCharts?.length) await prisma.sizeChart.deleteMany({ where: { id: { in: d.sizeCharts } } });
  for (const f of d.images) fs.unlink(path.join(UPLOAD_DIR, f), () => {});
  for (const id of d.categories) await prisma.category.deleteMany({ where: { id, products: { none: {} } } });
  await prisma.counterparty.deleteMany({ where: { id: { in: d.counterparties } } });
  for (const id of d.channels) await prisma.salesChannel.deleteMany({ where: { id, sales: { none: {} } } });
  for (const id of d.warehouses) await prisma.warehouse.deleteMany({ where: { id, sales: { none: {} }, receipts: { none: {} }, stocks: { none: {} } } });
  await prisma.setting.deleteMany({ where: { key: { in: [KEY, STATUS] } } });
  return { ok: true, archived };
}

module.exports = { generateDemo, removeDemo, getStatus, setStatus };
