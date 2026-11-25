// Перенос всей базы одного сайта в другую (например, тестовый → рабочий).
//   node scripts/copy-db.js "<DATABASE_URL откуда>" "<DATABASE_URL куда>" "https://новый-сайт.ru"
// База «куда» полностью заменяется копией. Адрес сайта в настройках магазина меняется на новый.
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { PrismaClient } = require('@prisma/client');

const [FROM, TO, SITE] = process.argv.slice(2);
if (!FROM || !TO) { console.error('Нужно: node scripts/copy-db.js <url-откуда> <url-куда> [https://сайт]'); process.exit(1); }
if (FROM === TO) { console.error('Базы «откуда» и «куда» совпадают — копировать некуда'); process.exit(1); }

(async () => {
  process.env.DATABASE_URL = FROM; // backup.js берёт подключение из DATABASE_URL
  const { dumpDatabase } = require('../src/backup');
  const file = path.join(os.tmpdir(), `sklad-copy-${process.pid}.sql.gz`);
  const out = fs.createWriteStream(file);
  const done = new Promise((ok, fail) => { out.on('finish', ok); out.on('error', fail); });
  await dumpDatabase(out);
  await done;
  console.log(`Копия базы сделана: ${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} МБ (сжато)`);

  // одно соединение — чтобы SET FOREIGN_KEY_CHECKS действовал на все команды
  const url = TO + (TO.includes('?') ? '&' : '?') + 'connection_limit=1';
  const to = new PrismaClient({ datasources: { db: { url } } });
  // в дампе каждая команда заканчивается «;» в конце строки, переносы внутри текста экранированы
  const sql = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8');
  const parts = sql.split(/;\n/).map((x) => x.split('\n').filter((l) => !l.startsWith('--')).join('\n').trim()).filter(Boolean);
  let n = 0;
  for (const st of parts) {
    await to.$executeRawUnsafe(st);
    if (++n % 200 === 0) process.stdout.write(`\r  загружено команд: ${n} из ${parts.length}`);
  }
  console.log(`\r  загружено команд: ${n} из ${parts.length}`);
  if (SITE) {
    await to.setting.upsert({ where: { key: 'shop_siteUrl' }, update: { value: SITE }, create: { key: 'shop_siteUrl', value: SITE } });
    await to.setting.upsert({ where: { key: 'shop_noindex' }, update: { value: '0' }, create: { key: 'shop_noindex', value: '0' } });
    console.log('Адрес сайта в настройках магазина:', SITE);
  }
  const [{ c }] = await to.$queryRawUnsafe('SELECT COUNT(*) AS c FROM Product');
  console.log(`Готово. Товаров (с размерами) в новой базе: ${Number(c)}`);
  await to.$disconnect();
  fs.unlinkSync(file);
  process.exit(0);
})().catch((e) => { console.error('ОШИБКА:', e.message); process.exit(1); });
