// Статистика: сквозная аналитика (выручка → себестоимость → прибыль → расходы канала → ROMI) и ABC-анализ
const express = require('express');
const prisma = require('../db');
const { ah, HttpError, num, str } = require('../util');

const r = express.Router();
const round = (v) => Math.round(v * 100) / 100;

function period(q) {
  const to = q.to ? new Date(q.to) : new Date();
  to.setHours(23, 59, 59, 999);
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - 29 * 864e5);
  from.setHours(0, 0, 0, 0);
  if (from > to) throw new HttpError(400, 'Дата «с» позже даты «по»');
  return { from, to };
}

// Строки продаж за период за вычетом возвратов. Скидка распределяется по позициям пропорционально сумме.
async function lines({ from, to }, extraWhere = {}) {
  const sales = await prisma.sale.findMany({
    where: { date: { gte: from, lte: to }, status: 'completed', ...extraWhere },
    include: { items: { include: { product: { select: { id: true, name: true, sku: true, categoryId: true, category: { select: { name: true } }, images: { where: { kind: 'image' }, take: 1, orderBy: { sort: 'asc' }, select: { path: true } }, size: true, color: true, groupId: true, parent: { select: { id: true, name: true, sku: true, color: true, groupId: true, images: { where: { kind: 'image' }, take: 1, orderBy: { sort: 'asc' }, select: { path: true } } } } } } } }, channel: true, counterparty: true, warehouse: true },
  });
  const out = [];
  for (const s of sales) {
    const gross = s.items.reduce((a, i) => a + (i.quantity - i.returned) * i.price, 0);
    const k = gross > 0 ? s.total / gross : 1; // доля после скидки
    for (const i of s.items) {
      const q = i.quantity - i.returned;
      out.push({
        sale: s, item: i, qty: q, returnedQty: i.returned,
        revenue: q * i.price * k, cost: q * i.costPrice, returnedSum: i.returned * i.price,
      });
    }
  }
  return { sales, lines: out };
}

const GROUPS = {
  channel: (l) => [l.sale.channelId || 0, l.sale.channel?.name || 'Без канала', l.sale.channel?.color],
  category: (l) => [l.item.product.categoryId || 0, l.item.product.category?.name || 'Без категории'],
  // товары — по карточке (артикулу): все размеры и цвета вместе; variant — каждый размер/цвет отдельно
  product: (l) => { const p = l.item.product, m = p.parent || p; return [m.id, m.name, null, { sku: m.sku, image: (m.images[0] || p.images[0])?.path }]; },
  // модель (объединённая карточка): все цвета и размеры вместе
  model: (l) => { const p = l.item.product, m = p.parent || p; return [m.groupId ? 'g' + m.groupId : 'p' + m.id, m.name, null, { sku: m.sku, image: (m.images[0] || p.images[0])?.path }]; },
  size: (l) => { const z = l.item.product.size; return [z ? z.toUpperCase() : '—', z || 'Без размера']; },
  color: (l) => { const p = l.item.product; const c = p.color || p.parent?.color; return [c ? c.toLowerCase() : '—', c || 'Без цвета']; },
  variant: (l) => { const p = l.item.product; return [p.id, p.name, null, { sku: p.sku || p.parent?.sku, image: (p.images[0] || p.parent?.images[0])?.path }]; },
  counterparty: (l) => [l.sale.counterpartyId || 0, l.sale.counterparty?.name || 'Розничные покупатели'],
  warehouse: (l) => [l.sale.warehouseId, l.sale.warehouse.name],
  payment: (l) => [l.sale.paymentMethod, { cash: 'Наличные', card: 'Карта', transfer: 'Перевод', consignment: 'Реализация', tbank: 'Т-Банк онлайн' }[l.sale.paymentMethod] || l.sale.paymentMethod],
};

