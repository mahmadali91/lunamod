// Видеообзоры для «Базы знаний»: запись экрана копии программы с демо-данными (не рабочей базы!).
//   NODE_PATH=$(npm root -g) node scripts/kb-videos.cjs http://localhost:3200 ПАРОЛЬ_ADMIN [add-product sale order]
// Результат: client/public/kb/video-*.mp4 (H.264 — играет везде, в том числе на iPhone). Нужны Playwright и ffmpeg.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const [BASE = 'http://localhost:3200', PASS = 'kb-password', ...ONLY] = process.argv.slice(2);
const OUT = path.join(__dirname, '..', 'client', 'public', 'kb');
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'kbv-'));
const W = 1280, H = 720;

// курсор и подписи поверх страницы (в записи видно, куда нажимают)
const OVERLAY = () => {
  const add = () => {
    if (document.getElementById('kb-cursor')) return;
    const c = document.createElement('div'); c.id = 'kb-cursor';
    Object.assign(c.style, { position: 'fixed', left: '-40px', top: '-40px', width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(244,63,94,.85)', border: '3px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,.35)', zIndex: 100000, pointerEvents: 'none', transform: 'translate(-50%,-50%)', transition: 'width .12s, height .12s' });
    const cap = document.createElement('div'); cap.id = 'kb-caption';
    Object.assign(cap.style, { position: 'fixed', left: '50%', bottom: '22px', transform: 'translateX(-50%)', maxWidth: '86%', padding: '12px 22px', borderRadius: '14px', background: 'rgba(15,23,42,.88)', color: '#fff', font: '600 20px/1.35 Inter, Arial, sans-serif', textAlign: 'center', zIndex: 100000, pointerEvents: 'none', opacity: 0, transition: 'opacity .25s' });
    document.body.append(c, cap);
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => { c.style.width = c.style.height = '34px'; }, true);
    addEventListener('mouseup', () => { c.style.width = c.style.height = '22px'; }, true);
  };
  if (document.body) add(); else addEventListener('DOMContentLoaded', add);
};

function helpers(pg) {
  let pos = { x: W / 2, y: H / 2 };
  const caption = async (text, ms = 2200) => {
    await pg.evaluate((t) => { const c = document.getElementById('kb-caption'); if (c) { c.textContent = t; c.style.opacity = t ? 1 : 0; } }, text);
    if (ms) await pg.waitForTimeout(ms);
  };
  const moveTo = async (loc) => {
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const b = await loc.boundingBox();
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    await pg.mouse.move(pos.x, pos.y); await pg.mouse.move(x, y, { steps: 25 }); pos = { x, y };
    await pg.waitForTimeout(250);
  };
  const click = async (loc, after = 700) => { await moveTo(loc); await loc.click(); await pg.waitForTimeout(after); };
  const type = async (loc, text, after = 500) => { await click(loc, 200); await loc.pressSequentially(text, { delay: 70 }); await pg.waitForTimeout(after); };
  const ensure = () => pg.evaluate(() => document.getElementById('kb-cursor') || window.dispatchEvent(new Event('DOMContentLoaded')));
  return { caption, click, type, moveTo, ensure };
}

