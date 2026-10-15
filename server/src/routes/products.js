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
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

const fullInclude = {
  barcodes: { orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }] },
  images: { orderBy: [{ sort: 'asc' }, { id: 'asc' }] },
  attributes: { orderBy: { id: 'asc' } },
  category: true,
  stocks: { include: { warehouse: true } },
};

function withTotals(p) {
  const totalStock = (p.stocks || []).reduce((s, x) => s + x.quantity, 0);
  return { ...p, totalStock };
}

// Список товаров с фильтрами и пагинацией
r.get('/', ah(async (req, res) => {
  const { q, categoryId, warehouseId, lowStock } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const where = { active: req.query.archived ? false : true };
  if (categoryId) where.categoryId = Number(categoryId);
  if (q) {
    const s = String(q).trim();
    where.OR = [{ name: like(s) }, { sku: like(s) }, { barcodes: { some: { code: like(s) } } }];
  }
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where, skip: (page - 1) * limit, take: limit, orderBy: { id: 'desc' },
      include: { barcodes: { where: { isPrimary: true } }, images: { take: 1, orderBy: { sort: 'asc' } }, category: true, stocks: warehouseId ? { where: { warehouseId: Number(warehouseId) } } : true },
    }),
    prisma.product.count({ where }),
  ]);
  let list = items.map(withTotals);
  if (lowStock) list = list.filter((p) => p.totalStock <= p.minStock);
  res.json({ items: list, total, page, limit });
}));

// Все товары для выгрузки в Excel
r.get('/export', ah(async (req, res) => {
  const list = await prisma.product.findMany({
    where: { active: true, ...(req.query.categoryId ? { categoryId: Number(req.query.categoryId) } : {}) },
    include: { barcodes: { orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }] }, attributes: { orderBy: { id: 'asc' } }, category: true, stocks: true },
    orderBy: [{ categoryId: 'asc' }, { name: 'asc' }],
  });
  res.json(list.map(withTotals));
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
  const extra = ids.length < limit ? await prisma.product.findMany({ where: { active: true, id: { notIn: ids } }, orderBy: { id: 'desc' }, take: limit - ids.length, select: { id: true } }) : [];
  const all = [...ids, ...extra.map((x) => x.id)];
  const products = await prisma.product.findMany({
    where: { id: { in: all } },
    include: { barcodes: { where: { isPrimary: true } }, images: { take: 1, orderBy: { sort: 'asc' } }, stocks: true },
  });
  const sold = Object.fromEntries(top.map((t) => [t.productId, t._sum.quantity]));
  res.json(all.map((id) => products.find((p) => p.id === id)).filter(Boolean).map((p) => ({ ...withTotals(p), sold: sold[p.id] || 0 })));
}));

// Поиск по штрихкоду или артикулу — точное совпадение (для сканера)
r.get('/lookup/:code', ah(async (req, res) => {
  const code = String(req.params.code).trim();
  let p = await prisma.product.findFirst({ where: { barcodes: { some: { code } } }, include: fullInclude });
  if (!p) p = await prisma.product.findFirst({ where: { sku: code }, include: fullInclude });
  if (!p) throw new HttpError(404, `Товар с кодом «${code}» не найден`);
  res.json(withTotals(p));
}));

r.get('/:id', ah(async (req, res) => {
  const p = await prisma.product.findUnique({ where: { id: Number(req.params.id) }, include: fullInclude });
  if (!p) throw new HttpError(404, 'Товар не найден');
  const movements = await prisma.stockMovement.findMany({ where: { productId: p.id }, include: { warehouse: true }, orderBy: { id: 'desc' }, take: 50 });
  res.json({ ...withTotals(p), movements });
}));

function pickProduct(b) {
  return {
    name: str(b.name), sku: str(b.sku), description: str(b.description), unit: b.unit || 'шт',
    price: num(b.price), oldPrice: b.oldPrice ? num(b.oldPrice) : null, costPrice: num(b.costPrice), minStock: num(b.minStock),
    categoryId: int(b.categoryId), active: b.active === undefined ? true : Boolean(b.active),
  };
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
  const p = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({ data });
    await saveRelations(tx, p.id, { ...b, barcodes: b.barcodes || [] });
    // Начальные остатки: [{warehouseId, quantity}]
    for (const s of b.initialStock || []) {
      if (num(s.quantity) !== 0 && s.warehouseId) {
        await changeStock(tx, { productId: p.id, warehouseId: Number(s.warehouseId), quantity: num(s.quantity), type: 'ADJUST', note: 'Начальный остаток' });
      }
    }
    return p;
  });
  res.status(201).json(await prisma.product.findUnique({ where: { id: p.id }, include: fullInclude }));
}));

r.put('/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data: pickProduct(req.body) });
    await saveRelations(tx, id, req.body);
  });
  res.json(await prisma.product.findUnique({ where: { id }, include: fullInclude }));
}));

r.delete('/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  const used = await prisma.saleItem.count({ where: { productId: id } }) + await prisma.receiptItem.count({ where: { productId: id } });
  if (used) {
    await prisma.product.update({ where: { id }, data: { active: false } });
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
        if (!existing && barcode) existing = await tx.product.findFirst({ where: { barcodes: { some: { code: barcode } } } });
        if (!existing && sku) existing = await tx.product.findUnique({ where: { sku } });
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
        if (existing) {
          product = await tx.product.update({ where: { id: existing.id }, data: { ...data, active: true } });
        } else {
          product = await tx.product.create({ data });
        }
        // штрихкод: свой или автоматический EAN-13
        if (barcode) {
          const owner = await tx.barcode.findUnique({ where: { code: barcode } });
          if (owner && owner.productId !== product.id) throw new HttpError(400, `штрихкод ${barcode} уже у другого товара`);
          if (!owner) {
            const hasPrimary = await tx.barcode.count({ where: { productId: product.id, isPrimary: true } });
            await tx.barcode.create({ data: { productId: product.id, code: barcode, type: detectBarcodeType(barcode), isPrimary: !hasPrimary } });
          }
        } else if (!existing) {
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
          if (diff) await changeStock(tx, { productId: product.id, warehouseId, quantity: diff, type: 'ADJUST', note: 'Импорт из Excel' });
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
    created.push(await prisma.productImage.create({ data: { productId, path: '/uploads/' + f.filename, sort: count + i } }));
  }
  res.status(201).json(created);
}));

r.put('/:id/images/order', ah(async (req, res) => {
  const ids = req.body.ids || [];
  await prisma.$transaction(ids.map((imgId, i) => prisma.productImage.update({ where: { id: Number(imgId) }, data: { sort: i } })));
  res.json({ ok: true });
}));

r.delete('/:id/images/:imageId', ah(async (req, res) => {
  const img = await prisma.productImage.delete({ where: { id: Number(req.params.imageId) } });
  fs.unlink(path.join(UPLOAD_DIR, path.basename(img.path)), () => {});
  res.json({ ok: true });
}));

module.exports = r;
