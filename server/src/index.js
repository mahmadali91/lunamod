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
// Основной домен (CANONICAL_HOST в настройках сервера): все другие домены, привязанные к этой папке, и http
// переадресуются на https://основной-домен — одна страница в поисковиках, одна корзина и вход у покупателя
const CANONICAL = (process.env.CANONICAL_HOST || '').trim().toLowerCase();
if (CANONICAL) {
  app.use((req, res, next) => {
    const host = String(req.headers.host || '').toLowerCase().split(':')[0];
    const local = !host || host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
    if (!local && (host !== CANONICAL || req.headers['x-forwarded-proto'] === 'http') && req.method === 'GET' && !req.path.startsWith('/api/')) {
      return res.redirect(301, `https://${CANONICAL}${req.originalUrl}`);
    }
    next();
  });
}
// запросы из браузера с чужих сайтов не разрешаем: только тот же домен, основной домен и SITE_URL
const OWN_HOSTS = new Set([CANONICAL, (() => { try { return new URL(process.env.SITE_URL || '').host.toLowerCase(); } catch { return ''; } })()].filter(Boolean));
app.use(cors((req, cb) => {
  let host = '';
  try { host = new URL(req.headers.origin || '').host.toLowerCase(); } catch { /* нет Origin — обычный запрос */ }
  const own = !host || host === String(req.headers.host || '').toLowerCase() || OWN_HOSTS.has(host) || OWN_HOSTS.has(host.replace(/^www\./, ''));
  cb(null, { origin: own });
}));
// заголовки безопасности: без чужих фреймов (кликджекинг), без угадывания типа файлов, HTTPS для браузера
app.use((req, res, next) => {
  // запрет фреймов только для программы учёта: витрину Метрика (Вебвизор) показывает во фрейме
  if (req.path.startsWith('/admin') || req.path.startsWith('/api/')) res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()' });
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
});
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

// Интернет-магазин: публичное API (вход покупателей по email)
app.use('/api/shop', require('./routes/shop').router);

// задача для капчи (вход в программу, код на email в магазине)
app.get('/api/captcha', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(require('./captcha').createChallenge()); });
app.use('/api/auth', auth);
// VK ID возвращает сюда после входа (без заголовка входа в программу — проверка по одноразовому state)
app.get('/api/vk/oauth', async (req, res) => {
  try {
    if (req.query.error) throw new Error(String(req.query.error_description || req.query.error));
    await require('./vk').oauthCallback({ code: String(req.query.code || ''), state: String(req.query.state || ''), device_id: String(req.query.device_id || '') });
    res.redirect('/admin/vk?vkid=ok');
  } catch (e) {
    res.redirect('/admin/vk?vkid=' + encodeURIComponent(e.message.slice(0, 200)));
  }
});
// скачивание резервной копии по одноразовой ссылке из «Настроек» (браузер качает файл сам, без заголовка входа)
app.get('/api/backup/:kind(db|uploads)', async (req, res) => {
  let p;
  try { p = require('jsonwebtoken').verify(String(req.query.t || ''), (process.env.JWT_SECRET || 'change-me-please') + ':backup'); } catch { p = null; }
  if (!p || p.purpose !== 'backup' || p.kind !== req.params.kind) return res.status(403).send('Ссылка устарела. Нажмите кнопку скачивания в «Настройках» ещё раз.');
  const { dumpDatabase, archiveUploads } = require('./backup');
  const day = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.kind === 'db' ? `sklad-db-${day}.sql.gz` : `sklad-uploads-${day}.tar.gz`}"`);
  res.setHeader('Cache-Control', 'no-store');
  try { await (req.params.kind === 'db' ? dumpDatabase(res) : archiveUploads(res)); }
  catch (e) { console.error('backup', e); res.destroy(e); }
});
app.use('/api', requireAuth);
app.use('/api/users', users);
app.use('/api/warehouses', refs.warehouses);
app.use('/api/channels', refs.channels);
app.use('/api/counterparties', refs.counterparties);
app.use('/api/categories', refs.categories);
app.use('/api/size-charts', refs.sizeCharts);
app.use('/api/products', require('./routes/products'));
app.use('/api/stock', stock);
app.use('/api/receipts', receipts);
app.use('/api/sales', require('./routes/sales'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/wb', require('./routes/wb'));
app.use('/api/vk', require('./routes/vk'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/chats', require('./routes/chats').chats);
app.use('/api/push', require('./routes/chats').push);
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Собранный фронтенд
const dist = process.env.CLIENT_DIST || path.join(__dirname, '..', '..', 'client', 'dist');
const seo = require('./seo');
app.get('/robots.txt', (req, res, next) => seo.robots(req, res).catch(next));
app.get('/sitemap.xml', (req, res, next) => seo.sitemap(req, res).catch(next));
app.get('/manifest.webmanifest', (req, res, next) => seo.manifest(req, res).catch(next));
app.get(['/feed.yml', '/feed.xml'], (req, res, next) => seo.feed(req, res).catch(next));
if (fs.existsSync(dist)) {
  // Страница магазина собирается как shop.html (не index.html), чтобы веб-сервер хостинга не отдавал её
  // напрямую: каждую страницу витрины формирует сервер — с заголовками и разметкой для поисковиков
  app.use(express.static(dist, { index: false }));
  // /admin — программа учёта, остальное — витрина магазина
  app.get(['/admin', '/admin/*'], (req, res) => res.sendFile(path.join(dist, 'admin', 'index.html')));
  app.get('*', (req, res) => seo.renderShop(req, res, dist).catch((e) => { console.error('shop page:', e.message); res.sendFile(path.join(dist, 'shop.html')); }));
}

app.use((err, req, res, next) => {
  if (err.code === 'P2002') return res.status(400).json({ error: `Значение уже используется (${err.meta?.target || 'уникальное поле'})` });
  if (err.code === 'P2025') return res.status(404).json({ error: 'Запись не найдена' });
  if (err.code === 'P2003') return res.status(400).json({ error: 'Запись используется в других документах' });
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Внутренняя ошибка сервера' });
});

require('./jobs').start();
require('./upgrade').runUpgrades();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
  // недосланные рассылки (сервер перезапускался) — продолжаем
  setTimeout(() => require('./routes/customers').resumeBulks().catch((e) => console.error('рассылки:', e.message)), 5000).unref();
});
