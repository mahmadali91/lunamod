// PDF без печати через браузер: ценники заданного размера и лист подбора заказа.
// jsPDF и шрифт с кириллицей (DejaVu Sans, ~25 КБ) грузятся только при первом скачивании.
import JsBarcode from 'jsbarcode';
import { fileUrl } from './api';

let fonts = null;
const toB64 = (buf) => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const FONT_BASE = '/';

async function newDoc(opts) {
  const { jsPDF } = await import('jspdf');
  if (!fonts) {
    fonts = Promise.all(['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf'].map((f) => fetch(FONT_BASE + 'fonts/' + f).then((r) => { if (!r.ok) throw new Error('Не загрузился шрифт для PDF'); return r.arrayBuffer(); }).then(toB64)));
    fonts.catch(() => { fonts = null; });
  }
  const [regular, bold] = await fonts;
  const doc = new jsPDF(opts);
  doc.addFileToVFS('DejaVuSans.ttf', regular); doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', bold); doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');
  doc.setFont('DejaVu', 'normal');
  return doc;
}

/** Штрихкод векторно: EAN-13 для 13 цифр, иначе Code 128. Возвращает false, если код не кодируется */
function barcode(doc, code, x, y, w, h, { text = true, fontSize = 6 } = {}) {
  if (!code) return false;
  const data = {};
  try { JsBarcode(data, code, { format: /^\d{13}$/.test(code) ? 'EAN13' : 'CODE128', flat: true }); } catch { try { JsBarcode(data, code, { format: 'CODE128' }); } catch { return false; } }
  const bits = (data.encodings || []).map((e) => e.data).join('');
  if (!bits) return false;
  const th = text ? fontSize * 0.42 : 0; // высота подписи, мм
  const m = w / bits.length;
  doc.setFillColor(0, 0, 0);
  for (let i = 0; i < bits.length;) {
    if (bits[i] !== '1') { i++; continue; }
    let j = i; while (bits[j] === '1') j++;
    doc.rect(x + i * m, y, (j - i) * m, h - th, 'F');
    i = j;
  }
  if (text) { doc.setFont('DejaVu', 'normal'); doc.setFontSize(fontSize); doc.text(code, x + w / 2, y + h - 0.2, { align: 'center', charSpace: 0.3 }); }
  return true;
}

/** Текст в несколько строк с ограничением; возвращает высоту в мм */
function lines(doc, text, x, y, maxW, { size, bold, max = 2, lh = 1.15 } = {}) {
  doc.setFont('DejaVu', bold ? 'bold' : 'normal'); doc.setFontSize(size);
  let ls = doc.splitTextToSize(String(text || ''), maxW);
  if (ls.length > max) { ls = ls.slice(0, max); ls[max - 1] = ls[max - 1].replace(/.{0,2}$/, '…'); }
  const step = size * 0.3528 * lh;
  ls.forEach((l, i) => doc.text(l, x, y + step * (i + 0.8)));
  return step * ls.length;
}

