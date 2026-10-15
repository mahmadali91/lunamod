const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const prisma = require('../db');
const { ah, HttpError, generateEan13, detectBarcodeType, changeStock, num, int, str, like } = require('../util');

const r = express.Router();
const { UPLOAD_DIR } = require('../paths');
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  // фото (кроме SVG) и короткие видео
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif|heic|avif)$/.test(file.mimetype) || /^video\/(mp4|webm|quicktime)$/.test(file.mimetype)),
});

const variantInclude = { barcodes: { orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }] }, stocks: { include: { warehouse: true } } };
const fullInclude = {
  barcodes: { orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }] },
  images: { orderBy: [{ sort: 'asc' }, { id: 'asc' }] },
  attributes: { orderBy: { id: 'asc' } },
  category: true,
  stocks: { include: { warehouse: true } },
  parent: { select: { id: true, name: true, sku: true } },
  variants: { where: { active: true }, include: variantInclude, orderBy: [{ sort: 'asc' }, { id: 'asc' }] },
  looks: { include: { linked: { select: { id: true, name: true, sku: true, price: true, images: { take: 1, orderBy: { sort: 'asc' } } } } }, orderBy: { sort: 'asc' } },
};

// Остаток карточки с вариантами — сумма остатков вариантов
function withTotals(p) {
  const own = (p.stocks || []).reduce((s, x) => s + x.quantity, 0);
  const totalStock = p.hasVariants ? (p.variants || []).reduce((s, v) => s + (v.stocks || []).reduce((a, x) => a + x.quantity, 0), 0) : own;
  return { ...p, totalStock };
}

// Название варианта: «Платье Лето · Красный · M» — так он виден везде (касса, продажи, этикетки, отчёты)
const variantName = (name, color, size) => [name, color, size].filter(Boolean).join(' · ');

// Короткий адрес для магазина: транслит названия
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const slugify = (s) => String(s || '').toLowerCase().split('').map((c) => (TR[c] !== undefined ? TR[c] : c)).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// Список товаров с фильтрами и пагинацией
r.get('/', ah(async (req, res) => {
  const { q, categoryId, warehouseId, lowStock } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const where = { active: req.query.archived ? false : true };
  // sellable=1 — то, что можно продать/оприходовать: простые товары и варианты (касса, приход, этикетки);
  // иначе — карточки товаров (варианты внутри карточки)
  const sellable = Boolean(req.query.sellable);
  if (sellable) where.hasVariants = false; else where.parentId = null;
  if (categoryId) where.categoryId = Number(categoryId);
  if (q) {
    const s = String(q).trim();
    where.OR = [{ name: like(s) }, { sku: like(s) }, { barcodes: { some: { code: like(s) } } },
      ...(sellable ? [{ parent: { sku: like(s) } }] : [{ variants: { some: { active: true, barcodes: { some: { code: like(s) } } } } }])];
  }
  const stocks = warehouseId ? { where: { warehouseId: Number(warehouseId) } } : true;
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where, skip: (page - 1) * limit, take: limit, orderBy: { id: 'desc' },
      include: { barcodes: { where: { isPrimary: true } }, images: { take: 1, orderBy: { sort: 'asc' } }, category: true, stocks,
        parent: { select: { id: true, name: true, sku: true, images: { take: 1, orderBy: { sort: 'asc' } } } },
        variants: { where: { active: true }, select: { id: true, color: true, size: true, stocks } } },
    }),
    prisma.product.count({ where }),
  ]);
  // у варианта без своих фото показываем фото карточки
  let list = items.map((p) => ({ ...withTotals(p), images: p.images.length ? p.images : p.parent?.images || [], sku: p.sku || p.parent?.sku || null }));
  if (lowStock) list = list.filter((p) => p.totalStock <= p.minStock);
  res.json({ items: list, total, page, limit });
}));