r.get('/', ah(async (req, res) => {
  const p = period(req.query);
  const by = GROUPS[req.query.groupBy] ? req.query.groupBy : 'channel';
  const { sales, lines: ls } = await lines(p);
  const groups = new Map();
  for (const l of ls) {
    const [id, name, color, extra] = GROUPS[by](l);
    if (!groups.has(id)) groups.set(id, { id, name, color, ...extra, revenue: 0, cost: 0, qty: 0, returnedQty: 0, returnedSum: 0, sales: new Set() });
    const g = groups.get(id);
    g.revenue += l.revenue; g.cost += l.cost; g.qty += l.qty; g.returnedQty += l.returnedQty; g.returnedSum += l.returnedSum; g.sales.add(l.sale.id);
  }
  // Расходы — только для группировки по каналам
  let expenses = {};
  if (by === 'channel') {
    const ex = await prisma.channelExpense.groupBy({ by: ['channelId'], _sum: { amount: true }, where: { date: { gte: p.from, lte: p.to } } });
    expenses = Object.fromEntries(ex.map((e) => [e.channelId, e._sum.amount || 0]));
    for (const [cid, amount] of Object.entries(expenses)) {
      if (!groups.has(Number(cid))) {
        const ch = await prisma.salesChannel.findUnique({ where: { id: Number(cid) } });
        groups.set(Number(cid), { id: Number(cid), name: ch?.name || '—', color: ch?.color, revenue: 0, cost: 0, qty: 0, returnedQty: 0, returnedSum: 0, sales: new Set() });
      }
    }
  }
  const totalRevenue = ls.reduce((a, l) => a + l.revenue, 0);
  const rows = [...groups.values()].map((g) => {
    const profit = g.revenue - g.cost;
    const expense = expenses[g.id] || 0;
    const count = g.sales.size;
    return {
      id: g.id, name: g.name, color: g.color, sku: g.sku, image: g.image,
      salesCount: count, qty: round(g.qty), revenue: round(g.revenue), cost: round(g.cost), profit: round(profit),
      margin: g.revenue ? round((profit / g.revenue) * 100) : 0, avgCheck: count ? round(g.revenue / count) : 0,
      share: totalRevenue ? round((g.revenue / totalRevenue) * 100) : 0,
      returnedQty: g.returnedQty, returnedSum: round(g.returnedSum),
      ...(by === 'channel' ? { expense: round(expense), netProfit: round(profit - expense), romi: expense ? round(((profit - expense) / expense) * 100) : null, costPerSale: expense && count ? round(expense / count) : null } : {}),
    };
  }).sort((a, b) => b.revenue - a.revenue);

  const revenue = totalRevenue, cost = ls.reduce((a, l) => a + l.cost, 0);
  const expenseTotal = Object.values(expenses).reduce((a, b) => a + b, 0);
  res.json({
    from: p.from, to: p.to, groupBy: by, rows,
    totals: {
      revenue: round(revenue), cost: round(cost), profit: round(revenue - cost), margin: revenue ? round(((revenue - cost) / revenue) * 100) : 0,
      salesCount: sales.length, qty: round(ls.reduce((a, l) => a + l.qty, 0)), avgCheck: sales.length ? round(revenue / sales.length) : 0,
      returnedSum: round(ls.reduce((a, l) => a + l.returnedSum, 0)), expense: round(expenseTotal), netProfit: round(revenue - cost - expenseTotal),
    },
  });
}));

