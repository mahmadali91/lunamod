const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { ah, HttpError, str } = require('../util');
const { sign, requireAuth, requireAdmin } = require('../auth');

const r = express.Router();

r.post('/login', ah(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { login: String(req.body.login || '').trim() } });
  if (!u || !(await bcrypt.compare(String(req.body.password || ''), u.password))) throw new HttpError(401, 'Неверный логин или пароль');
  res.json({ token: sign(u), user: { id: u.id, login: u.login, name: u.name, role: u.role } });
}));

r.get('/me', requireAuth, (req, res) => res.json(req.user));

r.post('/password', requireAuth, ah(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!(await bcrypt.compare(String(req.body.oldPassword || ''), u.password))) throw new HttpError(400, 'Старый пароль неверен');
  if (String(req.body.newPassword || '').length < 6) throw new HttpError(400, 'Пароль минимум 6 символов');
  await prisma.user.update({ where: { id: u.id }, data: { password: await bcrypt.hash(req.body.newPassword, 10) } });
  res.json({ ok: true });
}));

// Управление пользователями (только админ)
const users = express.Router();
users.use(requireAdmin);
users.get('/', ah(async (req, res) => res.json(await prisma.user.findMany({ select: { id: true, login: true, name: true, role: true, createdAt: true } }))));
users.post('/', ah(async (req, res) => {
  const b = req.body;
  if (!str(b.login) || String(b.password || '').length < 6) throw new HttpError(400, 'Логин и пароль (мин. 6 символов) обязательны');
  const u = await prisma.user.create({ data: { login: str(b.login), name: str(b.name) || str(b.login), role: b.role === 'seller' ? 'seller' : 'admin', password: await bcrypt.hash(b.password, 10) } });
  res.status(201).json({ id: u.id, login: u.login, name: u.name, role: u.role });
}));
users.delete('/:id', ah(async (req, res) => {
  if (Number(req.params.id) === req.user.id) throw new HttpError(400, 'Нельзя удалить себя');
  await prisma.user.delete({ where: { id: Number(req.params.id) } });
  res.json({ ok: true });
}));

module.exports = { auth: r, users };
