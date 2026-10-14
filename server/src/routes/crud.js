// Универсальный CRUD для простых справочников
const express = require('express');
const prisma = require('../db');
const { ah, HttpError, like } = require('../util');

module.exports = function crud(model, { pick, searchFields = ['name'], include, orderBy = { id: 'desc' }, beforeDelete }) {
  const r = express.Router();

  r.get('/', ah(async (req, res) => {
    const where = {};
    if (req.query.q) where.OR = searchFields.map((f) => ({ [f]: like(String(req.query.q)) }));
    if (req.query.type) where.type = String(req.query.type);
    res.json(await prisma[model].findMany({ where, include, orderBy }));
  }));

  r.get('/:id', ah(async (req, res) => {
    const item = await prisma[model].findUnique({ where: { id: Number(req.params.id) }, include });
    if (!item) throw new HttpError(404, 'Не найдено');
    res.json(item);
  }));

  r.post('/', ah(async (req, res) => {
    const data = pick(req.body);
    if (!data.name) throw new HttpError(400, 'Укажите название');
    res.status(201).json(await prisma[model].create({ data }));
  }));

  r.put('/:id', ah(async (req, res) => {
    res.json(await prisma[model].update({ where: { id: Number(req.params.id) }, data: pick(req.body) }));
  }));

  r.delete('/:id', ah(async (req, res) => {
    const id = Number(req.params.id);
    if (beforeDelete) await beforeDelete(id);
    await prisma[model].delete({ where: { id } });
    res.json({ ok: true });
  }));

  return r;
};
