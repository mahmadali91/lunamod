// Настройки интернет-магазина (хранятся в таблице Setting с префиксом shop_)
const prisma = require('../db');

const DEFAULTS = {
  enabled: '1',               // магазин открыт на главной странице
  title: 'Интернет-магазин',  // название на витрине (по умолчанию — название из основных настроек)
  tagline: 'Одежда и аксессуары с доставкой',
  phone: '', email: '', address: '', workHours: '',
  siteUrl: 'https://botmi.ru',
  // доставка
  pickupEnabled: '1', pickupAddress: '',
  courierEnabled: '1', courierPrice: '300', courierFreeFrom: '5000',
  // оплата
  cashEnabled: '1',
  tbankEnabled: '0', tbankTerminalKey: '', tbankPassword: '', tbankReceipt: '0', tbankTaxation: 'usn_income', tbankTax: 'none',
  // SMS
  smsMode: 'test',            // test — код показывается на экране (только до запуска!), smsru — отправка через SMS.ru
  smsruApiId: '', smsSender: '',
  // каталог и заказы
  warehouseId: '',            // склад, по которому показываем наличие и списываем заказы (пусто = все склады / основной)
  showOutOfStock: '0',        // показывать товары, которых нет в наличии
  allowBackorder: '0',        // разрешить заказывать больше остатка
};
const SECRET = ['tbankPassword', 'smsruApiId'];

async function getShopSettings() {
  const rows = await prisma.setting.findMany({ where: { key: { startsWith: 'shop_' } } });
  const s = { ...DEFAULTS };
  rows.forEach((r) => { const k = r.key.slice(5); if (k in DEFAULTS) s[k] = r.value; });
  return s;
}

async function saveShopSettings(body) {
  for (const k of Object.keys(DEFAULTS)) {
    if (body[k] === undefined) continue;
    if (SECRET.includes(k) && (body[k] === '••••••' || body[k] === null)) continue; // секрет не меняли
    const value = String(body[k]).trim();
    await prisma.setting.upsert({ where: { key: 'shop_' + k }, update: { value }, create: { key: 'shop_' + k, value } });
  }
}

// Для админки: секреты маскируем
const masked = (s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, SECRET.includes(k) && v ? '••••••' : v]));
const tbankReady = (s) => s.tbankEnabled === '1' && Boolean(s.tbankTerminalKey && s.tbankPassword);

module.exports = { getShopSettings, saveShopSettings, masked, tbankReady, DEFAULTS };
