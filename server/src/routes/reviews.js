// Отзывы покупателей: модерация и ответ магазина
const express = require('express');
const fs = require('fs');
const path = require('path');
const prisma = require('../db');
const { ah, HttpError, str } = require('../util');
const { UPLOAD_DIR } = require('../paths');

const r = express.Router();

r.get('/', ah(async (req, res) => {
  if (req.query.count) {
    const counts = await prisma.review.groupBy({ by: ['status'], _count: true });
    return res.json({ counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) });
  }
  const where = req.query.status ? { status: String(req.query.status) } : {};
  const [items, counts] = await Promise.all([
    prisma.review.findMany({ where, orderBy: { id: 'desc' }, take: 300, include: { customer: { select: { name: true, phone: true } }, product: { select: { id: true, name: true, sku: true, images: { where: { kind: 'image' }, take: 1, orderBy: { sort: 'asc' }, select: { path: true } } } } } }),
    prisma.review.groupBy({ by: ['status'], _count: true }),
  ]);
  res.json({ items: items.map((x) => ({ ...x, photos: JSON.parse(x.photos || '[]') })), counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) });
}));

r.put('/:id', ah(async (req, res) => {
  const data = {};
  if (req.body.status !== undefined) {
    if (!['pending', 'published', 'rejected'].includes(req.body.status)) throw new HttpError(400, 'Неверный статус');
    data.status = req.body.status;
  }
  if (req.body.reply !== undefined) data.reply = str(req.body.reply)?.slice(0, 3000) || null;
  res.json(await prisma.review.update({ where: { id: Number(req.params.id) }, data }));
}));

r.delete('/:id', ah(async (req, res) => {
  const x = await prisma.review.delete({ where: { id: Number(req.params.id) } });
  JSON.parse(x.photos || '[]').forEach((f) => fs.unlink(path.join(UPLOAD_DIR, f.replace('/uploads/', '')), () => {}));
  res.json({ ok: true });
}));

module.exports = r;
