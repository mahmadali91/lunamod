// Фоновые задачи магазина (раз в 5 минут, пока сервер работает, и после прихода товара):
//  - «Сообщить о поступлении»: товар снова в наличии → пуш (и SMS, если включено) подписавшимся;
//  - брошенная корзина: через 2 часа — пуш, через сутки — пуш или SMS.
const prisma = require('./db');
const { getShopSettings } = require('./shop/settings');
const { notifyVisitor } = require('./notify');
const { sendSms } = require('./shop/sms');

let running = false, lastRun = 0;

async function siteBase(s) { return (s.siteUrl || '').replace(/\/$/, ''); }

async function waitlist(s) {
  const subs = await prisma.stockSubscription.findMany({ where: { notifiedAt: null }, include: { product: { include: { stocks: true, parent: true } }, customer: true }, take: 500 });
  const base = await siteBase(s);
  let sent = 0;
  for (const x of subs) {
    const st = x.product.stocks.filter((t) => !s.warehouseId || t.warehouseId === Number(s.warehouseId)).reduce((a, t) => a + t.quantity, 0);
    if (st <= 0 || !x.product.active) continue;
    const card = x.product.parent || x.product;
    const url = `/product/${card.id}`;
    await notifyVisitor('cust-' + x.customerId, { title: 'Снова в наличии!', body: x.product.name, url });
    if (s.remindSms === '1' && s.smsMode === 'smsru') await sendSms(s, x.customer.phone, `Снова в наличии: ${x.product.name.slice(0, 60)}. ${base}${url}`).catch(() => {});
    await prisma.stockSubscription.update({ where: { id: x.id }, data: { notifiedAt: new Date() } });
    sent++;
  }
  return sent;
}

async function carts(s) {
  if (s.cartReminders !== '1') return 0;
  const now = Date.now();
  const list = await prisma.customer.findMany({ where: { cart: { not: null }, cartReminded: { lt: 2 }, cartUpdatedAt: { lt: new Date(now - 2 * 3600e3) } }, take: 200 });
  const base = await siteBase(s);
  let sent = 0;
  for (const c of list) {
    const stage = c.cartUpdatedAt < new Date(now - 24 * 3600e3) ? 2 : 1;
    if (stage <= c.cartReminded) continue;
    // уже оформил заказ после того, как положил товары в корзину
    if (await prisma.order.count({ where: { customerId: c.id, createdAt: { gte: c.cartUpdatedAt } } })) { await prisma.customer.update({ where: { id: c.id }, data: { cart: null, cartReminded: 0 } }); continue; }
    const n = JSON.parse(c.cart || '[]').reduce((a, i) => a + i.quantity, 0);
    if (!n) continue;
    await notifyVisitor('cust-' + c.id, { title: 'Товары ждут вас в корзине', body: `В корзине ${n} шт. — оформите заказ, пока они в наличии`, url: '/cart' });
    if (stage === 2 && s.remindSms === '1' && s.smsMode === 'smsru') await sendSms(s, c.phone, `${s.title || 'Магазин'}: товары ждут вас в корзине. ${base}/cart`).catch(() => {});
    await prisma.customer.update({ where: { id: c.id }, data: { cartReminded: stage } });
    sent++;
  }
  return sent;
}

async function run(force) {
  if (running || (!force && Date.now() - lastRun < 5 * 60e3)) return null;
  running = true; lastRun = Date.now();
  try {
    const s = await getShopSettings();
    return { waitlist: await waitlist(s), carts: await carts(s) };
  } catch (e) { console.error('jobs:', e.message); return null; } finally { running = false; }
}

function start() {
  const t = setInterval(() => run(), 5 * 60e3);
  t.unref?.();
}

module.exports = { run, start };