// Все товары для выгрузки в Excel
r.get('/export', ah(async (req, res) => {
  const list = await prisma.product.findMany({
    where: { active: true, hasVariants: false, ...(req.query.categoryId ? { categoryId: Number(req.query.categoryId) } : {}) },
    include: { barcodes: { orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }] }, attributes: { orderBy: { id: 'asc' } }, category: true, stocks: true,
      parent: { select: { name: true, sku: true, description: true, attributes: { orderBy: { id: 'asc' } } } } },
    orderBy: [{ categoryId: 'asc' }, { name: 'asc' }],
  });
  // вариант выгружается строкой с артикулом и названием карточки + цвет и размер
  res.json(list.map((p) => withTotals(p.parent ? { ...p, name: p.parent.name, sku: p.parent.sku, description: p.parent.description, attributes: p.parent.attributes } : p)));
}));

// Самые продаваемые товары (для подсказки в кассе)
r.get('/popular', ah(async (req, res) => {
  const limit = Math.min(30, Number(req.query.limit) || 10);
  const since = new Date(Date.now() - 90 * 864e5);
  const top = await prisma.saleItem.groupBy({
    by: ['productId'], _sum: { quantity: true },
    where: { sale: { date: { gte: since }, status: 'completed' }, product: { active: true } },
    orderBy: { _sum: { quantity: 'desc' } }, take: limit,
  });
  const ids = top.map((t) => t.productId);
  // Если продаж мало — добираем новыми товарами
  const extra = ids.length < limit ? await prisma.product.findMany({ where: { active: true, hasVariants: false, id: { notIn: ids } }, orderBy: { id: 'desc' }, take: limit - ids.length, select: { id: true } }) : [];
  const all = [...ids, ...extra.map((x) => x.id)];
  const products = await prisma.product.findMany({
    where: { id: { in: all } },
    include: { barcodes: { where: { isPrimary: true } }, images: { take: 1, orderBy: { sort: 'asc' } }, stocks: true, parent: { select: { sku: true, images: { take: 1, orderBy: { sort: 'asc' } } } } },
  });
  products.forEach((p) => { if (!p.images.length && p.parent) p.images = p.parent.images; if (!p.sku && p.parent) p.sku = p.parent.sku; });
  const sold = Object.fromEntries(top.map((t) => [t.productId, t._sum.quantity]));
  res.json(all.map((id) => products.find((p) => p.id === id)).filter(Boolean).map((p) => ({ ...withTotals(p), sold: sold[p.id] || 0 })));
}));

// Поиск по штрихкоду или артикулу — точное совпадение (для сканера)
r.get('/lookup/:code', ah(async (req, res) => {
  const code = String(req.params.code).trim();
  let p = await prisma.product.findFirst({ where: { barcodes: { some: { code } } }, include: fullInclude });
  if (!p) p = await prisma.product.findFirst({ where: { sku: code }, include: fullInclude });
  if (!p) throw new HttpError(404, `Товар с кодом «${code}» не найден`);
  if (p.hasVariants && req.query.sellable) throw new HttpError(409, `У артикула ${code} есть размеры/цвета — отсканируйте штрихкод нужного размера или выберите его в поиске`);
  if (p.parentId && !p.images.length) p.images = await prisma.productImage.findMany({ where: { productId: p.parentId }, orderBy: { sort: 'asc' } });
  res.json(withTotals(p));
}));

r.get('/:id', ah(async (req, res) => {
  const p = await prisma.product.findUnique({ where: { id: Number(req.params.id) }, include: fullInclude });
  if (!p) throw new HttpError(404, 'Товар не найден');
  const ids = p.hasVariants ? p.variants.map((v) => v.id) : [p.id];
  const [movements, batches, suppliers] = await Promise.all([
    prisma.stockMovement.findMany({ where: { productId: { in: ids } }, include: { warehouse: true, product: { select: { name: true } } }, orderBy: { id: 'desc' }, take: 50 }),
    prisma.batch.findMany({ where: { productId: { in: ids } }, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 200, include: { product: { select: { color: true, size: true } } } }),
    prisma.counterparty.findMany({ select: { id: true, name: true } }),
  ]);
  const wh = Object.fromEntries((await prisma.warehouse.findMany({ select: { id: true, name: true } })).map((w) => [w.id, w.name]));
  const sup = Object.fromEntries(suppliers.map((c) => [c.id, c.name]));
  const left = batches.filter((b) => b.remaining > 0);
  const qty = left.reduce((a, b) => a + b.remaining, 0);
  res.json({
    ...withTotals(p), movements,
    batches: batches.map((b) => ({ ...b, warehouse: wh[b.warehouseId], supplier: sup[b.supplierId] || null, variant: [b.product.color, b.product.size].filter(Boolean).join(' · ') || null })),
    // средняя себестоимость остатка по партиям
    avgCost: qty > 0 ? Math.round((left.reduce((a, b) => a + b.remaining * b.costPrice, 0) / qty) * 100) / 100 : null,
  });
}));

