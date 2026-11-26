// Разбор текста поста ВК в черновик товара: название, цена, старая цена, размеры, цвета, описание.
// Посты продавцов пишут по-разному — разбор «лучшее предположение», всё можно поправить перед добавлением.

const COLORS = [
  'черный', 'чёрный', 'белый', 'молочный', 'айвори', 'кремовый', 'бежевый', 'песочный', 'капучино', 'мокко', 'кофейный', 'шоколадный', 'коричневый', 'карамельный',
  'серый', 'графит', 'графитовый', 'антрацит', 'меланж', 'синий', 'темно-синий', 'тёмно-синий', 'голубой', 'бирюзовый', 'мятный', 'зеленый', 'зелёный',
  'хаки', 'оливковый', 'изумрудный', 'фисташковый', 'красный', 'бордовый', 'бордо', 'вишневый', 'вишнёвый', 'марсала', 'розовый', 'пудровый', 'пудра', 'малиновый',
  'фуксия', 'сиреневый', 'лавандовый', 'фиолетовый', 'лиловый', 'желтый', 'жёлтый', 'горчичный', 'оранжевый', 'терракотовый', 'персиковый', 'коралловый',
  'золотой', 'серебряный', 'джинсовый', 'электрик', 'нюдовый', 'камель', 'шампань',
];
const COLOR_RE = new RegExp(`(?:^|[^а-яё])(${[...COLORS].sort((a, b) => b.length - a.length).join('|')})(?![а-яё])`, 'gi');
const LETTER_SIZES = ['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', '2xl', '3xl', '4xl', '5xl'];
const PIECES = /\n|(?<=[.!])\s+/; // строки и предложения

const clean = (s) => String(s || '')
  .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, ' ')
  .replace(/#[\p{L}\d_@]+/gu, ' ')
  .replace(/[ \t]+/g, ' ')
  .trim();
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const num = (s) => Number(String(s).replace(/[\s ]/g, ''));
const pieces = (text) => text.split(PIECES).map((x) => x.trim()).filter(Boolean);

function findPrice(text) {
  let price = null;
  let oldPrice = null;
  for (const l of pieces(text)) {
    const low = l.toLowerCase();
    const priceLine = /(цена|стоимость|розниц|💰|price)/i.test(l);
    const re = /(\d[\d  ]{0,6}\d|\d{2,})(\s*(?:₽|руб[а-я]*|р\b|р\.|rub))?/gi;
    for (const m of l.matchAll(re)) {
      const v = num(m[1]);
      if (!(v >= 50 && v <= 1e6)) continue;
      if (!priceLine && !m[2]) continue; // число без «₽/руб» вне строки с ценой — это не цена
      const before = low.slice(Math.max(0, m.index - 14), m.index);
      if (/(старая|было|вместо|зач[её]рк)/.test(before)) { oldPrice = oldPrice || v; continue; }
      if (/опт/.test(before)) continue; // оптовая цена — не для витрины
      if (price === null) price = v;
    }
  }
  return { price, oldPrice: oldPrice && price && oldPrice > price ? oldPrice : null };
}

function findSizes(text) {
  const line = pieces(text).find((l) => /(размер|р-р|р\.р|ростовк|\bsizes?\b)/i.test(l));
  if (!line) return [];
  const s = line.replace(/^.*?(размер[а-яё]*|р-р[а-яё]*|р\.р\.?|ростовка|\bsizes?\b)\s*[:\-–—]?\s*/i, '');
  if (/единый|универсальн|one ?size|безразмер/i.test(s)) {
    const range = s.match(/(\d{2})\s*[-–—]\s*(\d{2})/);
    return [range ? `${range[1]}-${range[2]}` : 'Единый'];
  }
  const out = [];
  const fromTo = s.match(/с\s*(\d{2})\s*(?:по|до)\s*(\d{2})/i);
  if (fromTo) {
    for (let x = Number(fromTo[1]); x <= Number(fromTo[2]); x += 2) out.push(String(x));
    return out;
  }
  for (const t of s.split(/[\s,;/|]+/)) {
    const k = t.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (LETTER_SIZES.includes(k)) out.push(k.toUpperCase());
  }
  if (out.length) return [...new Set(out)];
  // числовые: «42-44, 46-48» — парные размеры; «42-48» (одна запись) — раскрываем с шагом 2
  const parts = s.match(/\d{2}(?:\s*[-–—/]\s*\d{2})?/g) || [];
  for (const p of parts) {
    const r = p.match(/(\d{2})\s*[-–—/]\s*(\d{2})/);
    if (r) {
      const a = Number(r[1]);
      const b = Number(r[2]);
      if (b - a === 2 && parts.length > 1) out.push(`${a}-${b}`);
      else if (b > a && b - a <= 16 && a >= 36 && b <= 70 && (b - a) % 2 === 0) for (let x = a; x <= b; x += 2) out.push(String(x));
      else out.push(`${a}-${b}`);
    } else {
      const v = Number(p);
      if ((v >= 36 && v <= 70) || (v >= 24 && v <= 36 && /джинс|брюк/i.test(text))) out.push(String(v));
    }
  }
  return [...new Set(out)];
}

function findColors(text) {
  const line = pieces(text).find((l) => /(цвет|расцвет|colou?r)/i.test(l));
  const out = [];
  if (line) {
    const src = line.replace(/^.*?(цвет[а-яё]*|расцветк[а-яё]*|colou?rs?)\s*[:\-–—]?\s*/i, '');
    for (const t of src.split(/[,;/|]+|\s+и\s+/)) {
      const v = clean(t).replace(/[.!]+$/, '').trim().toLowerCase();
      if (v && v.length <= 30 && !/\d{3,}/.test(v)) out.push(cap(v));
    }
  } else {
    for (const m of text.matchAll(COLOR_RE)) out.push(cap(m[1].toLowerCase()));
  }
  return [...new Set(out)].slice(0, 12);
}

function findName(text) {
  for (const raw of pieces(text)) {
    const l = clean(raw)
      .replace(/\s*(?:цена|стоимость|размер[а-яё]*|р-р|цвет[а-яё]*)\b.*$/i, '') // «Костюм 3500₽ размеры 42-48» → «Костюм»
      .replace(/\s*\d[\d\s]*\s*(?:₽|руб[а-я]*|р\b|р\.).*$/i, '')
      .replace(/^[\s\-–—•*:.!]+/, '').replace(/[\s\-–—•*:.!]+$/, '');
    if (l.length < 3) continue;
    if (/^(цена|стоимость|размер|р-р|цвет|расцвет|ткань|состав|опт|розниц|арт|артикул|в наличии|заказ|доставк)/i.test(l)) continue;
    if (/^[\d\s₽руб.,-]+$/i.test(l)) continue;
    return cap(l.slice(0, 120));
  }
  return '';
}

/** Черновик товара из текста поста. */
function parsePost(text) {
  const t = String(text || '').replace(/\r/g, '');
  const { price, oldPrice } = findPrice(t);
  const description = t.split('\n').map((l) => l.replace(/#[\p{L}\d_@]+/gu, '').trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { name: findName(t), price, oldPrice, sizes: findSizes(t), colors: findColors(t), description };
}

module.exports = { parsePost, findSizes, findColors, findPrice, findName };