// Динамика: по дням (до 62 дней) или по месяцам
r.get('/trend', ah(async (req, res) => {
  const p = period(req.query);
  const days = Math.round((p.to - p.from) / 864e5);
  const monthly = days > 62;
  const key = (d) => { const x = new Date(d); return monthly ? `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}` : `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const buckets = new Map();
  for (let d = new Date(p.from); d <= p.to; monthly ? d.setMonth(d.getMonth() + 1, 1) : d.setDate(d.getDate() + 1)) buckets.set(key(d), { period: key(d), revenue: 0, cost: 0, profit: 0, salesCount: 0 });
  const { sales, lines: ls } = await lines(p);
  for (const l of ls) { const b = buckets.get(key(l.sale.date)); if (b) { b.revenue += l.revenue; b.cost += l.cost; } }
  for (const s of sales) { const b = buckets.get(key(s.date)); if (b) b.salesCount++; }
  res.json({ monthly, points: [...buckets.values()].map((b) => ({ ...b, revenue: round(b.revenue), cost: round(b.cost), profit: round(b.revenue - b.cost) })) });
}));

// ABC-анализ: A — первые 80% выручки/прибыли/кол-ва, B — следующие 15%, C — остальные 5%
r.get('/abc', ah(async (req, res) => {
  const p = period(req.query);
  const by = req.query.by === 'category' ? 'category' : 'product';
  const metric = ['revenue', 'profit', 'qty'].includes(req.query.metric) ? req.query.metric : 'revenue';
  const where = req.query.categoryId ? { items: { some: { product: { categoryId: Number(req.query.categoryId) } } } } : {};
  const { lines: ls } = await lines(p, where);
  const map = new Map();
  for (const l of ls) {
    if (req.query.categoryId && l.item.product.categoryId !== Number(req.query.categoryId)) continue;
    const [id, name, , extra] = GROUPS[by](l);
    if (!map.has(id)) map.set(id, { id, name, ...extra, revenue: 0, profit: 0, qty: 0 });
    const g = map.get(id);
    g.revenue += l.revenue; g.profit += l.revenue - l.cost; g.qty += l.qty;
  }
  // Товары без продаж за период — тоже в C (если анализ по товарам)
  if (by === 'product') {
    const idle = await prisma.product.findMany({
      where: { active: true, parentId: null, id: { notIn: [...map.keys()] }, ...(req.query.categoryId ? { categoryId: Number(req.query.categoryId) } : {}) },
      select: { id: true, name: true, sku: true, images: { where: { kind: 'image' }, take: 1, orderBy: { sort: 'asc' }, select: { path: true } } },
    });
    idle.forEach((x) => map.set(x.id, { id: x.id, name: x.name, sku: x.sku, image: x.images[0]?.path, revenue: 0, profit: 0, qty: 0 }));
  }
  const rows = [...map.values()].sort((a, b) => b[metric] - a[metric]);
  const total = rows.reduce((a, x) => a + Math.max(0, x[metric]), 0);
  let cum = 0;
  const summary = { A: { count: 0, value: 0 }, B: { count: 0, value: 0 }, C: { count: 0, value: 0 } };
  for (const x of rows) {
    const v = Math.max(0, x[metric]);
    const before = total ? (cum / total) * 100 : 100;
    cum += v;
    x.share = total ? round((v / total) * 100) : 0;
    x.cumShare = total ? round((cum / total) * 100) : 100;
    // класс по накопленной доле до добавления позиции — первая позиция всегда A
    x.abc = v <= 0 ? 'C' : before < 80 ? 'A' : before < 95 ? 'B' : 'C';
    summary[x.abc].count++; summary[x.abc].value += v;
    x.revenue = round(x.revenue); x.profit = round(x.profit); x.qty = round(x.qty);
  }
  for (const k of 'ABC') summary[k].value = round(summary[k].value), summary[k].share = total ? round((summary[k].value / total) * 100) : 0;
  res.json({ from: p.from, to: p.to, by, metric, total: round(total), summary, rows });
}));

// Расходы по каналам
r.get('/expenses', ah(async (req, res) => {
  const p = period(req.query);
  res.json(await prisma.channelExpense.findMany({ where: { date: { gte: p.from, lte: p.to } }, include: { channel: true }, orderBy: { date: 'desc' } }));
}));
r.post('/expenses', ah(async (req, res) => {
  const b = req.body;
  if (!b.channelId) throw new HttpError(400, 'Выберите канал');
  if (!(num(b.amount) > 0)) throw new HttpError(400, 'Укажите сумму');
  res.status(201).json(await prisma.channelExpense.create({ data: { channelId: Number(b.channelId), amount: num(b.amount), date: b.date ? new Date(b.date) : new Date(), note: str(b.note) } }));
}));
r.delete('/expenses/:id', ah(async (req, res) => {
  await prisma.channelExpense.delete({ where: { id: Number(req.params.id) } });
  res.json({ ok: true });
}));

module.exports = r;
