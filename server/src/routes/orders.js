// Заказы интернет-магазина (админка) и настройки магазина
const express = require('express');
const prisma = require('../db');
const { ah, HttpError, changeStock, nextNumber, str, fillImages, articleOf } = require('../util');
const { requireAdmin } = require('../auth');
const { getShopSettings, saveShopSettings, masked, tbankReady } = require('../shop/settings');
const tbank = require('../shop/tbank');
const sms = require('../shop/sms');

const r = express.Router();
const include = { customer: true, items: { include: { product: { select: { id: true, sku: true, name: true, size: true, sizeRu: true, color: true, parentId: true, images: { where: { kind: 'image' }, take: 1, orderBy: { sort: 'asc' }, select: { path: true } }, stocks: { include: { warehouse: { select: { id: true, name: true } } } },
  barcodes: { where: { isPrimary: true }, select: { code: true } }, parent: { select: { name: true, sku: true } } } } } } };
// заказ для админки: фото размеров берём у карточки, артикул — числовой как на сайте
const loadOrder = async (id) => {
  const o = await prisma.order.findUnique({ where: { id }, include });
  if (!o) return o;
  await fillImages(o.items.map((i) => i.product));
  o.items.forEach((i) => { i.product.article = articleOf(i.product.parentId || i.product.id); });
  return o;
};
const STATUSES = ['new', 'confirmed', 'ready', 'completed', 'cancelled'];

r.get('/', ah(async (req, res) => {
  const where = {};
  if (req.query.status === 'active') where.status = { in: ['new', 'confirmed', 'ready'] };
  else if (STATUSES.includes(req.query.status)) where.status = req.query.status;
  if (req.query.q) { const q = String(req.query.q).replace(/^\+/, ''); where.OR = [{ number: { contains: q } }, { phone: { contains: q.replace(/\D/g, '') || q } }, { name: { contains: q } }]; }
  const [list, counts] = await Promise.all([
    prisma.order.findMany({ where, include: { customer: true, _count: { select: { items: true } } }, orderBy: { id: 'desc' }, take: 300 }),
    prisma.order.groupBy({ by: ['status'], _count: true }),
  ]);
  res.json({ items: list, counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) });
}));

r.get('/:id(\\d+)', ah(async (req, res) => {
  const o = await loadOrder(Number(req.params.id));
  if (!o) throw new HttpError(404, 'Заказ не найден');
  res.json(o);
}));

