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
