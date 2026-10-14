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
async function changeStock(tx, { productId, warehouseId, quantity, type, note, saleId, receiptId, allowNegative = true }) {
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
  return stock;
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

module.exports = { ah, HttpError, ean13CheckDigit, isValidEan13, generateEan13, detectBarcodeType, changeStock, nextNumber, num, int, str, like };
