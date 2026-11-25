const express = require('express');
const prisma = require('../db');
const { ah, HttpError, changeStock, nextNumber, num, int, str, fillImages } = require('../util');
const { getShopSettings, tbankReady } = require('../shop/settings');
const tbank = require('../shop/tbank');

const r = express.Router();
const include = {
  channel: true, counterparty: true, warehouse: true,
  items: { include: { product: { include: { barcodes: { where: { isPrimary: true } }, images: { where: { kind: 'image' }, take: 1, orderBy: { sort: 'asc' } } } } } },
  payments: { orderBy: { id: 'asc' } },
};
const loadSale = async (id) => {
  const s = await prisma.sale.findUnique({ where: { id }, include });
  if (s) await fillImages(s.items.map((i) => i.product));
  return s;
};

const round = (v) => Math.round(v * 100) / 100;
const withDebt = (s) => ({ ...s, debt: s.consignment && s.status !== 'returned' ? Math.max(0, round(s.total - s.paidAmount)) : 0 });

r.get('/', ah(async (req, res) => {
  const where = {};
  if (req.query.channelId) where.channelId = Number(req.query.channelId);
  if (req.query.counterpartyId) where.counterpartyId = Number(req.query.counterpartyId);
  if (req.query.warehouseId) where.warehouseId = Number(req.query.warehouseId);
  if (req.query.status) where.status = String(req.query.status);
  if (req.query.consignment) where.consignment = true;
  if (req.query.from || req.query.to) {
    where.date = {};
    if (req.query.from) where.date.gte = new Date(req.query.from);
    if (req.query.to) { const t = new Date(req.query.to); t.setHours(23, 59, 59, 999); where.date.lte = t; }
  }
  if (req.query.q) where.number = { contains: String(req.query.q) };
  let list = (await prisma.sale.findMany({ where, include: { channel: true, counterparty: true, warehouse: true, _count: { select: { items: true } } }, orderBy: { id: 'desc' }, take: Number(req.query.limit) || 300 })).map(withDebt);
  if (req.query.open) list = list.filter((s) => s.debt > 0);
  res.json(list);
}));

// Сводка долгов по реализации в разрезе контрагентов
r.get('/consignment/summary', ah(async (req, res) => {
  const sales = (await prisma.sale.findMany({ where: { consignment: true, status: 'completed' }, include: { counterparty: true } })).map(withDebt).filter((s) => s.debt > 0);
  const by = {};
  sales.forEach((s) => {
    const k = s.counterpartyId || 0;
    by[k] = by[k] || { id: k, name: s.counterparty?.name || 'Без контрагента', phone: s.counterparty?.phone, debt: 0, count: 0, oldest: s.date };
    by[k].debt = round(by[k].debt + s.debt); by[k].count += 1;
    if (s.date < by[k].oldest) by[k].oldest = s.date;
  });
  const now = new Date();
  res.json({
    totalDebt: round(sales.reduce((a, s) => a + s.debt, 0)),
    openCount: sales.length,
    overdue: sales.filter((s) => s.dueDate && s.dueDate < now).length,
    byCounterparty: Object.values(by).sort((a, b) => b.debt - a.debt),
  });
}));

r.get('/:id', ah(async (req, res) => {
  const s = await loadSale(Number(req.params.id));
  if (!s) throw new HttpError(404, 'Продажа не найдена');
  res.json(withDebt(s));
}));