const SCENES = {
  async 'add-product'(pg, h) {
    await pg.goto(BASE + '/admin/products'); await pg.waitForTimeout(1500); await h.ensure();
    await h.caption('Как добавить товар: раздел «Товары» → «Добавить товар»');
    await h.click(pg.locator('button:visible:has-text("Добавить товар")'), 1500); await h.ensure();
    await h.caption('Заполните название, категорию и бренд', 600);
    await h.type(pg.locator('label:has-text("Название") + input, label:has-text("Название") input').first(), 'Платье миди «Лето»');
    await pg.locator('select').filter({ has: pg.locator('option:has-text("Платья")') }).first().selectOption({ label: 'Платья и сарафаны' }).catch(() => {});
    await h.type(pg.locator('input[placeholder*="необязательно"]').first(), 'Botmi');
    await h.caption('Укажите цену продажи и закупочную цену — по ней считается прибыль', 600);
    const price = pg.locator('label:has-text("Цена продажи") + input, label:has-text("Цена продажи") input').first();
    await h.type(price, '3990');
    await h.type(pg.locator('label:has-text("Закупочная") + input, label:has-text("Закупочная") input').first(), '1500');
    await h.caption('Включите «Есть размеры» и выберите готовый набор — у каждого размера будет свой штрихкод', 600);
    await h.click(pg.locator('label:has-text("Есть размеры")').first(), 900);
    await h.click(pg.locator('button:has-text("+ XS–XL")').first(), 1200);
    await h.caption('Укажите остаток каждого размера на складе', 600);
    const qty = pg.locator('input[placeholder="0"]');
    for (let i = 0; i < 3; i++) await h.type(qty.nth(qty.count ? i : i), String(3 + i), 200).catch(() => {});
    await h.caption('Добавьте фото и видео кнопками «Фото» и «Видео», затем нажмите «Сохранить»', 2600);
    await pg.evaluate(() => document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })); await pg.waitForTimeout(800);
    await h.click(pg.locator('button:visible:has-text("Сохранить")').first(), 2200); await h.ensure();
    await h.caption('Готово! Товару присвоен артикул, его можно открыть на сайте кнопкой «На сайте»', 3200);
  },
  async sale(pg, h) {
    await pg.goto(BASE + '/admin/pos'); await pg.waitForTimeout(1500); await h.ensure();
    await h.caption('Продажа: отсканируйте штрихкод или найдите товар по названию', 600);
    await h.type(pg.locator('main input[placeholder*="Сканируйте"]'), 'Платье-футляр', 900);
    await h.click(pg.locator('main .absolute button, main [role=option]').first(), 900);
    await h.caption('Выберите склад, с которого списывается товар, и канал продаж', 600);
    const wh = pg.locator('main select').first(); await h.moveTo(wh); await wh.selectOption({ index: 1 }); await pg.waitForTimeout(600);
    const ch = pg.locator('main select').nth(1); await h.moveTo(ch); await ch.selectOption({ index: 1 }); await pg.waitForTimeout(600);
    await h.caption('Способ оплаты: наличные, карта или перевод', 400);
    await h.click(pg.locator('button:visible:has-text("Карта")').first(), 900);
    await h.caption('Нажмите «Провести продажу» — остатки уменьшатся автоматически', 500);
    await h.click(pg.locator('button:visible:has-text("Провести продажу")').first(), 1800);
    await h.caption('Продажа проведена. Возврат — в разделе «Продажи»: откройте продажу и нажмите «Вернуть»', 3400);
  },
  async order(pg, h) {
    await pg.goto(BASE + '/admin/orders'); await pg.waitForTimeout(1500); await h.ensure();
    await h.caption('Заказы с сайта: откройте новый заказ', 600);
    await h.click(pg.locator('tbody tr').last(), 1300);
    await h.caption('Проверьте товары и покупателя, затем нажмите «Подтвердить»', 600);
    await h.click(pg.locator('button:visible:has-text("Подтвердить")').first(), 1300);
    await h.caption('«Лист подбора» — что и с какого склада взять. Его можно скачать в PDF', 600);
    await h.click(pg.locator('button:visible:has-text("Лист подбора")').first(), 1200);
    const boxes = pg.locator('.fixed.inset-0 label input[type=checkbox]');
    for (let i = 0; i < await boxes.count(); i++) await h.click(boxes.nth(i), 500);
    await h.caption('Всё собрано — закройте лист подбора', 1200);
    await h.click(pg.locator('.fixed.inset-0 button[aria-label], .fixed.inset-0 h2 ~ button').first(), 1000);
    await h.caption('Заказ готов или отправлен — «Собран / в пути»', 500);
    await h.click(pg.locator('button:visible:has-text("Собран / в пути")').first(), 1300);
    await h.caption('Покупатель получил заказ — «Выдан покупателю». Программа сама создаст продажу и спишет товар', 600);
    pg.once('dialog', (d) => d.accept());
    await h.click(pg.locator('button:visible:has-text("Выдан покупателю")').first(), 2000);
    await h.caption('Готово! Заказ выполнен', 2600);
  },
};

(async () => {
  const tok = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'admin', password: PASS }) }).then((r) => r.json());
  if (!tok.token) throw new Error('Не удалось войти');
  const b = await chromium.launch();
  for (const [name, scene] of Object.entries(SCENES)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    console.log(name);
    const ctx = await b.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: TMP, size: { width: W, height: H } } });
    await ctx.addInitScript(([t, u]) => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(u)); localStorage.setItem('theme', 'light'); localStorage.setItem('nav_open', JSON.stringify(['Продажи', 'Интернет-магазин', 'Товары'])); }, [tok.token, tok.user]);
    await ctx.addInitScript(OVERLAY);
    const pg = await ctx.newPage();
    try { await scene(pg, helpers(pg)); } catch (e) { console.error('  ОШИБКА', e.message.split('\n')[0]); }
    const vid = pg.video();
    await ctx.close();
    const webm = await vid.path();
    const mp4 = path.join(OUT, `video-${name}.mp4`);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', webm, '-vf', 'fps=25', '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-crf', '30', '-preset', 'slow', '-movflags', '+faststart', '-an', mp4]);
    console.log('  ✓', path.basename(mp4), Math.round(fs.statSync(mp4).size / 1024) + ' КБ');
  }
  await b.close();
  fs.rmSync(TMP, { recursive: true, force: true });
})();