function pickProduct(b) {
  return {
    name: str(b.name), sku: str(b.sku), description: str(b.description), unit: b.unit || 'шт',
    price: num(b.price), oldPrice: b.oldPrice ? num(b.oldPrice) : null, costPrice: num(b.costPrice), minStock: num(b.minStock),
    weight: b.weight === '' || b.weight === null || b.weight === undefined ? null : num(b.weight),
    categoryId: int(b.categoryId), active: b.active === undefined ? true : Boolean(b.active),
    showInShop: b.showInShop === undefined ? true : Boolean(b.showInShop),
    brand: str(b.brand), modelInfo: str(b.modelInfo), sizeChartId: int(b.sizeChartId),
  };
}

// Поля карточки, которые повторяются у вариантов
const SHARED = ['description', 'unit', 'oldPrice', 'minStock', 'weight', 'categoryId', 'active', 'showInShop', 'brand'];

/**
 * Варианты карточки: [{ id?, color, size, barcode, price, costPrice, quantity }] (quantity — начальный остаток нового варианта).
 * Новые создаются, изменённые обновляются, удалённые из списка — удаляются (или в архив, если по ним были движения).
 */
async function saveVariants(tx, parent, list, warehouseId) {
  const rows = (list || []).map((v, i) => ({ ...v, color: str(v.color), size: str(v.size), sort: i })).filter((v) => v.color || v.size);
  const seen = new Set();
  for (const v of rows) {
    const k = `${(v.color || '').toLowerCase()}|${(v.size || '').toLowerCase()}`;
    if (seen.has(k)) throw new HttpError(400, `Вариант «${[v.color, v.size].filter(Boolean).join(' / ')}» указан дважды`);
    seen.add(k);
  }
  const existing = await tx.product.findMany({ where: { parentId: parent.id } });
  if (rows.length && !parent.hasVariants) {
    const own = await tx.stock.aggregate({ where: { productId: parent.id }, _sum: { quantity: true } });
    if (Math.abs(own._sum.quantity || 0) > 1e-9) throw new HttpError(400, `У товара есть остаток (${own._sum.quantity}) без размера. Обнулите его в «Остатках» или оформите на нужный размер, затем добавьте размеры и цвета`);
  }
  const shared = Object.fromEntries(SHARED.map((k) => [k, parent[k]]));
  const keep = new Set();
  for (const v of rows) {
    const data = { ...shared, name: variantName(parent.name, v.color, v.size), color: v.color, size: v.size, sort: v.sort,
      price: v.price === '' || v.price === undefined || v.price === null ? parent.price : num(v.price),
      costPrice: v.costPrice === '' || v.costPrice === undefined || v.costPrice === null ? parent.costPrice : num(v.costPrice), active: parent.active };
    let child = v.id ? existing.find((e) => e.id === Number(v.id)) : null;
    if (!child) child = existing.find((e) => (e.color || '') === (v.color || '') && (e.size || '') === (v.size || ''));
    if (child) child = await tx.product.update({ where: { id: child.id }, data });
    else child = await tx.product.create({ data: { ...data, parentId: parent.id } });
    keep.add(child.id);
    // штрихкод варианта: свой или автоматический EAN-13
    const code = str(v.barcode)?.replace(/\s/g, '');
    const primary = await tx.barcode.findFirst({ where: { productId: child.id, isPrimary: true } });
    if (code && code !== primary?.code) {
      await checkBarcodes(tx, [code], child.id);
      const same = await tx.barcode.findUnique({ where: { code } });
      if (primary) await tx.barcode.update({ where: { id: primary.id }, data: { isPrimary: false } });
      if (same) await tx.barcode.update({ where: { id: same.id }, data: { isPrimary: true } });
      else await tx.barcode.create({ data: { productId: child.id, code, type: detectBarcodeType(code), isPrimary: true } });
    } else if (!primary) {
      await tx.barcode.create({ data: { productId: child.id, code: await generateEan13(tx), type: 'EAN13', isPrimary: true, generated: true } });
    }
    if (warehouseId && num(v.quantity) > 0 && !existing.some((e) => e.id === child.id)) {
      await changeStock(tx, { productId: child.id, warehouseId: Number(warehouseId), quantity: num(v.quantity), type: 'ADJUST', note: 'Начальный остаток', cost: data.costPrice });
    }
  }
  for (const e of existing.filter((x) => !keep.has(x.id))) {
    const used = await tx.saleItem.count({ where: { productId: e.id } }) + await tx.receiptItem.count({ where: { productId: e.id } }) + await tx.orderItem.count({ where: { productId: e.id } }) + await tx.stockMovement.count({ where: { productId: e.id } });
    if (used) await tx.product.update({ where: { id: e.id }, data: { active: false } });
    else await tx.product.delete({ where: { id: e.id } });
  }
  await tx.product.update({ where: { id: parent.id }, data: { hasVariants: rows.length > 0 } });
}

