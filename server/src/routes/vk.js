// Раздел «Сообщества ВК» в админке: подключение сообществ, посты → товары, товары → «Товары» ВК
const express = require('express');
const { ah, HttpError } = require('../util');
const { requireAdmin } = require('../auth');
const vk = require('../vk');

const r = express.Router();

r.get('/', ah(async (req, res) => {
  const s = await require('../shop/settings').getShopSettings();
  res.json({ groups: await vk.listGroups(), keys: await vk.keysStatus(), feedUrl: String(s.siteUrl || '').replace(/\/$/, '') + '/feed.yml' });
}));
r.post('/groups', requireAdmin, ah(async (req, res) => res.status(201).json(await vk.addGroup(req.body || {}))));
r.delete('/groups/:id(\\d+)', requireAdmin, ah(async (req, res) => { await vk.removeGroup(req.params.id); res.json({ ok: true }); }));
r.put('/keys', requireAdmin, ah(async (req, res) => res.json(await vk.setKeys(req.body || {}))));

// посты сообщества блоками (с разобранным черновиком товара)
r.get('/groups/:id(\\d+)/posts', ah(async (req, res) => res.json(await vk.loadPosts(req.params.id, { offset: req.query.offset, count: req.query.count }))));
// добавить товар из поста
r.post('/import', ah(async (req, res) => {
  const b = req.body || {};
  if (!b.groupId || !b.postId) throw new HttpError(400, 'Не указан пост');
  res.status(201).json(await vk.importPost(b));
}));
// ещё цвета той же модели (копии карточки)
r.post('/colors', ah(async (req, res) => res.status(201).json({ cards: await vk.addColors(req.body?.cardId, req.body?.colors) })));

// выгрузка в «Товары» ВК
r.get('/market/categories', ah(async (req, res) => res.json(await vk.marketCategories())));
r.post('/market/export', ah(async (req, res) => res.json({ results: await vk.exportToMarket(req.body?.groupId, req.body?.cardIds, Number(req.body?.categoryId) || null) })));
r.get('/market/exported', ah(async (req, res) => res.json(await vk.getJson('vk_market', {}))));

module.exports = r;
