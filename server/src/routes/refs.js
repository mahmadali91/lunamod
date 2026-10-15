const prisma = require('../db');
const crud = require('./crud');
const { str, HttpError } = require('../util');

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
  pick: (b) => ({ name: str(b.name) }),
  orderBy: { name: 'asc' },
  // кол-во товаров и фото первого товара — для карточек категорий
  include: {
    _count: { select: { products: { where: { active: true } } } },
    products: { where: { active: true, images: { some: {} } }, take: 1, select: { images: { take: 1, orderBy: { sort: 'asc' }, select: { path: true } } } },
  },
});

module.exports = { warehouses, channels, counterparties, categories };