// Без списка вариантов — только обновить у вариантов общие поля карточки
async function syncVariants(tx, parent) {
  const kids = await tx.product.findMany({ where: { parentId: parent.id } });
  for (const k of kids) {
    await tx.product.update({ where: { id: k.id }, data: { ...Object.fromEntries(SHARED.filter((f) => f !== 'active').map((f) => [f, parent[f]])), name: variantName(parent.name, k.color, k.size) } });
  }
}

async function saveLooks(tx, productId, ids) {
  if (!Array.isArray(ids)) return;
  await tx.productLink.deleteMany({ where: { productId } });
  const uniq = [...new Set(ids.map(Number).filter((x) => x && x !== productId))].slice(0, 12);
  for (const [i, linkedId] of uniq.entries()) await tx.productLink.create({ data: { productId, linkedId, sort: i } });
}

async function checkBarcodes(tx, codes, productId) {
  const seen = new Set();
  for (const c of codes) {
    if (seen.has(c)) throw new HttpError(400, `Штрихкод ${c} указан дважды`);
    seen.add(c);
    const ex = await tx.barcode.findUnique({ where: { code: c }, include: { product: true } });
    if (ex && ex.productId !== productId) throw new HttpError(400, `Штрихкод ${c} уже используется у товара «${ex.product.name}»`);
  }
}

async function saveRelations(tx, productId, b) {
  // Характеристики
  if (Array.isArray(b.attributes)) {
    await tx.productAttribute.deleteMany({ where: { productId } });
    const attrs = b.attributes.filter((a) => str(a.name) && str(a.value)).map((a) => ({ productId, name: str(a.name), value: str(a.value) }));
    if (attrs.length) await tx.productAttribute.createMany({ data: attrs });
  }
  // Штрихкоды: список строк, первый — основной. Пусто → генерируем EAN-13
  if (Array.isArray(b.barcodes)) {
    const codes = b.barcodes.map((c) => String(typeof c === 'object' ? c.code : c).trim()).filter(Boolean);
    await checkBarcodes(tx, codes, productId);
    const old = await tx.barcode.findMany({ where: { productId } });
    await tx.barcode.deleteMany({ where: { productId } });
    if (!codes.length) codes.push(await generateEan13(tx));
    for (let i = 0; i < codes.length; i++) {
      const prev = old.find((o) => o.code === codes[i]);
      await tx.barcode.create({ data: { productId, code: codes[i], type: detectBarcodeType(codes[i]), isPrimary: i === 0, generated: prev ? prev.generated : codes[i].startsWith('200') && codes[i].length === 13 } });
    }
  }
}

