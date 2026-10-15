const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { requireAuth } = require('./auth');
const { auth, users } = require('./routes/auth');
const refs = require('./routes/refs');
const { stock, receipts } = require('./routes/stock');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
const { UPLOAD_DIR } = require('./paths');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

// Проверка работоспособности (без авторизации)
// VERSION записывает скрипт деплоя (хэш коммита)
const APP_VERSION = require('../../package.json').version;
let VERSION = 'dev';
try { VERSION = fs.readFileSync(path.join(__dirname, '..', 'VERSION'), 'utf8').trim(); } catch { /* локальный запуск */ }

app.get('/api/health', async (req, res) => {
  try {
    await require('./db').$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'ok', app: APP_VERSION, version: VERSION, node: process.version });
  } catch (e) {
    res.status(500).json({ ok: false, db: 'error' });
  }
});

// Интернет-магазин: публичное API (свой вход покупателей по SMS)
app.use('/api/shop', require('./routes/shop').router);

app.use('/api/auth', auth);
app.use('/api', requireAuth);
app.use('/api/users', users);
app.use('/api/warehouses', refs.warehouses);
app.use('/api/channels', refs.channels);
app.use('/api/counterparties', refs.counterparties);
app.use('/api/categories', refs.categories);
app.use('/api/products', require('./routes/products'));
app.use('/api/stock', stock);
app.use('/api/receipts', receipts);
app.use('/api/sales', require('./routes/sales'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/chats', require('./routes/chats').chats);
app.use('/api/push', require('./routes/chats').push);
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Собранный фронтенд
const dist = process.env.CLIENT_DIST || path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  // /admin — программа учёта, остальное — витрина магазина
  app.get(['/admin', '/admin/*'], (req, res) => res.sendFile(path.join(dist, 'admin', 'index.html')));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, next) => {
  if (err.code === 'P2002') return res.status(400).json({ error: `Значение уже используется (${err.meta?.target || 'уникальное поле'})` });
  if (err.code === 'P2025') return res.status(404).json({ error: 'Запись не найдена' });
  if (err.code === 'P2003') return res.status(400).json({ error: 'Запись используется в других документах' });
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Внутренняя ошибка сервера' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер запущен: http://localhost:${PORT}`));
