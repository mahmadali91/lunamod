const express = require('express');
const prisma = require('../db');
const { ah } = require('../util');
const { requireAdmin } = require('../auth');

const r = express.Router();
const PUBLIC_KEYS = { storeName: 'Мой магазин', currency: '₽' };

r.get('/', ah(async (req, res) => {
  const rows = await prisma.setting.findMany({ where: { key: { in: Object.keys(PUBLIC_KEYS) } } });
  const out = { ...PUBLIC_KEYS };
  rows.forEach((x) => { out[x.key] = x.value; });
  res.json(out);
}));

r.put('/', requireAdmin, ah(async (req, res) => {
  for (const key of Object.keys(PUBLIC_KEYS)) {
    if (req.body[key] !== undefined) {
      const value = String(req.body[key]);
      await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
    }
  }
  res.json({ ok: true });
}));

module.exports = r;