r.post('/', ah(async (req, res) => {
  const b = req.body;
  const data = pickProduct(b);
  if (!data.name) throw new HttpError(400, 'Укажите название товара');
  const withVariants = Array.isArray(b.variants) && b.variants.some((v) => str(v.color) || str(v.size));
  const p = await prisma.$transaction(async (tx) => {
    let p = await tx.product.create({ data });
    p = await tx.product.update({ where: { id: p.id }, data: { slug: slugify(data.name) || null } });
    if (withVariants) {
      // у карточки с вариантами штрихкоды и остатки — у каждого варианта
      await saveRelations(tx, p.id, { ...b, barcodes: undefined });
      await saveVariants(tx, p, b.variants, b.variantWarehouseId || b.initialStock?.[0]?.warehouseId);
    } else {
      await saveRelations(tx, p.id, { ...b, barcodes: b.barcodes || [] });
      // Начальные остатки: [{warehouseId, quantity}]
      for (const s of b.initialStock || []) {
        if (num(s.quantity) !== 0 && s.warehouseId) {
          await changeStock(tx, { productId: p.id, warehouseId: Number(s.warehouseId), quantity: num(s.quantity), type: 'ADJUST', note: 'Начальный остаток', cost: data.costPrice });
        }
      }
    }
    await saveLooks(tx, p.id, b.lookIds);
    return p;
  }, { timeout: 30000 });
  res.status(201).json(await prisma.product.findUnique({ where: { id: p.id }, include: fullInclude }));
}));

r.put('/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  await prisma.$transaction(async (tx) => {
    const cur = await tx.product.findUnique({ where: { id } });
    if (!cur) throw new HttpError(404, 'Товар не найден');
    const data = pickProduct(req.body);
    if (!cur.slug || cur.name !== data.name) data.slug = slugify(data.name) || null;
    const p = await tx.product.update({ where: { id }, data });
    if (Array.isArray(req.body.variants)) {
      await saveRelations(tx, id, req.body.variants.some((v) => str(v.color) || str(v.size)) ? { ...req.body, barcodes: undefined } : req.body);
      await saveVariants(tx, p, req.body.variants, req.body.variantWarehouseId);
      if (!req.body.variants.some((v) => str(v.color) || str(v.size)) && !(await tx.barcode.count({ where: { productId: id } }))) {
        await tx.barcode.create({ data: { productId: id, code: await generateEan13(tx), type: 'EAN13', isPrimary: true, generated: true } });
      }
    } else {
      await saveRelations(tx, id, cur.hasVariants ? { ...req.body, barcodes: undefined } : req.body);
      if (cur.hasVariants) await syncVariants(tx, p);
    }
    await saveLooks(tx, id, req.body.lookIds);
  }, { timeout: 30000 });
  res.json(await prisma.product.findUnique({ where: { id }, include: fullInclude }));
}));

r.delete('/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  const ids = [id, ...(await prisma.product.findMany({ where: { parentId: id }, select: { id: true } })).map((x) => x.id)];
  const used = await prisma.saleItem.count({ where: { productId: { in: ids } } }) + await prisma.receiptItem.count({ where: { productId: { in: ids } } }) + await prisma.orderItem.count({ where: { productId: { in: ids } } });
  if (used) {
    await prisma.product.updateMany({ where: { id: { in: ids } }, data: { active: false } });
    return res.json({ ok: true, archived: true });
  }
  const imgs = await prisma.productImage.findMany({ where: { productId: id } });
  await prisma.product.delete({ where: { id } });
  imgs.forEach((i) => fs.unlink(path.join(UPLOAD_DIR, path.basename(i.path)), () => {}));
  res.json({ ok: true });
}));

