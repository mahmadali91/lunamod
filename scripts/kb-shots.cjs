// Скриншоты для «Базы знаний» (Справочники → База знаний).
// Запуск на копии программы с демо-данными (не на рабочей базе!):
//   NODE_PATH=$(npm root -g) node scripts/kb-shots.cjs http://localhost:3200 ПАРОЛЬ_ADMIN [id ...]
// Картинки сохраняются в client/public/kb/*.webp (нужны Playwright и Python Pillow).
// На каждом скриншоте нужная кнопка/поле обведены рамкой с номером шага.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const [BASE = 'http://localhost:3200', PASS = 'kb-password', ...ONLY] = process.argv.slice(2);
const OUT = path.join(__dirname, '..', 'client', 'public', 'kb');
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'kb-'));
fs.mkdirSync(OUT, { recursive: true });

const NAV_ALL = JSON.stringify(['Продажи', 'Интернет-магазин', 'Товары', 'Справочники']);

// рамки с номерами поверх элементов (координаты экрана).
// Заголовок раздела (h2/h3) обводится вместе со своим блоком. Сначала один раз прокручиваем к первому элементу,
// потом меряем все — иначе прокрутка сдвигает уже посчитанные рамки.
async function mark(pg, items) {
  const handles = [];
  for (const [sel, n, opt = {}] of items) {
    const loc = typeof sel === 'string' ? pg.locator(sel).first() : sel;
    const h = await loc.elementHandle({ timeout: 2500 }).catch(() => null);
    if (!h) { console.warn('  нет элемента для отметки:', String(sel)); continue; }
    const target = await h.evaluateHandle((e, card) => (card !== false && /^H[23]$/.test(e.tagName) ? e.closest('.card, .panel') || e.parentElement : e), opt.card);
    handles.push({ el: target, n, pad: opt.pad ?? 4, side: opt.side || 'tl' });
  }
  if (!handles.length) return;
  if (!items[0]?.[2]?.noScroll) {
    await handles[0].el.evaluate((e) => {
      const r = e.getBoundingClientRect();
      if (r.top >= 70 && r.bottom <= innerHeight - 10) return;
      e.scrollIntoView({ block: r.height > innerHeight - 140 ? 'start' : 'center' });
      if (r.height > innerHeight - 140) window.scrollBy(0, -90);
    });
    await pg.waitForTimeout(300);
  }
  const boxes = [];
  for (const h of handles) { const b = await h.el.boundingBox(); if (b) boxes.push({ ...b, n: h.n, pad: h.pad, side: h.side }); }
  await pg.evaluate((boxes) => {
    document.querySelectorAll('.kb-mark').forEach((e) => e.remove());
    for (const b of boxes) {
      const top = Math.max(4, b.y - b.pad), bottom = Math.min(innerHeight - 4, b.y + b.height + b.pad);
      if (bottom <= top) continue;
      const d = document.createElement('div');
      d.className = 'kb-mark';
      Object.assign(d.style, { position: 'fixed', left: b.x - b.pad + 'px', top: top + 'px', width: b.width + b.pad * 2 + 'px', height: bottom - top + 'px', border: '3px solid #f43f5e', borderRadius: '12px', boxShadow: '0 0 0 4px rgba(244,63,94,.18)', zIndex: 99999, pointerEvents: 'none' });
      if (b.n) {
        const s = document.createElement('span');
        s.textContent = b.n;
        Object.assign(s.style, { position: 'absolute', [b.side.includes('r') ? 'right' : 'left']: '-14px', [b.side.includes('b') ? 'bottom' : 'top']: '-14px', width: '26px', height: '26px', borderRadius: '50%', background: '#f43f5e', color: '#fff', font: '700 14px/26px Inter, Arial, sans-serif', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.3)' });
        d.appendChild(s);
      }
      document.body.appendChild(d);
    }
  }, boxes);
}

async function shot(pg, name, { clip, full } = {}) {
  const png = path.join(TMP, name + '.png');
  let c;
  if (clip) {
    const loc = typeof clip === 'string' ? pg.locator(clip).first() : clip;
    const b = await loc.boundingBox();
    if (b) { const vp = pg.viewportSize(); c = { x: Math.max(0, b.x - 12), y: Math.max(0, b.y - 12), width: Math.min(vp.width - Math.max(0, b.x - 12), b.width + 24), height: Math.min(vp.height - Math.max(0, b.y - 12), b.height + 24) }; }
  }
  await pg.waitForTimeout(250);
  await pg.screenshot({ path: png, clip: c, fullPage: Boolean(full) });
  await pg.evaluate(() => document.querySelectorAll('.kb-mark').forEach((e) => e.remove()));
  execFileSync('python3', ['-c', `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
if im.width > 1400: im = im.resize((1400, round(im.height * 1400 / im.width)), Image.LANCZOS)
im.save(sys.argv[2], 'WEBP', quality=78, method=6)`, png, path.join(OUT, name + '.webp')]);
  console.log('  ✓', name);
}

const go = async (pg, url, wait = 1400) => { await pg.goto(BASE + url); await pg.waitForTimeout(wait); };
const btn = (pg, text) => pg.locator(`button:visible:has-text("${text}"), a:visible:has-text("${text}")`).first();

// ---------- сценарии: id статьи → снимки ----------
const SHOTS = {
  async 'first-steps'(pg, ctx, admin) {
    const anon = await ctx.browser().newContext({ viewport: { width: 1280, height: 760 } });
    const lp = await anon.newPage();
    await lp.goto(BASE + '/admin/login'); await lp.waitForTimeout(1000);
    await lp.fill('input:not([type=password])', 'admin'); await lp.fill('input[type=password]', '••••••••');
    await mark(lp, [['input:not([type=password])', 1], ['input[type=password]', 2], ['button[type=submit]', 3]]);
    await shot(lp, 'first-steps-1'); await anon.close();
    await go(admin, '/admin');
    await mark(admin, [['aside', 1, { pad: -2, noScroll: true }]]); await shot(admin, 'first-steps-2');
    await mark(admin, [['header input, input[placeholder*="штрихкоду"]', 1], [btn(admin, 'Продать'), 2]]); await shot(admin, 'first-steps-3');
    await mark(admin, [[btn(admin, 'Дневной'), 1, { side: 'tr' }], [btn(admin, 'Ночной'), 2, { side: 'tr' }]]); await shot(admin, 'first-steps-4');
    await go(admin, '/admin/settings');
    await mark(admin, [['h2:has-text("Сменить пароль")', 1]]); await shot(admin, 'first-steps-5');
  },
  async setup(pg, ctx, admin) {
    await go(admin, '/admin/settings');
    await mark(admin, [['h2:has-text("Магазин")', 1]]); await shot(admin, 'setup-1');
    await go(admin, '/admin/warehouses');
    await mark(admin, [[btn(admin, 'Добавить'), 1]]); await shot(admin, 'setup-2');
    await btn(admin, 'Добавить').click(); await admin.waitForTimeout(500);
    await mark(admin, [['.fixed.inset-0 .card', 0]]); await shot(admin, 'setup-3');
    await admin.keyboard.press('Escape');
    await go(admin, '/admin/channels');
    await mark(admin, [['table', 1]]); await shot(admin, 'setup-4');
    await go(admin, '/admin/settings');
    await mark(admin, [['h2:has-text("Пользователи")', 1]]); await admin.locator('h2:has-text("Пользователи")').scrollIntoViewIfNeeded(); await shot(admin, 'setup-5');
    await go(admin, '/admin/categories');
    await mark(admin, [[btn(admin, 'Добавить категорию'), 1]]); await shot(admin, 'setup-6');
    await mark(admin, [['h2:has-text("Таблицы размеров")', 1]]); await shot(admin, 'setup-7');
  },
  async 'add-product'(pg, ctx, admin) {
    await go(admin, '/admin/products');
    await mark(admin, [[btn(admin, 'Добавить товар'), 1]]); await shot(admin, 'add-product-1');
    await go(admin, '/admin/products/new');
    const name = admin.locator('label:has-text("Название") + input, label:has-text("Название") input').first();
    await name.fill('Платье миди «Лето»').catch(() => {});
    await mark(admin, [['h2:has-text("Основное")', 1]]); await shot(admin, 'add-product-2');
    await mark(admin, [['h2:has-text("Цены")', 1]]); await shot(admin, 'add-product-3');
    await mark(admin, [[btn(admin, 'Фото'), 1], [btn(admin, 'Видео'), 2]]); await shot(admin, 'add-product-4');
    const sizes = admin.locator('label:has-text("Есть размеры") input').first();
    await sizes.check().catch(() => {}); await admin.waitForTimeout(400);
    await admin.locator('button:has-text("+ XS–XL")').first().click().catch(() => {}); await admin.waitForTimeout(400);
    await mark(admin, [['h2:has-text("Баркод, размер и цена")', 1], ['label:has-text("Есть размеры")', 2], ['button:has-text("+ XS–XL")', 3]]); await shot(admin, 'add-product-5');
    await mark(admin, [[btn(admin, 'Сохранить'), 1]]); await admin.evaluate(() => window.scrollTo(0, 0)); await shot(admin, 'add-product-6');
    // готовая карточка с цветами и размерами
    const id = await admin.evaluate(async () => (await (await fetch('/api/products?limit=50', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } })).json()).items.find((p) => p.images.length && p.group?._count?.products > 1).id);
    await go(admin, '/admin/products/' + id, 2000);
    await mark(admin, [['h2:has-text("Варианты"), h3:has-text("Варианты")', 1], ['h2:has-text("Фотографии")', 2], [btn(admin, 'На сайте'), 3]]); await shot(admin, 'add-product-7');
  },
  async colors(pg, ctx, admin) {
    const id = await admin.evaluate(async () => (await (await fetch('/api/products?limit=50', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } })).json()).items.find((p) => p.images.length && p.group?._count?.products > 1).id);
    await go(admin, '/admin/products/' + id, 2000);
    const panel = admin.locator('text=Варианты').first();
    await mark(admin, [[panel, 1]]); await shot(admin, 'colors-1');
    const addColor = admin.locator('button:has-text("Добавить цвет"), button:has-text("цвет")').first();
    await mark(admin, [[addColor, 1]]); await shot(admin, 'colors-2');
    await go(pg, '/product/' + id, 2500);
    await mark(pg, [['text=Цвет:', 1], ['text=Размер', 2]]); await shot(pg, 'colors-3');
  },
  async 'import-excel'(pg, ctx, admin) {
    await go(admin, '/admin/products');
    await mark(admin, [[btn(admin, 'Выгрузить в Excel'), 1], [btn(admin, 'Загрузить из Excel'), 2]]); await shot(admin, 'import-excel-1');
    await btn(admin, 'Загрузить из Excel').click(); await admin.waitForTimeout(600);
    await shot(admin, 'import-excel-2');
    await admin.keyboard.press('Escape');
  },
  async prices(pg, ctx, admin) {
    await go(admin, '/admin/prices', 2000);
    await mark(admin, [['thead', 1]]); await shot(admin, 'prices-1');
    const cb = admin.locator('tbody input[type=checkbox]');
    for (let i = 0; i < 3; i++) await cb.nth(i).check();
    await admin.selectOption('select:has(option[value="discount"])', 'discount').catch(() => {});
    await admin.fill('input[placeholder="30"]', '20').catch(() => {});
    await mark(admin, [['tbody input[type=checkbox] >> nth=0', 1], ['select:has(option[value="discount"])', 2], ['input[placeholder="30"]', 3], [btn(admin, 'Применить'), 4]]); await shot(admin, 'prices-2');
    await btn(admin, 'Применить').click(); await admin.waitForTimeout(500);
    await mark(admin, [[btn(admin, 'Сохранить'), 1]]); await shot(admin, 'prices-3');
    await mark(admin, [[btn(admin, 'Excel'), 1], [btn(admin, 'Загрузить'), 2], [btn(admin, 'Ценники 58×40'), 3]]); await shot(admin, 'prices-4');
  },
  async labels(pg, ctx, admin) {
    const ids = await admin.evaluate(async () => (await (await fetch('/api/products?limit=3', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } })).json()).items.map((p) => p.id).join(','));
    await go(admin, '/admin/labels?ids=' + ids, 2500);
    await mark(admin, [['h2:has-text("Параметры")', 1], ['h2:has-text("Товары")', 2], ['h2:has-text("Предпросмотр")', 3], [btn(admin, 'PDF'), 4, { side: 'tr' }], [btn(admin, 'Печать'), 5, { side: 'tr' }]]); await shot(admin, 'labels-1');
  },
  async wildberries(pg, ctx, admin) {
    await go(admin, '/admin/wildberries');
    await mark(admin, [['h2:has-text("Токен API")', 1], [btn(admin, 'Проверить и сохранить'), 2]]); await shot(admin, 'wildberries-1');
  },
  async receipt(pg, ctx, admin) {
    await go(admin, '/admin/receipts');
    await mark(admin, [[btn(admin, 'Новый приход'), 1]]); await shot(admin, 'receipt-1');
    await go(admin, '/admin/receipts/new');
    await admin.selectOption('select >> nth=0', { index: 1 }).catch(() => {});
    const inp = admin.locator('input[placeholder*="штрихкод"], input[placeholder*="Скан"]').last();
    await inp.fill('Платье').catch(() => {}); await admin.waitForTimeout(900);
    await mark(admin, [['select >> nth=0', 1], [inp, 2]]); await shot(admin, 'receipt-2');
    await admin.locator('[role=option], .absolute button, ul button').first().click().catch(() => {}); await admin.waitForTimeout(600);
    await mark(admin, [['table', 1], [btn(admin, 'Провести приход'), 2]]); await shot(admin, 'receipt-3');
  },
  async stock(pg, ctx, admin) {
    await go(admin, '/admin/stock', 2000);
    await mark(admin, [[btn(admin, 'Редактировать остатки'), 1], [btn(admin, 'Перемещение'), 2], [btn(admin, 'Инвентаризация'), 3], ['label:has-text("Только заканчивающиеся")', 4]]); await shot(admin, 'stock-1');
    await btn(admin, 'Перемещение').click(); await admin.waitForTimeout(600);
    await admin.selectOption('.fixed.inset-0 select >> nth=0', { index: 1 }).catch(() => {});
    await admin.selectOption('.fixed.inset-0 select >> nth=1', { index: 2 }).catch(() => {}); await admin.waitForTimeout(800);
    await mark(admin, [['.fixed.inset-0 select >> nth=0', 1], ['.fixed.inset-0 select >> nth=1', 2], ['.fixed.inset-0 button:has-text("Переместить")', 3]]);
    await shot(admin, 'stock-2'); await admin.keyboard.press('Escape');
    await btn(admin, 'Инвентаризация').click(); await admin.waitForTimeout(600);
    await admin.selectOption('.fixed.inset-0 select >> nth=0', { index: 1 }).catch(() => {}); await admin.waitForTimeout(900);
    await mark(admin, [['.fixed.inset-0 select >> nth=0', 1], ['.fixed.inset-0 button:has-text("Сохранить остатки")', 2]]);
    await shot(admin, 'stock-3'); await admin.keyboard.press('Escape');
  },
  async sale(pg, ctx, admin) {
    await go(admin, '/admin/pos', 1800);
    await mark(admin, [['main input[placeholder*="Сканируйте"]', 1], ['main button[title*="камер"], main button[aria-label*="камер"]', 2]]); await shot(admin, 'sale-1');
    // добавляем популярные товары
    const pop = admin.locator('main button:has(img), main button:has-text("₽")');
    for (let i = 0; i < 2; i++) await pop.nth(i).click().catch(() => {});
    await admin.waitForTimeout(500);
    await admin.selectOption('main select >> nth=0', { index: 1 }).catch(() => {});
    await admin.selectOption('main select >> nth=1', { index: 1 }).catch(() => {});
    await mark(admin, [['main table, main .divide-y >> nth=0', 1], ['main select >> nth=0', 2], ['main select >> nth=1', 3]]); await shot(admin, 'sale-2');
    await mark(admin, [[btn(admin, 'Провести продажу'), 3], [btn(admin, 'Наличные'), 1], ['main input[placeholder="0"] >> nth=-1', 2]]); await shot(admin, 'sale-3');
    await go(admin, '/admin/sales', 1500);
    await admin.locator('tbody tr').first().click(); await admin.waitForTimeout(800);
    await mark(admin, [[btn(admin, 'Вернуть часть товара'), 1], [btn(admin, 'Вернуть всё'), 2]]); await shot(admin, 'sale-4');
    await admin.keyboard.press('Escape');
  },
  async consignment(pg, ctx, admin) {
    await go(admin, '/admin/consignment', 1500);
    await mark(admin, [[btn(admin, 'Отдать под реализацию'), 1], ['h2:has-text("Должники"), h3:has-text("Должники")', 2]]); await shot(admin, 'consignment-1');
    await admin.locator('tbody tr').first().click(); await admin.waitForTimeout(800);
    await shot(admin, 'consignment-2'); await admin.keyboard.press('Escape');
  },
  async stats(pg, ctx, admin) {
    await go(admin, '/admin', 1800);
    await mark(admin, [[admin.locator('main .card').first(), 1], [btn(admin, '30 дней'), 2], ['h2:has-text("Выручка по дням")', 3]]); await shot(admin, 'stats-1');
    await go(admin, '/admin/stats', 2200);
    await mark(admin, [[btn(admin, 'Этот месяц'), 1], [btn(admin, 'Сквозная аналитика'), 2], [btn(admin, 'ABC-анализ'), 3], [btn(admin, 'Расходы'), 4]]); await shot(admin, 'stats-2');
    await mark(admin, [[btn(admin, 'Модели'), 1], [btn(admin, 'Размеры'), 2], [btn(admin, 'Excel'), 3, { side: 'tr' }]]); await shot(admin, 'stats-3');
    await admin.evaluate(() => window.scrollTo(0, 0));
    await btn(admin, 'ABC-анализ').click(); await admin.waitForTimeout(1200); await shot(admin, 'stats-4');
  },
  async orders(pg, ctx, admin) {
    await go(admin, '/admin/orders', 1500);
    await mark(admin, [[btn(admin, 'В работе'), 1], ['tbody tr >> nth=0', 2]]); await shot(admin, 'orders-1');
    await admin.locator('tbody tr').first().click(); await admin.waitForTimeout(1000);
    await mark(admin, [[btn(admin, 'Подтвердить'), 1], [btn(admin, 'Лист подбора'), 2]]); await shot(admin, 'orders-2');
    await btn(admin, 'Лист подбора').click(); await admin.waitForTimeout(800);
    await mark(admin, [['.fixed.inset-0 label input[type=checkbox] >> nth=0', 1], [btn(admin, 'Скачать PDF'), 2]]); await shot(admin, 'orders-3');
    await admin.keyboard.press('Escape'); await admin.waitForTimeout(600); // лист закрылся — снова окно заказа
    await mark(admin, [[btn(admin, 'Собран / в пути'), 1], [btn(admin, 'Выдан покупателю'), 2], [btn(admin, 'Отменить'), 3]]); await shot(admin, 'orders-4');
    await admin.keyboard.press('Escape');
  },
  async 'chats-reviews'(pg, ctx, admin) {
    await go(admin, '/admin/chats', 1500);
    await admin.locator('main button, main li, main a').filter({ hasText: 'Светлана' }).first().click().catch(() => {}); await admin.waitForTimeout(1000);
    await shot(admin, 'chats-reviews-1');
    await go(admin, '/admin/reviews', 1500);
    await mark(admin, [[btn(admin, 'Опубликовать'), 1], [btn(admin, 'Ответить'), 2], [btn(admin, 'Отклонить'), 3]]); await shot(admin, 'chats-reviews-2');
  },
  async 'shop-settings'(pg, ctx, admin) {
    await go(admin, '/admin/shop-settings', 1800);
    await mark(admin, [['h2:has-text("Витрина")', 1]]); await shot(admin, 'shop-settings-1');
    for (const [h, n] of [['Доставка', 2], ['Оплата', 3], ['Уведомления о заказах', 4], ['SMS для входа', 5]]) {
      const loc = admin.locator(`h2:has-text("${h}")`).first();
      await loc.scrollIntoViewIfNeeded(); await admin.evaluate(() => window.scrollBy(0, -80));
      await mark(admin, [[loc, 1]]); await shot(admin, 'shop-settings-' + n);
    }
  },
  async 'site-buyer'(pg) {
    await go(pg, '/catalog', 2200);
    await mark(pg, [['input[aria-label="Поиск товаров"], header input', 1], [pg.locator('button:has-text("Размер")').first(), 2], [pg.locator('button:has-text("В корзину")').first(), 3]]); await shot(pg, 'site-buyer-1');
    await pg.locator('button:has-text("В корзину")').first().click(); await pg.waitForTimeout(1200);
    await shot(pg, 'site-buyer-2');
    await pg.locator('[role=dialog] button[aria-pressed]').first().click().catch(() => {}); await pg.waitForTimeout(500);
    await pg.keyboard.press('Escape');
    await go(pg, '/cart', 1500); await shot(pg, 'site-buyer-3');
  },
  async backup(pg, ctx, admin) {
    await go(admin, '/admin/settings', 1500);
    const h = admin.locator('h2:has-text("Резервная копия")').first(); await h.scrollIntoViewIfNeeded(); await admin.evaluate(() => window.scrollBy(0, -120));
    await mark(admin, [[btn(admin, 'База данных'), 1], [btn(admin, 'Фото и файлы'), 2]]); await shot(admin, 'backup-1');
  },
};

(async () => {
  const tok = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'admin', password: PASS }) }).then((r) => r.json());
  if (!tok.token) throw new Error('Не удалось войти: ' + JSON.stringify(tok));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  await ctx.addInitScript(([t, u, nav]) => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(u)); localStorage.setItem('nav_open', nav); localStorage.setItem('cookie_ok', '1'); localStorage.setItem('theme', 'light'); }, [tok.token, tok.user, NAV_ALL]);
  const admin = await ctx.newPage();
  const shop = await ctx.newPage();
  for (const [id, fn] of Object.entries(SHOTS)) {
    if (ONLY.length && !ONLY.includes(id)) continue;
    console.log(id);
    try { await fn(shop, ctx, admin); } catch (e) { console.error('  ОШИБКА', id, e.message.split('\n')[0]); }
  }
  await b.close();
  fs.rmSync(TMP, { recursive: true, force: true });
})();
