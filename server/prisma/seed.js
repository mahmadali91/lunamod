require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const prisma = require('../src/db');
const { generateEan13, changeStock, nextNumber } = require('../src/util');

async function main() {
  if (!(await prisma.user.findUnique({ where: { login: 'admin' } }))) {
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    await prisma.user.create({ data: { login: 'admin', name: 'Администратор', role: 'admin', password: await bcrypt.hash(password, 10) } });
    console.log(`Создан пользователь admin / ${password}`);
  }
  if (process.argv.includes('--demo') && (await prisma.product.count()) === 0) {
    const [w1, w2] = await Promise.all([
      prisma.warehouse.create({ data: { name: 'Основной склад', address: 'ул. Центральная, 1' } }),
      prisma.warehouse.create({ data: { name: 'Магазин', address: 'ТЦ «Город», 2 этаж' } }),
    ]);
    const chs = [];
    for (const c of [['Розница', 'retail', '#2a78d6'], ['Instagram', 'online', '#eb6834'], ['Маркетплейс', 'marketplace', '#1baf7a'], ['Опт', 'wholesale', '#eda100']])
      chs.push(await prisma.salesChannel.create({ data: { name: c[0], type: c[1], color: c[2] } }));
    const sup = await prisma.counterparty.create({ data: { name: 'ООО «Поставщик Плюс»', type: 'supplier', phone: '+7 700 000 00 01', inn: '123456789012' } });
    const cust = await prisma.counterparty.create({ data: { name: 'Иван Петров', type: 'customer', phone: '+7 700 000 00 02' } });
    const cat = await prisma.category.create({ data: { name: 'Одежда' } });
    const cat2 = await prisma.category.create({ data: { name: 'Аксессуары' } });
    const items = [
      ['Футболка базовая белая', 'TSH-001', 4990, 2200, cat.id, [['Размер', 'M'], ['Цвет', 'Белый'], ['Материал', 'Хлопок 100%']]],
      ['Футболка базовая чёрная', 'TSH-002', 4990, 2200, cat.id, [['Размер', 'L'], ['Цвет', 'Чёрный']]],
      ['Худи оверсайз', 'HD-010', 12990, 6100, cat.id, [['Размер', 'XL'], ['Цвет', 'Серый']]],
      ['Джинсы прямые', 'JN-205', 15990, 7800, cat.id, [['Размер', '32/32']]],
      ['Кепка', 'CP-003', 3490, 1200, cat2.id, [['Цвет', 'Синий']]],
      ['Рюкзак городской', 'BP-100', 18990, 9500, cat2.id, [['Объём', '20 л']]],
      ['Носки (3 пары)', 'SK-033', 1990, 700, cat2.id, []],
    ];
    const prods = [];
    for (const [name, sku, price, costPrice, categoryId, attrs] of items) {
      const p = await prisma.product.create({ data: { name, sku, price, costPrice, categoryId, minStock: 5, attributes: { create: attrs.map(([n, v]) => ({ name: n, value: v })) } } });
      await prisma.barcode.create({ data: { productId: p.id, code: await generateEan13(), type: 'EAN13', isPrimary: true, generated: true } });
      prods.push(p);
    }
    await prisma.$transaction(async (tx) => {
      const number = await nextNumber(tx, 'receipt_seq', 'П-');
      const rc = await tx.receipt.create({ data: { number, warehouseId: w1.id, counterpartyId: sup.id, date: new Date(Date.now() - 40 * 864e5) } });
      let total = 0;
      for (const p of prods) {
        const q = Math.floor(Math.random() * 40) + 20; total += q * p.costPrice;
        await tx.receiptItem.create({ data: { receiptId: rc.id, productId: p.id, quantity: q, costPrice: p.costPrice } });
        await changeStock(tx, { productId: p.id, warehouseId: w1.id, quantity: q, type: 'RECEIPT', note: number, receiptId: rc.id });
        await changeStock(tx, { productId: p.id, warehouseId: w2.id, quantity: 8, type: 'ADJUST', note: 'Начальный остаток' });
      }
      await tx.receipt.update({ where: { id: rc.id }, data: { total } });
    }, { timeout: 60000 });
    // Продажи за 30 дней
    for (let d = 29; d >= 0; d--) {
      const n = Math.floor(Math.random() * 4) + 1;
      for (let k = 0; k < n; k++) {
        const date = new Date(Date.now() - d * 864e5); date.setHours(10 + Math.floor(Math.random() * 9));
        const ch = chs[Math.floor(Math.random() * chs.length)];
        const picked = prods.filter(() => Math.random() < 0.3).slice(0, 3);
        if (!picked.length) picked.push(prods[k % prods.length]);
        await prisma.$transaction(async (tx) => {
          const number = await nextNumber(tx, 'sale_seq', 'S-');
          const its = picked.map((p) => ({ p, q: Math.floor(Math.random() * 2) + 1 }));
          const total = its.reduce((s, i) => s + i.q * i.p.price, 0);
          const sale = await tx.sale.create({ data: { number, date, warehouseId: w1.id, channelId: ch.id, counterpartyId: Math.random() < 0.3 ? cust.id : null, total, paymentMethod: Math.random() < 0.5 ? 'cash' : 'card' } });
          for (const i of its) {
            await tx.saleItem.create({ data: { saleId: sale.id, productId: i.p.id, quantity: i.q, price: i.p.price, costPrice: i.p.costPrice } });
            await changeStock(tx, { productId: i.p.id, warehouseId: w1.id, quantity: -i.q, type: 'SALE', note: number, saleId: sale.id });
          }
        });
      }
    }
    console.log('Демо-данные добавлены');
  }
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