// Импорт товаров: [{ name, sku, barcode, category, price, oldPrice, costPrice, unit, minStock, quantity, description, attributes: {Размер: 'M'} }]
// Поиск существующего товара: по штрихкоду, затем по артикулу. Количество = фактический остаток на выбранном складе.
r.post('/import', ah(async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 5000) : [];
  const warehouseId = int(req.body.warehouseId);
  if (!rows.length) throw new HttpError(400, 'Файл пустой');
  const report = { created: 0, updated: 0, skipped: 0, errors: [] };
  const catCache = {};
  for (const [i, row] of rows.entries()) {
    const line = row._line || i + 2;
    try {
      const result = await prisma.$transaction(async (tx) => {
        const barcode = str(row.barcode)?.replace(/\s/g, '');
        const sku = str(row.sku);
        let existing = null;
        if (row.id) existing = await tx.product.findUnique({ where: { id: Number(row.id) } });
        if (existing?.hasVariants) throw new HttpError(400, 'у карточки есть размеры — укажите цвет/размер или штрихкод варианта');
        if (!existing && barcode) existing = await tx.product.findFirst({ where: { barcodes: { some: { code: barcode } } } });
        if (!existing && sku && !str(row.color) && !str(row.size)) existing = await tx.product.findUnique({ where: { sku } });
        if (!existing && !str(row.name)) throw new HttpError(400, 'не указано название');

        let categoryId;
        const cat = str(row.category);
        if (cat) {
          if (!catCache[cat]) catCache[cat] = (await tx.category.findUnique({ where: { name: cat } })) || (await tx.category.create({ data: { name: cat } }));
          categoryId = catCache[cat].id;
        }
        const data = {};
        if (str(row.name)) data.name = str(row.name);
        if (sku) data.sku = sku;
        if (str(row.description)) data.description = str(row.description);
        if (str(row.unit)) data.unit = str(row.unit);
        const LABEL = { price: 'Цена', costPrice: 'Закупочная цена', minStock: 'Мин. остаток', oldPrice: 'Старая цена' };
        for (const k of ['price', 'costPrice', 'minStock', 'oldPrice']) {
          if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
            const v = Number(String(row[k]).replace(/\s/g, '').replace(',', '.'));
            if (isNaN(v)) throw new HttpError(400, `неверное число в колонке «${LABEL[k]}»: ${row[k]}`);
            data[k] = v;
          }
        }
        if (categoryId) data.categoryId = categoryId;

        let product;
        const color = str(row.color), size = str(row.size);
        if (color || size) {
          // строка-вариант: карточка ищется по артикулу (или названию), вариант — по штрихкоду или цвету+размеру
          let parent = existing?.parentId ? await tx.product.findUnique({ where: { id: existing.parentId } }) : null;
          if (!parent && sku) parent = await tx.product.findUnique({ where: { sku } });
          if (!parent && data.name) parent = await tx.product.findFirst({ where: { name: data.name, parentId: null, hasVariants: true } });
          const pdata = { ...data }; delete pdata.costPrice;
          if (parent) parent = await tx.product.update({ where: { id: parent.id }, data: { ...pdata, hasVariants: true, active: true } });
          else {
            if (!data.name) throw new HttpError(400, 'не указано название');
            parent = await tx.product.create({ data: { ...data, hasVariants: true, slug: slugify(data.name) } });
          }
          let child = existing?.parentId === parent.id ? existing : await tx.product.findFirst({ where: { parentId: parent.id, color, size } });
          const cdata = { name: variantName(parent.name, color, size), color, size, price: data.price ?? child?.price ?? parent.price, costPrice: data.costPrice ?? child?.costPrice ?? parent.costPrice,
            categoryId: parent.categoryId, unit: parent.unit, oldPrice: parent.oldPrice, showInShop: parent.showInShop, active: true };
          const wasNew = !child;
          if (child) product = await tx.product.update({ where: { id: child.id }, data: cdata });
          else product = await tx.product.create({ data: { ...cdata, parentId: parent.id, sort: await tx.product.count({ where: { parentId: parent.id } }) } });
          if (wasNew && !barcode) await tx.barcode.create({ data: { productId: product.id, code: await generateEan13(tx), type: 'EAN13', isPrimary: true, generated: true } });
          existing = wasNew ? null : product;
        } else if (existing) {
          product = await tx.product.update({ where: { id: existing.id }, data: { ...data, active: true } });
        } else {
          product = await tx.product.create({ data: { ...data, slug: slugify(data.name) } });
        }
        // штрихкод: свой или автоматический EAN-13
        if (barcode) {
          const owner = await tx.barcode.findUnique({ where: { code: barcode } });
          if (owner && owner.productId !== product.id) throw new HttpError(400, `штрихкод ${barcode} уже у другого товара`);
          if (!owner) {
            const hasPrimary = await tx.barcode.count({ where: { productId: product.id, isPrimary: true } });
            await tx.barcode.create({ data: { productId: product.id, code: barcode, type: detectBarcodeType(barcode), isPrimary: !hasPrimary } });
          }
        } else if (!existing && !(await tx.barcode.count({ where: { productId: product.id } }))) {
          await tx.barcode.create({ data: { productId: product.id, code: await generateEan13(tx), type: 'EAN13', isPrimary: true, generated: true } });
        }
        // характеристики: обновляем/добавляем указанные
        for (const [name, value] of Object.entries(row.attributes || {})) {
          if (!str(value)) continue;
          const a = await tx.productAttribute.findFirst({ where: { productId: product.id, name } });
          if (a) await tx.productAttribute.update({ where: { id: a.id }, data: { value: str(value) } });
          else await tx.productAttribute.create({ data: { productId: product.id, name, value: str(value) } });
        }
        // остаток на складе
        if (warehouseId && row.quantity !== undefined && row.quantity !== null && String(row.quantity).trim() !== '') {
          const q = Number(String(row.quantity).replace(',', '.'));
          if (isNaN(q)) throw new HttpError(400, `неверное количество: ${row.quantity}`);
          const cur = await tx.stock.findUnique({ where: { productId_warehouseId: { productId: product.id, warehouseId } } });
          const diff = q - (cur?.quantity || 0);
          if (diff) await changeStock(tx, { productId: product.id, warehouseId, quantity: diff, type: 'ADJUST', note: 'Импорт из Excel', cost: product.costPrice });
        }
        return existing ? 'updated' : 'created';
      });
      report[result]++;
    } catch (e) {
      report.errors.push({ line, name: row.name || row.sku || row.barcode || '', error: e.status ? e.message : e.code === 'P2002' ? 'артикул или штрихкод уже используется' : 'ошибка: ' + e.message.split('\n').pop() });
      if (report.errors.length > 200) break;
    }
  }
  res.json(report);
}));

