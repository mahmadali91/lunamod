// Резервная копия без mysqldump (на хостинге его может не быть):
// база — SQL-файл (структура + данные, в том числе история миграций), фото — архив .tar.gz.
// Оба файла пишутся потоком со сжатием gzip, поэтому подходят и для больших магазинов.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const prisma = require('./db');
const { UPLOAD_DIR } = require('./paths');

const BATCH = 500;
const q = (name) => '`' + String(name).replace(/`/g, '``') + '`';

function sqlValue(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Date) return isNaN(v) ? 'NULL' : `'${v.toISOString().replace('T', ' ').replace('Z', '')}'`;
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return v.length ? '0x' + Buffer.from(v).toString('hex') : "''";
  if (typeof v === 'object' && typeof v.toFixed === 'function') return v.toString(); // Decimal
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\0/g, '\\0').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\x1a/g, '\\Z') + "'";
}

// запись в поток с учётом заполнения буфера
const put = (out, s) => (out.write(s) ? null : new Promise((r) => out.once('drain', r)));

/** SQL-дамп всей базы в поток (gzip) */
async function dumpDatabase(res) {
  const gz = zlib.createGzip({ level: 6 });
  gz.pipe(res);
  const w = async (s) => { const p = put(gz, s); if (p) await p; };
  const [{ db }] = await prisma.$queryRawUnsafe('SELECT DATABASE() AS db');
  const tables = (await prisma.$queryRawUnsafe("SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME")).map((r) => r.t);
  await w(`-- Резервная копия базы «${db}» от ${new Date().toISOString()}\n-- Восстановление: phpMyAdmin → Импорт этого файла, или: gunzip -c файл.sql.gz | mysql -u USER -p ИМЯ_БАЗЫ\n\n`);
  await w('SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\nSET UNIQUE_CHECKS = 0;\nSET SQL_MODE = \'NO_AUTO_VALUE_ON_ZERO\';\nSET time_zone = \'+00:00\';\n\n');
  for (const t of tables) {
    const [create] = await prisma.$queryRawUnsafe(`SHOW CREATE TABLE ${q(t)}`);
    // MariaDB и MySQL 8 называют колонку по-разному — берём ту, где текст CREATE TABLE
    const ddl = Object.values(create || {}).map((v) => (Buffer.isBuffer(v) ? v.toString() : v)).find((v) => typeof v === 'string' && /^CREATE TABLE/i.test(v));
    if (!ddl) throw new Error(`Не удалось прочитать структуру таблицы ${t}`);
    await w(`-- ${t}\nDROP TABLE IF EXISTS ${q(t)};\n${ddl};\n`);
    const cols = (await prisma.$queryRawUnsafe(`SELECT COLUMN_NAME AS c, DATA_TYPE AS d FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`, t));
    const pk = (await prisma.$queryRawUnsafe(`SELECT COLUMN_NAME AS c FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION`, t)).map((r) => r.c);
    // JSON и бинарные колонки читаем как текст/hex, чтобы ничего не исказить
    const sel = cols.map(({ c, d }) => (d === 'json' ? `CAST(${q(c)} AS CHAR) AS ${q(c)}` : q(c))).join(', ');
    const order = pk.length ? ` ORDER BY ${pk.map(q).join(', ')}` : '';
    const names = cols.map(({ c }) => q(c)).join(', ');
    for (let off = 0; ; off += BATCH) {
      const rows = await prisma.$queryRawUnsafe(`SELECT ${sel} FROM ${q(t)}${order} LIMIT ${BATCH} OFFSET ${off}`);
      if (!rows.length) break;
      await w(`INSERT INTO ${q(t)} (${names}) VALUES\n` + rows.map((r) => '(' + cols.map(({ c }) => sqlValue(r[c])).join(', ') + ')').join(',\n') + ';\n');
      if (rows.length < BATCH) break;
    }
    await w('\n');
  }
  await w('SET FOREIGN_KEY_CHECKS = 1;\nSET UNIQUE_CHECKS = 1;\n');
  gz.end();
}

// ---- tar (формат ustar) без внешних библиотек ----
function tarHeader(name, size, mtime, dir) {
  const h = Buffer.alloc(512);
  let prefix = '';
  if (Buffer.byteLength(name) > 100) { const i = name.lastIndexOf('/', name.length - 1); prefix = name.slice(0, i); name = name.slice(i + 1); }
  h.write(name, 0, 100);
  h.write(dir ? '0000755\0' : '0000644\0', 100);
  h.write('0000000\0', 108); h.write('0000000\0', 116);
  h.write(size.toString(8).padStart(11, '0') + '\0', 124);
  h.write(Math.floor(mtime / 1000).toString(8).padStart(11, '0') + '\0', 136);
  h.write('        ', 148);
  h.write(dir ? '5' : '0', 156);
  h.write('ustar\0', 257); h.write('00', 263);
  h.write(prefix, 345, 155);
  let sum = 0; for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return h;
}

/** Все загруженные файлы (фото, видео, файлы чата) → uploads.tar.gz в поток */
async function archiveUploads(res) {
  const gz = zlib.createGzip({ level: 1 }); // фото уже сжаты — быстро, почти без потерь размера
  gz.pipe(res);
  const w = async (b) => { const p = put(gz, b); if (p) await p; };
  async function walk(dir, rel) {
    let list = [];
    try { list = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      const full = path.join(dir, e.name), name = rel ? `${rel}/${e.name}` : e.name;
      let st; try { st = await fs.promises.stat(full); } catch { continue; }
      if (st.isDirectory()) { await w(tarHeader(`uploads/${name}/`, 0, st.mtimeMs, true)); await walk(full, name); continue; }
      if (!st.isFile()) continue;
      await w(tarHeader(`uploads/${name}`, st.size, st.mtimeMs, false));
      let n = 0;
      for await (const chunk of fs.createReadStream(full)) { if (n + chunk.length > st.size) break; n += chunk.length; await w(chunk); }
      if (n < st.size) await w(Buffer.alloc(st.size - n)); // файл укоротился во время чтения
      if (st.size % 512) await w(Buffer.alloc(512 - (st.size % 512)));
    }
  }
  await w(tarHeader('uploads/', 0, Date.now(), true));
  await walk(UPLOAD_DIR, '');
  await w(Buffer.alloc(1024));
  gz.end();
}

/** Размер базы и папки с файлами — чтобы показать перед скачиванием */
async function backupInfo() {
  const [r] = await prisma.$queryRawUnsafe('SELECT COALESCE(SUM(DATA_LENGTH + INDEX_LENGTH), 0) AS size, COUNT(*) AS tables FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()');
  let files = 0, bytes = 0;
  async function walk(dir) {
    let list = []; try { list = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of list) { const f = path.join(dir, e.name); if (e.isDirectory()) await walk(f); else if (e.isFile()) { files++; try { bytes += (await fs.promises.stat(f)).size; } catch { /* удалён */ } } }
  }
  await walk(UPLOAD_DIR);
  return { dbSize: Number(r.size), tables: Number(r.tables), files, filesSize: bytes };
}

module.exports = { dumpDatabase, archiveUploads, backupInfo };
