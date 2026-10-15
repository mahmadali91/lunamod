const express = require('express');
const prisma = require('../db');
const { ah } = require('../util');

const r = express.Router();
const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

r.get('/', ah(async (req, res) => {
  const days = Math.min(365, Number(req.query.days) || 30);
  const now = new Date();
  const from = new Date(now); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - days + 1);
  const prevFrom = new Date(from); prevFrom.setDate(prevFrom.getDate() - days);
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

  const [sales, prevSales, products, channels, recent, counts] = await Promise.all([
    prisma.sale.findMany({ where: { date: { gte: from }, status: 'completed' }, include: { items: { include: { product: { include: { images: { take: 1 } } } } }, channel: true } }),
    prisma.sale.findMany({ where: { date: { gte: prevFrom, lt: from }, status: 'completed' }, select: { total: true } }),
    prisma.product.findMany({ where: { active: true }, include: { stocks: true, images: { take: 1 } } }),
    prisma.salesChannel.findMany(),
    prisma.sale.findMany({ take: 8, orderBy: { id: 'desc' }, include: { channel: true, counterparty: true } }),
    Promise.all([prisma.counterparty.count(), prisma.warehouse.count({ where: { active: true } })]),
  ]);
  const consign = await prisma.sale.findMany({ where: { consignment: true, status: 'completed' }, select: { total: true, paidAmount: true } });
  const consignmentDebt = consign.reduce((a, s) => a + Math.max(0, s.total - s.paidAmount), 0);

  const revenue = sales.reduce((s, x) => s + x.total, 0);
  const prevRevenue = prevSales.reduce((s, x) => s + x.total, 0);
  const cost = sales.reduce((s, x) => s + x.items.reduce((a, i) => a + i.costPrice * (i.quantity - i.returned), 0), 0);
  const today = sales.filter((s) => s.date >= todayStart);

  // График по дням
  const byDay = {};
  for (let i = 0; i < days; i++) { const d = new Date(from); d.setDate(d.getDate() + i); byDay[dayKey(d)] = { date: dayKey(d), revenue: 0, count: 0 }; }
  sales.forEach((s) => { const k = dayKey(s.date); if (byDay[k]) { byDay[k].revenue += s.total; byDay[k].count += 1; } });

  // По каналам
  const byChannel = {};
  sales.forEach((s) => {
    const k = s.channelId || 0;
    byChannel[k] = byChannel[k] || { id: k, name: s.channel?.name || 'Без канала', color: s.channel?.color || '#94a3b8', revenue: 0, count: 0 };
    byChannel[k].revenue += s.total; byChannel[k].count += 1;
  });

  // Топ товаров
  const top = {};
  sales.forEach((s) => s.items.forEach((i) => {
    top[i.productId] = top[i.productId] || { id: i.productId, name: i.product.name, image: i.product.images[0]?.path, quantity: 0, revenue: 0 };
    const q = i.quantity - i.returned;
    top[i.productId].quantity += q; top[i.productId].revenue += q * i.price;
  }));

  let stockValue = 0, stockRetail = 0;
  const low = [];
  products.forEach((p) => {
    const q = p.stocks.reduce((a, s) => a + s.quantity, 0);
    stockValue += q * p.costPrice; stockRetail += q * p.price;
    if (q <= p.minStock) low.push({ id: p.id, name: p.name, sku: p.sku, quantity: q, minStock: p.minStock, image: p.images[0]?.path });
  });

  res.json({
    days,
    kpi: {
      revenue, prevRevenue, profit: revenue - cost, salesCount: sales.length, avgCheck: sales.length ? revenue / sales.length : 0,
      todayRevenue: today.reduce((s, x) => s + x.total, 0), todayCount: today.length,
      productsCount: products.length, consignmentDebt, consignmentOpen: consign.filter((s) => s.total - s.paidAmount > 0.009).length, stockValue, stockRetail, counterparties: counts[0], warehouses: counts[1],
    },
    chart: Object.values(byDay),
    byChannel: Object.values(byChannel).sort((a, b) => b.revenue - a.revenue),
    channels: channels.length,
    topProducts: Object.values(top).sort((a, b) => b.revenue - a.revenue).slice(0, 7),
    lowStock: low.sort((a, b) => a.quantity - b.quantity).slice(0, 10),
    lowStockCount: low.length,
    recentSales: recent,
  });
}));

module.exports = r;
