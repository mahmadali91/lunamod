const express = require('express');
const { ah } = require('../util');
const { requireAdmin } = require('../auth');
const jwt = require('jsonwebtoken');
const { backupInfo } = require('../backup');
const { generateDemo, removeDemo, getStatus, setStatus } = require('../demo/generate');

const r = express.Router();
r.use(requireAdmin);

r.get('/demo', ah(async (req, res) => res.json(await getStatus())));

// Загрузка идёт в фоне (может занять до минуты), статус — GET /api/admin/demo
r.post('/demo', ah(async (req, res) => {
  const s = await getStatus();
  if (s.loaded) return res.status(400).json({ error: 'Демо-данные уже загружены' });
  if (s.state === 'running' && Date.now() - new Date(s.at).getTime() < 5 * 60e3) return res.status(400).json({ error: 'Загрузка уже идёт' });
  const opts = { perCategory: Math.min(5, Number(req.body.perCategory) || 5), days: Math.min(365, Number(req.body.days) || 365) };
  await setStatus({ state: 'running', step: 'Подготовка', progress: 0 });
  generateDemo(opts).catch(async (e) => { console.error(e); await setStatus({ state: 'error', error: e.message }); });
  res.status(202).json({ ok: true });
}));

r.delete('/demo', ah(async (req, res) => res.json(await removeDemo())));

// Резервная копия: размеры и одноразовая ссылка на скачивание (живёт 2 минуты)
r.get('/backup', ah(async (req, res) => res.json(await backupInfo())));
r.post('/backup/link', ah(async (req, res) => {
  const kind = req.body.kind === 'uploads' ? 'uploads' : 'db';
  const t = jwt.sign({ purpose: 'backup', kind, uid: req.user.id }, (process.env.JWT_SECRET || 'change-me-please') + ':backup', { expiresIn: '2m' });
  res.json({ url: `/api/backup/${kind}?t=${encodeURIComponent(t)}` });
}));

module.exports = r;
