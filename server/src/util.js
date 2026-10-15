const prisma = require('./db');

// Обёртка для async-обработчиков, чтобы ошибки шли в общий обработчик
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Контрольная цифра EAN-13
function ean13CheckDigit(code12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(code12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

function isValidEan13(code) {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === code[12];
}

// Генерация уникального внутреннего EAN-13 с префиксом 200 (диапазон для внутреннего использования)
async function generateEan13(tx = prisma) {
  const key = 'barcode_seq';
  const row = await tx.setting.findUnique({ where: { key } });
  let seq = row ? Number(row.value) : 0;
  for (;;) {
    seq += 1;
    const code12 = '200' + String(seq).padStart(9, '0');
    const code = code12 + ean13CheckDigit(code12);
    const exists = await tx.barcode.findUnique({ where: { code } });
    if (!exists) {
      await tx.setting.upsert({ where: { key }, update: { value: String(seq) }, create: { key, value: String(seq) } });
      return code;
    }
  }
}

function detectBarcodeType(code) {
  return isValidEan13(code) ? 'EAN13' : 'CODE128';
}

// Изменение остатка + запись движения. Работает внутри транзакции.
/**
 * Единственное место, где меняется остаток. Вместе с остатком ведутся партии (у каждой своя себестоимость):
 *  - приход (quantity > 0): новая партия по цене cost (по умолчанию — закупочная цена товара);
 *    lots — партии, перемещённые с другого склада (сохраняют цену, дату и поставщика);
 *    возврат продажи (saleItemId) — товар возвращается в те же партии, из которых был продан;
 *  - расход (quantity < 0): списание FIFO — сначала самые старые партии (preferReceiptId — сначала партии этого прихода).
 * Если остатка нет (продажа «в минус»), недостающее считается по цене последней партии; когда придёт новая
 * партия, из неё сначала погашается этот минус.
 * Возвращает { stock, cost — средняя себестоимость единицы при расходе, lots — какие партии списаны }.
 */
async function changeStock(tx, { productId, warehouseId, quantity, type, note, saleId, receiptId, allowNegative = true, cost, supplierId, saleItemId, lots, date, preferReceiptId }) {
  const stock = await tx.stock.upsert({
    where: { productId_warehouseId: { productId, warehouseId } },
    update: { quantity: { increment: quantity } },
    create: { productId, warehouseId, quantity },
  });
  if (!allowNegative && stock.quantity < 0) {
    const p = await tx.product.findUnique({ where: { id: productId } });
    throw new HttpError(400, `Недостаточно остатка: «${p?.name}» (не хватает ${-stock.quantity})`);
  }
  await tx.stockMovement.create({ data: { productId, warehouseId, quantity, type, note, saleId, receiptId } });
  const r2 = (v) => Math.round(v * 1e4) / 1e4;
  const result = { stock, cost: 0, lots: [] };

  if (quantity > 0) {
    // минус на складе (продавали без остатка) гасится первыми поступившими единицами
    const before = stock.quantity - quantity;
    let skip = before < 0 ? Math.min(quantity, -before) : 0;
    let left = quantity;
    const put = async (q, data) => {
      const keep = Math.min(skip, q); skip -= keep;
      await tx.batch.create({ data: { productId, warehouseId, quantity: q, remaining: r2(q - keep), ...data } });
    };
    if (saleItemId) {
      // возврат: в те партии, из которых продали (последние списания — первыми)
      const uses = await tx.batchUse.findMany({ where: { saleItemId }, include: { batch: true }, orderBy: { id: 'desc' } });
      for (const u of uses) {
        if (left <= 0) break;
        const q = Math.min(left, u.quantity - u.returned);
        if (q <= 0) continue;
        await tx.batchUse.update({ where: { id: u.id }, data: { returned: r2(u.returned + q) } });
        const keep = Math.min(skip, q); skip -= keep;
        if (u.batch.warehouseId === warehouseId) await tx.batch.update({ where: { id: u.batchId }, data: { remaining: { increment: q - keep } } });
        else await tx.batch.create({ data: { productId, warehouseId, quantity: q, remaining: q - keep, costPrice: u.costPrice, date: u.batch.date, supplierId: u.batch.supplierId, note: 'Возврат' } });
        left = r2(left - q);
      }
      if (left > 0) {
        const it = await tx.saleItem.findUnique({ where: { id: saleItemId } });
        await put(left, { costPrice: it?.costPrice || 0, note: 'Возврат' });
      }
    } else if (lots?.length) {
      for (const l of lots) await put(l.quantity, { costPrice: l.costPrice, date: l.date, supplierId: l.supplierId, receiptId: l.receiptId, note: l.note });
    } else {
      let c = cost;
      if (c === undefined || c === null) c = (await tx.product.findUnique({ where: { id: productId }, select: { costPrice: true } }))?.costPrice || 0;
      await put(quantity, { costPrice: Number(c) || 0, date: date || new Date(), supplierId: supplierId || null, receiptId: receiptId || null, note: note || null });
    }
    return result;
  }

  if (quantity < 0) {
    let need = -quantity, sum = 0;
    const batches = await tx.batch.findMany({ where: { productId, warehouseId, remaining: { gt: 0 } }, orderBy: [{ date: 'asc' }, { id: 'asc' }] });
    if (preferReceiptId) batches.sort((a, b) => (b.receiptId === preferReceiptId) - (a.receiptId === preferReceiptId));
    for (const bt of batches) {
      if (need <= 1e-9) break;
      const q = Math.min(need, bt.remaining);
      await tx.batch.update({ where: { id: bt.id }, data: { remaining: r2(bt.remaining - q) } });
      if (saleItemId) await tx.batchUse.create({ data: { batchId: bt.id, saleItemId, quantity: q, costPrice: bt.costPrice } });
      result.lots.push({ quantity: q, costPrice: bt.costPrice, date: bt.date, supplierId: bt.supplierId, receiptId: bt.receiptId, note: bt.note });
      sum += q * bt.costPrice; need = r2(need - q);
    }
    if (need > 0) {
      // продажа без остатка: себестоимость — по последней партии товара или по закупочной цене
      const last = await tx.batch.findFirst({ where: { productId }, orderBy: [{ date: 'desc' }, { id: 'desc' }] });
      const c = last ? last.costPrice : (await tx.product.findUnique({ where: { id: productId }, select: { costPrice: true } }))?.costPrice || 0;
      sum += need * c;
      result.lots.push({ quantity: need, costPrice: c, date: new Date(), note: 'Без партии (остаток был в минусе)' });
    }
    result.cost = Math.round((sum / -quantity) * 100) / 100;
  }
  return result;
}

async function nextNumber(tx, key, prefix) {
  const row = await tx.setting.findUnique({ where: { key } });
  const n = (row ? Number(row.value) : 0) + 1;
  await tx.setting.upsert({ where: { key }, update: { value: String(n) }, create: { key, value: String(n) } });
  return prefix + String(n).padStart(6, '0');
}

// Поиск без учёта регистра (в PostgreSQL через mode: insensitive)
const like = (s) => (/^postgres/.test(process.env.DATABASE_URL || '') ? { contains: s, mode: 'insensitive' } : { contains: s });

const num = (v, d = 0) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? d : Number(v));
const int = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const str = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());

// Числовой артикул карточки «как на WB»: 8 цифр, однозначно по номеру карточки (не меняется, не повторяется)
const ARTICLE_BASE = 10000000;
const articleOf = (id) => ARTICLE_BASE + id;
const idOfArticle = (q) => { const s = String(q || '').trim(); return /^\d{8}$/.test(s) && Number(s) > ARTICLE_BASE ? Number(s) - ARTICLE_BASE : null; };

module.exports = { articleOf, idOfArticle, ah, HttpError, ean13CheckDigit, isValidEan13, generateEan13, detectBarcodeType, changeStock, nextNumber, num, int, str, like };