// Смена статуса. «Выполнен» = товар выдан покупателю: создаём продажу и списываем остаток.
r.post('/:id(\\d+)/status', ah(async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body.status);
  if (!STATUSES.includes(status)) throw new HttpError(400, 'Неизвестный статус');
  const s = await getShopSettings();
  const o = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!o) throw new HttpError(404, 'Заказ не найден');
  if (o.status === 'completed' || o.status === 'cancelled') throw new HttpError(400, 'Заказ уже закрыт');

  if (status === 'completed') {
    const warehouse = s.warehouseId ? await prisma.warehouse.findUnique({ where: { id: Number(s.warehouseId) } }) : await prisma.warehouse.findFirst({ where: { active: true }, orderBy: { id: 'asc' } });
    if (!warehouse) throw new HttpError(400, 'Нет склада для списания — укажите склад в настройках магазина');
    await prisma.$transaction(async (tx) => {
      let channel = await tx.salesChannel.findFirst({ where: { name: 'Интернет-магазин' } });
      if (!channel) channel = await tx.salesChannel.create({ data: { name: 'Интернет-магазин', type: 'online', color: '#6250d6' } });
      let cp = await tx.counterparty.findFirst({ where: { phone: '+' + o.phone } });
      if (!cp) cp = await tx.counterparty.create({ data: { name: o.name || 'Покупатель +' + o.phone, phone: '+' + o.phone, type: 'customer', note: 'Покупатель интернет-магазина' } });
      const number = await nextNumber(tx, 'sale_seq', 'S-');
      const sale = await tx.sale.create({ data: {
        number, warehouseId: warehouse.id, channelId: channel.id, counterpartyId: cp.id, total: o.total, discount: 0,
        paymentMethod: ['tbank', 'sbp'].includes(o.paymentMethod) ? o.paymentMethod : 'cash', paidAmount: o.total, note: `Заказ ${o.number}`,
      } });
      for (const i of o.items) {
        const p = await tx.product.findUnique({ where: { id: i.productId } });
        const it = await tx.saleItem.create({ data: { saleId: sale.id, productId: i.productId, quantity: i.quantity, price: i.price, costPrice: p?.costPrice || 0 } });
        const mv = await changeStock(tx, { productId: i.productId, warehouseId: warehouse.id, quantity: -i.quantity, type: 'SALE', note: `${number} (заказ ${o.number})`, saleId: sale.id, saleItemId: it.id });
        await tx.saleItem.update({ where: { id: it.id }, data: { costPrice: mv.cost } });
      }
      if (o.deliveryPrice > 0) { /* доставка входит в сумму продажи как услуга без товара */ }
      await tx.order.update({ where: { id }, data: { status: 'completed', saleId: sale.id, paymentStatus: o.paymentMethod === 'cash' ? 'paid' : o.paymentStatus, paidAt: o.paidAt || new Date() } });
    });
  } else if (status === 'cancelled') {
    // Отмена и возврат денег — разные действия (как в Т-Бизнесе): сначала «Вернуть», потом отмена
    if (['tbank', 'sbp'].includes(o.paymentMethod) && o.paymentStatus === 'paid' && tbankReady(s)) {
      throw new HttpError(400, 'Заказ оплачен онлайн. Сначала верните деньги кнопкой «Вернуть», затем отменяйте заказ.');
    }
    await prisma.order.update({ where: { id }, data: { status: 'cancelled' } });
  } else {
    await prisma.order.update({ where: { id }, data: { status } });
  }
  res.json(await loadOrder(id));
}));

// Возврат денег покупателю (отдельное действие, как «Вернуть» в Т-Бизнесе). Заказ при этом не отменяется.
r.post('/:id(\\d+)/refund', ah(async (req, res) => {
  const id = Number(req.params.id);
  const s = await getShopSettings();
  const o = await prisma.order.findUnique({ where: { id } });
  if (!o) throw new HttpError(404, 'Заказ не найден');
  if (!['tbank', 'sbp'].includes(o.paymentMethod)) throw new HttpError(400, 'Заказ оплачен не онлайн — верните деньги вручную');
  if (o.paymentStatus === 'refunded') throw new HttpError(400, 'Деньги уже возвращены');
  if (o.paymentStatus !== 'paid' || !o.paymentId) throw new HttpError(400, 'Платёж не найден или ещё не оплачен');
  if (!tbankReady(s)) throw new HttpError(400, 'Онлайн-оплата не настроена — возврат через Т-Банк недоступен');
  await tbank.cancelPayment(s, o.paymentId);
  await prisma.order.update({ where: { id }, data: { paymentStatus: 'refunded' } });
  res.json(await loadOrder(id));
}));

r.put('/:id(\\d+)/note', ah(async (req, res) => {  res.json(await prisma.order.update({ where: { id: Number(req.params.id) }, data: { adminNote: str(req.body.adminNote) } }));
}));

// Отметить оплату наличными / вручную
r.post('/:id(\\d+)/paid', ah(async (req, res) => {
  const id = Number(req.params.id);
  await prisma.order.update({ where: { id }, data: { paymentStatus: 'paid', paidAt: new Date() } });
  res.json(await loadOrder(id));
}));

r.get('/count', ah(async (req, res) => res.json({ new: await prisma.order.count({ where: { status: 'new' } }) })));

