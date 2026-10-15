// Раздел «Wildberries» в админке: токен, проверка, загрузка карточек
const express = require('express');
const prisma = require('../db');
const { ah, HttpError } = require('../util');
const { requireAdmin } = require('../auth');
const wb = require('../wb');

const r = express.Router();
r.use(requireAdmin);

const mask = (t) => (t ? t.slice(0, 6) + '…' + t.slice(-4) : null);

r.get('/', ah(async (req, res) => {
  const token = await wb.getToken();
  const [cards, models] = await Promise.all([prisma.product.count({ where: { wbNmId: { not: null } } }), prisma.productGroup.count({ where: { wbImtId: { not: null } } })]);
  res.json({ connected: !!token, token: mask(token), info: token ? wb.tokenInfo(token) : null, status: await wb.getStatus(), linked: { cards, models } });
}));

// Сохранить токен (проверяется запросом к WB)
r.put('/token', ah(async (req, res) => {
  const token = String(req.body.token || '').trim().replace(/^Bearer\s+/i, '');
  if (!token) { await prisma.setting.deleteMany({ where: { key: 'wb_token' } }); return res.json({ ok: true, connected: false }); }
  const info = wb.tokenInfo(token);
  if (!info) throw new HttpError(400, 'Это не похоже на токен Wildberries — скопируйте его целиком');
  if (info.expires && info.expires < new Date()) throw new HttpError(400, 'Срок действия токена истёк — создайте новый');
  if (!info.scopes.includes('Контент')) throw new HttpError(400, 'У токена нет категории «Контент» — без неё карточки не загрузить');
  await wb.wb('https://content-api.wildberries.ru/content/v2/get/cards/list', { method: 'POST', body: { settings: { cursor: { limit: 1 }, filter: { withPhoto: -1 } } }, token });
  await prisma.setting.upsert({ where: { key: 'wb_token' }, update: { value: token }, create: { key: 'wb_token', value: token } });
  res.json({ ok: true, connected: true, token: mask(token), info });
}));

// Загрузить карточки (в фоне), прогресс — GET /
r.post('/import', ah(async (req, res) => {
  if (!(await wb.getToken())) throw new HttpError(400, 'Сначала укажите токен Wildberries');
  const st = await wb.getStatus();
  if (st.state === 'running' && Date.now() - new Date(st.at).getTime() < 10 * 60e3) throw new HttpError(400, 'Загрузка уже идёт');
  await wb.setStatus({ state: 'running', step: 'Начинаю', progress: 0 });
  wb.importCards({ photos: req.body.photos === 'all' ? 'all' : 'missing' }).catch((e) => wb.setStatus({ state: 'error', error: e.message }));
  res.json({ ok: true });
}));

module.exports = r;
