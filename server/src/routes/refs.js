const prisma = require('../db');
const crud = require('./crud');
const { str, int, HttpError } = require('../util');

const bool = (v, d = true) => (v === undefined ? d : Boolean(v));

const warehouses = crud('warehouse', {
  pick: (b) => ({ name: str(b.name), address: str(b.address), note: str(b.note), active: bool(b.active) }),
  orderBy: { id: 'asc' },
  include: { _count: { select: { stocks: true } } },
  beforeDelete: async (id) => {
    const used = await prisma.sale.count({ where: { warehouseId: id } }) + await prisma.receipt.count({ where: { warehouseId: id } });
    if (used) throw new HttpError(400, 'По складу есть документы — его можно только деактивировать');
  },
});

const channels = crud('salesChannel', {
  pick: (b) => ({ name: str(b.name), type: b.type || 'retail', color: b.color || '#2a78d6', active: bool(b.active) }),
  orderBy: { id: 'asc' },
});

const counterparties = crud('counterparty', {
  pick: (b) => ({ name: str(b.name), type: b.type || 'customer', phone: str(b.phone), email: str(b.email), inn: str(b.inn), address: str(b.address), note: str(b.note) }),
  searchFields: ['name', 'phone', 'inn', 'email'],
});

const categories = crud('category', {
  pick: (b) => ({ name: str(b.name), ...(b.sizeChartId !== undefined ? { sizeChartId: int(b.sizeChartId) } : {}) }),
  orderBy: { name: 'asc' },
  // кол-во товаров (карточек) и фото первого товара — для карточек категорий
  include: {
    _count: { select: { products: { where: { active: true, parentId: null } } } },
    products: { where: { active: true, parentId: null, images: { some: {} } }, take: 1, select: { images: { where: { kind: 'image' }, take: 1, orderBy: { sort: 'asc' }, select: { path: true } } } },
  },
});

// Таблицы размеров: data — { head: [...], rows: [[...]], note }
function chartData(v) {
  let d = v;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { throw new HttpError(400, 'Неверная таблица размеров'); } }
  const cell = (x) => String(x ?? '').trim().slice(0, 40);
  const head = (Array.isArray(d?.head) ? d.head : []).map(cell).slice(0, 12);
  if (!head.length) throw new HttpError(400, 'Добавьте хотя бы одну колонку');
  const rows = (Array.isArray(d?.rows) ? d.rows : []).map((r) => head.map((_, i) => cell(r?.[i]))).filter((r) => r.some(Boolean)).slice(0, 40);
  return JSON.stringify({ head, rows, note: String(d?.note || '').slice(0, 1000) });
}
const sizeCharts = crud('sizeChart', {
  pick: (b) => ({ name: str(b.name), data: chartData(b.data) }),
  orderBy: { name: 'asc' },
});

module.exports = { warehouses, channels, counterparties, categories, sizeCharts };