const fitSize = (doc, text, maxW, size, min = 9) => { doc.setFontSize(size); let s = size; while (s > min && doc.getTextWidth(text) > maxW) { s -= 0.5; doc.setFontSize(s); } return s; };
const save = (doc, name) => doc.save(name.replace(/[\\/:*?"<>|]+/g, '_'));

/**
 * Ценники: каждая этикетка — отдельная страница размером w×h мм (для термопринтера).
 * items: [{ name, variant, price, oldPrice, barcode, sku, attrs }]
 */
export async function labelsPdf(items, o, { money, storeName, fileName = 'ценники.pdf' }) {
  const { w, h } = o;
  const doc = await newDoc({ unit: 'mm', format: [w, h], orientation: w > h ? 'landscape' : 'portrait', compress: true });
  const px = 2, py = 1.5, iw = w - px * 2;
  items.forEach((p, n) => {
    if (n) doc.addPage([w, h], w > h ? 'landscape' : 'portrait');
    let y = py;
    if (o.template === 'barcode') {
      y += lines(doc, p.name, px, y, iw, { size: 7.5, bold: true, max: 2 });
      if (p.variant) y += lines(doc, p.variant, px, y, iw, { size: 8, max: 1 });
      if (o.showAttrs && p.attrs) y += lines(doc, p.attrs, px, y, iw, { size: 6.5, max: 1 });
      const skuH = o.showSku && p.sku ? 3.2 : 0;
      const bh = Math.max(8, h - py - y - skuH - 1);
      const bw = Math.min(iw, 50);
      barcode(doc, p.barcode, (w - bw) / 2, y + 0.5, bw, bh, { fontSize: 7 });
      if (skuH) { doc.setFont('DejaVu', 'bold'); doc.setFontSize(7); doc.text(`Арт. ${p.sku}`, w / 2, h - py, { align: 'center' }); }
      return;
    }
    if (o.showStore && storeName) {
      doc.setFont('DejaVu', 'normal'); doc.setFontSize(6); doc.text(String(storeName).toUpperCase(), px, y + 2, { charSpace: 0.15 });
      doc.setLineWidth(0.2); doc.line(px, y + 2.8, w - px, y + 2.8); y += 3.6;
    }
    y += lines(doc, p.name, px, y, iw, { size: 9.5, bold: true, max: 2 });
    if (p.variant) y += lines(doc, p.variant, px, y, iw, { size: 8, max: 1 });
    if (o.showAttrs && p.attrs) y += lines(doc, p.attrs, px, y, iw, { size: 6.5, max: 1 });
    // низ: штрихкод 13 мм и артикул, над ними — цена
    const bottomH = 13, by = h - py - bottomH;
    const hasOld = o.showOld && p.oldPrice > p.price;
    const price = money(p.price);
    doc.setFont('DejaVu', 'bold');
    const ps = fitSize(doc, price, hasOld ? iw * 0.68 : iw, hasOld ? 17 : 20);
    const pY = Math.max(y + ps * 0.3528, by - 1.2);
    doc.text(price, px, pY);
    if (hasOld) {
      const pw = doc.getTextWidth(price);
      doc.setFont('DejaVu', 'normal'); doc.setFontSize(8);
      const ox = px + pw + 2, ot = money(p.oldPrice);
      doc.text(ot, ox, pY); doc.setLineWidth(0.25); doc.line(ox, pY - 1, ox + doc.getTextWidth(ot), pY - 1);
    }
    const skuW = o.showSku && p.sku ? 15 : 0;
    barcode(doc, p.barcode, px, by + 0.3, Math.min(iw - skuW - 1, 36), bottomH - 0.3, { fontSize: 6.5 });
    if (skuW) {
      doc.setFont('DejaVu', 'normal'); doc.setFontSize(6); doc.text('арт.', w - px, h - py - 2.6, { align: 'right' });
      doc.setFont('DejaVu', 'bold'); doc.setFontSize(fitSize(doc, String(p.sku), skuW, 6, 4)); doc.text(String(p.sku), w - px, h - py, { align: 'right' });
    }
  });
  save(doc, fileName);
}

// фото товара → JPEG (jsPDF не умеет WebP); не загрузилось — без фото
async function jpeg(path, px = 160) {
  if (!path) return null;
  try {
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = fileUrl(path);
    await img.decode();
    const c = document.createElement('canvas'); const r = Math.min(1, px / Math.max(img.width, img.height));
    c.width = Math.max(1, Math.round(img.width * r)); c.height = Math.max(1, Math.round(img.height * r));
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return { data: c.toDataURL('image/jpeg', 0.8), w: c.width, h: c.height };
  } catch { return null; }
}

/**
 * Лист подбора заказа (A4): что взять со склада — фото, товар, цвет, размер, артикул, штрихкод, место/остаток, количество и отметка.
 * rows: [{ image, name, color, size, article, sku, barcode, quantity, stocks: [{ name, quantity }] }]
 */
export async function pickListPdf(order, rows, { money, storeName, fmtDate }) {
  const doc = await newDoc({ unit: 'mm', format: 'a4', compress: true });
  const W = 210, M = 12, CW = W - M * 2;
  let y = M;
  doc.setFont('DejaVu', 'bold'); doc.setFontSize(16); doc.text(`Лист подбора · заказ ${order.number}`, M, y + 5);
  doc.setFont('DejaVu', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90);
  doc.text([storeName, `Создан ${fmtDate(order.createdAt)}`, `Напечатан ${fmtDate(new Date())}`].filter(Boolean).join(' · '), M, y + 10.5);
  doc.setTextColor(0);
  y += 15;
  const info = [
    ['Покупатель', [order.name, order.phone && '+' + order.phone].filter(Boolean).join(', ') || '—'],
    ['Получение', [order.deliveryName || order.delivery, order.address].filter(Boolean).join(' — ')],
    ['Оплата', order.paymentLabel],
    ...(order.comment ? [['Комментарий', order.comment]] : []),
  ];
  for (const [k, v] of info) {
    doc.setFont('DejaVu', 'bold'); doc.setFontSize(9); doc.text(k + ':', M, y + 3.5);
    y += Math.max(5, lines(doc, v || '—', M + 28, y, CW - 28, { size: 9, max: 3 }) + 1.2);
  }
  y += 3;
  // таблица
  const cols = [['', 16], ['Товар', 56], ['Цвет / размер', 34], ['Штрихкод', 38], ['Остаток', 22], ['Кол-во', 12], ['', 8]];
  const head = () => {
    doc.setFillColor(238, 242, 255); doc.rect(M, y, CW, 7, 'F');
    doc.setFont('DejaVu', 'bold'); doc.setFontSize(8);
    let x = M; cols.forEach(([t, cw], i) => { doc.text(t, i >= 5 ? x + cw / 2 : x + 1.5, y + 4.7, i >= 5 ? { align: 'center' } : undefined); x += cw; });
    y += 7;
  };
  head();
  const pics = await Promise.all(rows.map((r) => jpeg(r.image)));
  let total = 0;
  rows.forEach((r, n) => {
    const rh = 20;
    if (y + rh > 297 - M - 22) { doc.addPage(); y = M; head(); }
    let x = M;
    const pic = pics[n];
    if (pic) { const s = Math.min(14 / pic.w, 18 / pic.h); doc.addImage(pic.data, 'JPEG', x + 1, y + 1, pic.w * s, pic.h * s); }
    else { doc.setDrawColor(210); doc.rect(x + 1, y + 1, 14, 18); }
    x += cols[0][1];
    const ny = lines(doc, r.name, x + 1.5, y + 1, cols[1][1] - 3, { size: 8.5, bold: true, max: 2 });
    doc.setFont('DejaVu', 'normal'); doc.setFontSize(7.5); doc.setTextColor(90);
    doc.text([`Арт. ${r.article}`, r.sku && `${r.sku}`].filter(Boolean).join(' · '), x + 1.5, y + 1 + ny + 3, { maxWidth: cols[1][1] - 3 });
    doc.setTextColor(0);
    x += cols[1][1];
    if (r.color) lines(doc, r.color, x + 1.5, y + 1, cols[2][1] - 3, { size: 8, max: 1 });
    // размер крупно, но не шире колонки; российский размер — строкой ниже
    if (r.size) {
      const cw = cols[2][1] - 3;
      doc.setFont('DejaVu', 'bold');
      const fs = fitSize(doc, String(r.size), cw, 13, 7);
      doc.setFontSize(fs);
      doc.text(doc.splitTextToSize(String(r.size), cw)[0], x + 1.5, y + 11);
      if (r.sizeRu) lines(doc, `рос. ${r.sizeRu}`, x + 1.5, y + 12.5, cw, { size: 7.5, max: 1 });
    }
    x += cols[2][1];
    if (!barcode(doc, r.barcode, x + 1.5, y + 2.5, cols[3][1] - 4, 13, { fontSize: 7 })) { doc.setFontSize(8); doc.text('—', x + 1.5, y + 6); }
    x += cols[3][1];
    doc.setFont('DejaVu', 'normal'); doc.setFontSize(7.5);
    let sy = y + 1;
    (r.stocks || []).slice(0, 3).forEach((s) => { const low = s.quantity < r.quantity; doc.setTextColor(low ? 200 : 60, low ? 30 : 60, low ? 30 : 60); sy += lines(doc, `${s.name}: ${s.quantity}`, x + 1.5, sy, cols[4][1] - 3, { size: 7, max: 2 }) + 0.6; });
    if (!(r.stocks || []).length) { doc.setTextColor(200, 30, 30); lines(doc, 'нет на складе', x + 1.5, sy, cols[4][1] - 3, { size: 7, max: 1 }); }
    doc.setTextColor(0);
    x += cols[4][1];
    doc.setFont('DejaVu', 'bold'); doc.setFontSize(14); doc.text(String(r.quantity), x + cols[5][1] / 2, y + 11.5, { align: 'center' });
    x += cols[5][1];
    doc.setDrawColor(60); doc.setLineWidth(0.3); doc.rect(x + 1.5, y + 7.5, 5, 5);
    total += Number(r.quantity) || 0;
    y += rh;
    doc.setDrawColor(225); doc.setLineWidth(0.2); doc.line(M, y, M + CW, y);
  });
  y += 6;
  doc.setFont('DejaVu', 'bold'); doc.setFontSize(10);
  doc.text(`Позиций: ${rows.length} · Всего единиц: ${total}`, M, y);
  doc.text(`Сумма заказа: ${money(order.total)}`, M + CW, y, { align: 'right' });
  y += 12;
  doc.setFont('DejaVu', 'normal'); doc.setFontSize(9); doc.setDrawColor(120);
  doc.text('Собрал', M, y); doc.line(M + 14, y + 0.5, M + 75, y + 0.5);
  doc.text('Проверил', M + 95, y); doc.line(M + 113, y + 0.5, M + CW, y + 0.5);
  // номера страниц
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(140); doc.text(`Заказ ${order.number} · стр. ${i} из ${pages}`, W - M, 297 - 6, { align: 'right' }); }
  save(doc, `лист-подбора-${order.number}.pdf`);
}

/**
 * Товарный чек продажи (A4) со скачиванием PDF: реквизиты продавца, товары, скидка, итог, способ оплаты.
 * sale: продажа из админки (number, date, items, total, discount, paymentMethod)
 */
export async function receiptPdf(sale, { seller = {}, storeName = '', money, fmtDate, paymentLabel = '' }) {
  const doc = await newDoc({ unit: 'mm', format: 'a4', compress: true });
  const W = 210, M = 15, CW = W - M * 2;
  let y = M;

  doc.setFont('DejaVu', 'bold'); doc.setFontSize(16);
  doc.text(storeName || 'Магазин', M, y + 5);
  y += 9;
  doc.setFont('DejaVu', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90);
  const req = [
    seller.name,
    [seller.inn && `ИНН ${seller.inn}`, seller.ogrn && `ОГРН ${seller.ogrn}`].filter(Boolean).join(' · '),
    seller.address,
    [seller.phone && `тел. ${seller.phone}`, seller.email].filter(Boolean).join(' · '),
  ].filter(Boolean);
  for (const line of req) { y += lines(doc, line, M, y, CW, { size: 8.5, max: 2 }) + 0.6; }
  doc.setTextColor(0);

  y += 4;
  doc.setFont('DejaVu', 'bold'); doc.setFontSize(13);
  doc.text(`ТОВАРНЫЙ ЧЕК № ${sale.number}`, M, y + 4);
  doc.setFont('DejaVu', 'normal'); doc.setFontSize(9); doc.text(`от ${fmtDate ? fmtDate(sale.date) : new Date(sale.date).toLocaleString('ru-RU')}`, W - M, y + 4, { align: 'right' });
  y += 9;

  // шапка таблицы
  const cols = [['Наименование', 0], ['Кол-во', 96], ['Цена', 121], ['Сумма', 154]];
  const head = () => {
    doc.setFillColor(240, 242, 248); doc.rect(M, y, CW, 7, 'F');
    doc.setFont('DejaVu', 'bold'); doc.setFontSize(8.5);
    doc.text('Наименование', M + 2, y + 4.8);
    doc.text('Кол-во', M + 96, y + 4.8, { align: 'center' });
    doc.text('Цена', M + 121, y + 4.8, { align: 'right' });
    doc.text('Сумма', M + 154, y + 4.8, { align: 'right' });
    y += 7;
  };
  head();

  const items = sale.items || [];
  doc.setFont('DejaVu', 'normal'); doc.setFontSize(8.5);
  for (const it of items) {
    const nm = it.name || it.product?.name || ('Товар #' + it.productId);
    const nameH = lines(doc, nm, M + 2, y + 1, 88, { size: 8.5, max: 3 });
    const rh = Math.max(6.5, nameH + 3);
    if (y + rh > 297 - M - 30) { doc.addPage(); y = M; head(); }
    doc.setFont('DejaVu', 'normal'); doc.setFontSize(8.5);
    doc.text(String(it.quantity), M + 96, y + 4.5, { align: 'center' });
    doc.text(money ? money(it.price) : String(it.price), M + 121, y + 4.5, { align: 'right' });
    doc.text(money ? money(it.price * it.quantity) : String(it.price * it.quantity), M + 154, y + 4.5, { align: 'right' });
    doc.setDrawColor(235); doc.line(M, y + rh, M + CW, y + rh);
    y += rh;
  }

  y += 4;
  doc.setFont('DejaVu', 'normal'); doc.setFontSize(9.5);
  const right = (label, value, bold = false) => {
    doc.setFont('DejaVu', bold ? 'bold' : 'normal');
    doc.text(label, M + 121, y, { align: 'right' });
    doc.text(value, M + 154, y, { align: 'right' });
    y += 6;
  };
  if (Number(sale.discount) > 0) right('Скидка', '−' + (money ? money(sale.discount) : String(sale.discount)));
  doc.setFontSize(11);
  right('ИТОГО', money ? money(sale.total) : String(sale.total), true);
  y += 2;
  doc.setFontSize(9.5); doc.setFont('DejaVu', 'normal');
  doc.text(`Способ оплаты: ${paymentLabel || sale.paymentMethod || '—'}`, M, y + 2);

  y += 12;
  doc.setFontSize(8); doc.setTextColor(110);
  doc.text('Документ сформирован автоматически в программе учёта. Не является фискальным чеком: фискальный чек формирует банк при оплате.', M, y, { maxWidth: CW });
  doc.setTextColor(0);

  save(doc, `Чек-${sale.number}.pdf`);
}