// Сгенерировать новый свободный EAN-13 (для формы)
r.post('/generate-barcode', ah(async (req, res) => {
  res.json({ code: await prisma.$transaction((tx) => generateEan13(tx)) });
}));

// Фото
r.post('/:id/images', upload.array('images', 20), ah(async (req, res) => {
  const productId = Number(req.params.id);
  const count = await prisma.productImage.count({ where: { productId } });
  const created = [];
  for (const [i, f] of (req.files || []).entries()) {
    if (!f.mimetype.startsWith('video/') && f.size > 10 * 1024 * 1024) { fs.unlink(f.path, () => {}); throw new HttpError(400, `Фото «${f.originalname}» больше 10 МБ`); }
    created.push(await prisma.productImage.create({ data: { productId, path: '/uploads/' + f.filename, sort: count + i, kind: f.mimetype.startsWith('video/') ? 'video' : 'image' } }));
  }
  res.status(201).json(created);
}));

r.put('/:id/images/order', ah(async (req, res) => {
  const ids = req.body.ids || [];
  await prisma.$transaction(ids.map((imgId, i) => prisma.productImage.update({ where: { id: Number(imgId) }, data: { sort: i } })));
  res.json({ ok: true });
}));

// цвет фото (для карточки с вариантами)
r.put('/:id/images/:imageId', ah(async (req, res) => {
  res.json(await prisma.productImage.update({ where: { id: Number(req.params.imageId) }, data: { color: str(req.body.color) } }));
}));

r.delete('/:id/images/:imageId', ah(async (req, res) => {
  const img = await prisma.productImage.delete({ where: { id: Number(req.params.imageId) } });
  fs.unlink(path.join(UPLOAD_DIR, path.basename(img.path)), () => {});
  res.json({ ok: true });
}));

module.exports = r;
module.exports.slugify = slugify;
module.exports.variantName = variantName;