// ---------- настройки магазина (только админ) ----------
r.get('/settings', requireAdmin, ah(async (req, res) => res.json(masked(await getShopSettings()))));
r.put('/settings', requireAdmin, ah(async (req, res) => { await saveShopSettings(req.body); res.json(masked(await getShopSettings())); }));
r.post('/settings/test-tbank', requireAdmin, ah(async (req, res) => {
  const s = await getShopSettings();
  if (!s.tbankTerminalKey || !s.tbankPassword) throw new HttpError(400, 'Укажите TerminalKey и пароль терминала');
  // пробный платёж на 10 ₽ без отправки покупателю — проверяет ключи и подпись
  const p = await tbank.initPayment({ ...s, tbankReceipt: '0' }, { id: 0, number: 'TEST-' + Date.now(), total: 10, phone: '70000000000', items: [], deliveryPrice: 0 });
  try { await tbank.cancelPayment(s, p.PaymentId); } catch { /* платёж не оплачен — отмена не обязательна */ }
  res.json({ ok: true, message: 'Ключи верные: Т-Банк принял тестовый запрос' });
}));

// Проверка каналов уведомлений: отправляет тест и возвращает точную причину ошибки
// Баланс и дневной лимит SMS.ru для раздела «SMS для входа покупателей»
r.get('/settings/sms-status', requireAdmin, ah(async (req, res) => {
  const s = await getShopSettings();
  res.json(await sms.status(s.smsruApiId));
}));

// Проверка настроек почты (SMTP): отправляет тестовое письмо
r.post('/settings/smtp-test', requireAdmin, ah(async (req, res) => {
  const s = await getShopSettings();
  const to = str(req.body.to) || s.sellerEmail || s.email;
  if (!to) throw new HttpError(400, 'Укажите адрес для проверки');
  await require('../shop/mail').sendMail(s, { to, subject: 'Проверка почты сайта', text: 'Почта настроена: ' + new Date().toLocaleString('ru-RU') + '. Это тестовое письмо.' });
  res.json({ ok: true, message: 'Письмо отправлено на ' + to });
}));

r.post('/settings/test-notify', requireAdmin, ah(async (req, res) => {
  const n = require('../notify');
  const s = await n.channelSettings();
  const ch = req.body.channel;
  if (ch === 'telegram') {
    if (!s.tgBotToken || !s.tgChatId) throw new HttpError(400, 'Укажите токен бота и ID чата Telegram и сохраните');
    const r = await n.telegram(s, '✅ Уведомления магазина подключены');
    if (!r.ok) throw new HttpError(400, r.error);
  } else if (ch === 'max') {
    if (!s.maxBotToken || !s.maxChatId) throw new HttpError(400, 'Укажите токен бота и ID MAX и сохраните');
    const r = await n.maxSend(s, '✅ Уведомления магазина подключены');
    if (!r.ok) throw new HttpError(400, r.error);
  } else throw new HttpError(400, 'Неизвестный канал');
  res.json({ ok: true, message: 'Тестовое сообщение отправлено' });
}));

// Найти ID чата: последние, кто написал боту
r.post('/settings/find-chat-id', requireAdmin, ah(async (req, res) => {
  const n = require('../notify');
  const s = await n.channelSettings();
  const r = req.body.channel === 'max' ? (s.maxBotToken ? await n.maxUpdates(s) : { ok: false, error: 'Укажите токен бота MAX и сохраните' })
    : (s.tgBotToken ? await n.telegramUpdates(s) : { ok: false, error: 'Укажите токен бота Telegram и сохраните' });
  if (!r.ok) throw new HttpError(400, r.error);
  if (!r.chats.length) throw new HttpError(400, 'Сообщений боту не найдено. Откройте бота, нажмите «Начать» или напишите ему любое сообщение и повторите.');
  res.json(r.chats);
}));

r.get('/settings/notify-log', requireAdmin, ah(async (req, res) => {
  const row = await prisma.setting.findUnique({ where: { key: 'notify_log' } });
  res.json(row ? JSON.parse(row.value) : []);
}));

// Шаблоны документов и способов доставки (для кнопки «вернуть шаблон»)
r.get('/settings/templates', requireAdmin, ah(async (req, res) => {
  const legal = require('../shop/legal');
  const delivery = require('../shop/delivery');
  const s = await getShopSettings();
  res.json({ docs: legal.DOCS, legal: legal.TEMPLATES, carriers: delivery.CARRIERS, methods: delivery.getMethods(s), defaultMethods: delivery.defaultMethods(s) });
}));

module.exports = r;