r.post('/', ah(async (req, res) => {
  const b = req.body;
  const items = (b.items || []).filter((i) => i.productId && num(i.quantity) > 0);
  if (!b.warehouseId) throw new HttpError(400, 'Выберите склад');
  if (!items.length) throw new HttpError(400, 'Корзина пуста');
  const consignment = Boolean(b.consignment);
  if (consignment && !b.counterpartyId) throw new HttpError(400, 'Для продажи под реализацию выберите контрагента');
  const sale = await prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, 'sale_seq', 'S-');
    const subtotal = items.reduce((s, i) => s + num(i.quantity) * num(i.price), 0);
    const discount = Math.min(num(b.discount), subtotal);
    const total = round(subtotal - discount);
    const sale = await tx.sale.create({ data: {
      number, warehouseId: Number(b.warehouseId), channelId: int(b.channelId), counterpartyId: int(b.counterpartyId),
      discount, total, consignment,
      paymentMethod: consignment ? 'consignment' : b.paymentMethod || 'cash',
      paidAmount: consignment ? Math.min(num(b.prepaid), total) : total,
      dueDate: consignment && b.dueDate ? new Date(b.dueDate) : null,
      note: str(b.note), date: b.date ? new Date(b.date) : new Date(),
    } });
    if (consignment && num(b.prepaid) > 0) {
      await tx.salePayment.create({ data: { saleId: sale.id, amount: Math.min(num(b.prepaid), total), method: b.paymentMethod || 'cash', note: 'Предоплата' } });
    }
    for (const i of items) {
      const p = await tx.product.findUnique({ where: { id: Number(i.productId) } });
      if (!p) throw new HttpError(400, 'Товар не найден');
      if (p.hasVariants) throw new HttpError(400, `У «${p.name}» есть размеры/цвета — выберите конкретный вариант`);
      const it = await tx.saleItem.create({ data: { saleId: sale.id, productId: p.id, quantity: num(i.quantity), price: num(i.price), costPrice: p.costPrice } });
      // Продавать можно и при нулевом остатке — остаток уходит в минус. Себестоимость — по списанным партиям (FIFO)
      const mv = await changeStock(tx, { productId: p.id, warehouseId: sale.warehouseId, quantity: -num(i.quantity), type: 'SALE', note: number, saleId: sale.id, saleItemId: it.id });
      await tx.saleItem.update({ where: { id: it.id }, data: { costPrice: mv.cost } });
    }
    return sale;
  });
  res.status(201).json(withDebt(await loadSale(sale.id)));
}));

// Оплата по реализации
r.post('/:id/payments', ah(async (req, res) => {
  const id = Number(req.params.id);
  const amount = round(num(req.body.amount));
  await prisma.$transaction(async (tx) => {
    const s = await tx.sale.findUnique({ where: { id } });
    if (!s) throw new HttpError(404, 'Продажа не найдена');
    if (!s.consignment) throw new HttpError(400, 'Это не продажа под реализацию');
    const debt = round(s.total - s.paidAmount);
    if (amount <= 0) throw new HttpError(400, 'Укажите сумму оплаты');
    if (amount > debt) throw new HttpError(400, `Сумма больше долга (${debt})`);
    await tx.salePayment.create({ data: { saleId: id, amount, method: req.body.method || 'cash', note: str(req.body.note), date: req.body.date ? new Date(req.body.date) : new Date() } });
    await tx.sale.update({ where: { id }, data: { paidAmount: round(s.paidAmount + amount) } });
  });
  res.json(withDebt(await loadSale(id)));
}));

// Пересчёт суммы после возврата части товаров
async function recalc(tx, id) {
  const s = await tx.sale.findUnique({ where: { id }, include: { items: true } });
  const subtotal = s.items.reduce((a, i) => a + (i.quantity - i.returned) * i.price, 0);
  const allReturned = s.items.every((i) => i.returned >= i.quantity);
  const total = round(Math.max(0, subtotal - Math.min(s.discount, subtotal)));
  await tx.sale.update({ where: { id }, data: {
    total, status: allReturned ? 'returned' : 'completed',
    paidAmount: s.consignment ? s.paidAmount : total,
  } });
}

// Частичный возврат (например, непроданный товар с реализации)
r.post('/:id/return-items', ah(async (req, res) => {
  const id = Number(req.params.id);
  await prisma.$transaction(async (tx) => {
    const s = await tx.sale.findUnique({ where: { id }, include: { items: true } });
    if (!s) throw new HttpError(404, 'Продажа не найдена');
    let any = false;
    for (const r of req.body.items || []) {
      const q = num(r.quantity);
      if (q <= 0) continue;
      const it = s.items.find((i) => i.id === Number(r.saleItemId));
      if (!it) throw new HttpError(400, 'Позиция не найдена');
      if (q > it.quantity - it.returned) throw new HttpError(400, `Нельзя вернуть больше, чем продано (${it.quantity - it.returned})`);
      await tx.saleItem.update({ where: { id: it.id }, data: { returned: it.returned + q } });
      await changeStock(tx, { productId: it.productId, warehouseId: s.warehouseId, quantity: q, type: 'RETURN', note: `Возврат ${s.number}`, saleId: s.id, saleItemId: it.id });
      any = true;
    }
    if (!any) throw new HttpError(400, 'Укажите количество для возврата');
    await recalc(tx, id);
    const after = await tx.sale.findUnique({ where: { id } });
    if (after.consignment && after.paidAmount > after.total + 0.001) throw new HttpError(400, 'По продаже уже оплачено больше, чем останется после возврата');
  });
  res.json(withDebt(await loadSale(id)));
}));

// Полный возврат: всё непроданное возвращается на склад
r.post('/:id/return', ah(async (req, res) => {
  const id = Number(req.params.id);
  await prisma.$transaction(async (tx) => {
    const s = await tx.sale.findUnique({ where: { id }, include: { items: true } });
    if (!s) throw new HttpError(404, 'Продажа не найдена');
    if (s.status === 'returned') throw new HttpError(400, 'Уже возвращена');
    for (const i of s.items) {
      const q = i.quantity - i.returned;
      if (q <= 0) continue;
      await tx.saleItem.update({ where: { id: i.id }, data: { returned: i.quantity } });
      await changeStock(tx, { productId: i.productId, warehouseId: s.warehouseId, quantity: q, type: 'RETURN', note: `Возврат ${s.number}`, saleId: s.id, saleItemId: i.id });
    }
    await tx.sale.update({ where: { id }, data: { status: 'returned' } });
  });
  res.json(withDebt(await loadSale(id)));
}));


// ---------- оплата продажи по QR-коду СБП через Т-Банк ----------
// Создаёт платёж в Т-Банке и возвращает ссылку-платёж, из которой на кассе рисуем QR-код.
r.post('/:id(\\d+)/sbp-qr', ah(async (req, res) => {
  const sale = await prisma.sale.findUnique({ where: { id: Number(req.params.id) }, include: { items: { include: { product: { select: { name: true } } } }, counterparty: true } });
  if (!sale) throw new HttpError(404, 'Продажа не найдена');
  const s = await getShopSettings();
  if (!tbankReady(s)) throw new HttpError(400, 'Оплата Т-Банк не настроена — заполните ключи в «Настройки магазина → Оплата»');
  if (s.sbpEnabled !== '1') throw new HttpError(400, 'СБП выключена в настройках магазина');
  const phone = String(sale.counterparty && sale.counterparty.phone || s.phone || '').replace(/\D/g, '');
  if (phone.length !== 11) throw new HttpError(400, 'Чтобы выставить счёт через СБП, укажите телефон покупателя (или телефон магазина в настройках)');
  const orderLike = { id: sale.id, number: sale.number, total: sale.total, phone, deliveryPrice: 0, items: sale.items.map((i) => ({ name: i.product?.name || 'Товар #' + i.productId, price: i.price, quantity: i.quantity })) };
  const p = await tbank.initPayment(s, orderLike);
  const qr = await tbank.getQr(s, p.PaymentId);
  await prisma.sale.update({ where: { id: sale.id }, data: { sbpPaymentId: String(p.PaymentId) } });
  res.json({ paymentId: String(p.PaymentId), paymentUrl: qr });
}));

// Статус оплаты по СБП для продажи
r.get('/:id(\\d+)/sbp-status', ah(async (req, res) => {
  const sale = await prisma.sale.findUnique({ where: { id: Number(req.params.id) } });
  if (!sale) throw new HttpError(404, 'Продажа не найдена');
  if (!sale.sbpPaymentId) throw new HttpError(400, 'Для этой продажи платёж СБП не создавался');
  const s = await getShopSettings();
  const st = await tbank.getState(s, sale.sbpPaymentId);
  const paid = ['CONFIRMED', 'AUTHORIZED'].includes(String(st.Status));
  res.json({ status: st.Status || null, paid });
}));

module.exports = r;
