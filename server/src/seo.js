// SEO для витрины: сервер отдаёт каждую страницу магазина уже с заголовком, описанием, каноническим адресом,
// Open Graph, микроразметкой Schema.org и текстовым содержимым (его видят поисковые роботы без JavaScript;
// у посетителя React сразу заменяет его интерактивной страницей). Плюс robots.txt, sitemap.xml и счётчик Метрики.
const fs = require('fs');
const path = require('path');
const prisma = require('./db');
const { getShopSettings } = require('./shop/settings');
const legal = require('./shop/legal');
const { slugify } = require('./routes/products');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n = 160) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const rub = (v) => Number(v || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';

let shell = null;
function loadShell(dist) {
  const file = path.join(dist, 'shop.html');
  const mtime = fs.statSync(file).mtimeMs;
  if (!shell || shell.mtime !== mtime) shell = { mtime, html: fs.readFileSync(file, 'utf8') };
  return shell.html;
}

async function storeInfo(req) {
  const s = await getShopSettings();
  const g = Object.fromEntries((await prisma.setting.findMany({ where: { key: { in: ['storeName'] } } })).map((x) => [x.key, x.value]));
  const host = req.get('host') || 'localhost';
  const base = (s.siteUrl || `${/^(localhost|127\.)/.test(host) ? 'http' : 'https'}://${host}`).replace(/\/$/, '');
  return { s, base, title: s.title || g.storeName || 'Интернет-магазин' };
}

function metrikaTag(s) {
  if (!/^\d{5,12}$/.test(s.metrikaId)) return '';
  const id = Number(s.metrikaId);
  const opts = { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: s.metrikaWebvisor === '1', ...(s.metrikaEcommerce === '1' ? { ecommerce: 'dataLayer' } : {}) };
  return `<script>window.dataLayer=window.dataLayer||[];(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym(${id},"init",${json(opts)});</script>`
    + `<noscript><div><img src="https://mc.yandex.ru/watch/${id}" style="position:absolute;left:-9999px" alt=""></div></noscript>`;
}

const productUrl = (base, p) => base + p.url;
const productCard = (base, p) => `<li><a href="${esc(p.url)}">${p.images[0] ? `<img src="${esc(p.images[0])}" alt="${esc(p.name)}" width="300" height="400" loading="lazy">` : ''}${esc(p.name)}</a> — ${rub(p.price)}${p.inStock ? '' : ' (нет в наличии)'}</li>`;

/** Данные страницы по адресу: { status, title, description, canonical, image, type, noindex, jsonld[], body } */
async function pageFor(req, info) {
  const { s, base, title: shopTitle } = info;
  const { productWhere, publicProduct, cardInclude, reviewSummary } = require('./routes/shop');
  const p = req.path.replace(/\/+$/, '') || '/';
  const desc0 = s.seoDescription || s.tagline || `${shopTitle}: каталог товаров с доставкой. Оплата онлайн и при получении.`;
  const org = { '@context': 'https://schema.org', '@type': 'Organization', name: shopTitle, url: base + '/', ...(s.phone ? { telephone: s.phone } : {}), ...(s.email ? { email: s.email } : {}),
    sameAs: Object.values(require('./routes/shop').socialLinks(s)) };

  if (p === '/') {
    const cat = req.query.category ? await prisma.category.findUnique({ where: { id: Number(req.query.category) || 0 } }) : null;
    const where = await productWhere(s, { category: cat?.id, sale: req.query.sale });
    const include = cardInclude(s);
    const [items, cats] = await Promise.all([
      prisma.product.findMany({ where, include, orderBy: { id: 'desc' }, take: 48 }),
      prisma.category.findMany({ where: { products: { some: await productWhere(s, {}) } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    ]);
    const list = items.map((x) => publicProduct(x, s));
    const h1 = cat ? cat.name : req.query.sale ? 'Скидки' : shopTitle;
    const canonical = base + '/' + (cat ? `?category=${cat.id}` : req.query.sale ? '?sale=1' : '');
    return {
      title: cat ? `${cat.name} — купить в интернет-магазине ${shopTitle}` : req.query.sale ? `Скидки и распродажа — ${shopTitle}` : `${shopTitle}${s.tagline ? ' — ' + s.tagline : ''}`,
      description: cat ? clip(`${cat.name} в интернет-магазине ${shopTitle}: ${list.length} товаров${list.length ? ` от ${rub(Math.min(...list.map((x) => x.price)))}` : ''}. Доставка по России, оплата онлайн и при получении.`) : clip(desc0),
      canonical, image: list.find((x) => x.images[0])?.images[0], type: 'website',
      noindex: !!req.query.q, // страницы поиска не индексируем
      jsonld: [
        ...(cat || req.query.sale ? [] : [org, { '@context': 'https://schema.org', '@type': 'WebSite', name: shopTitle, url: base + '/', potentialAction: { '@type': 'SearchAction', target: base + '/?q={search_term_string}', 'query-input': 'required name=search_term_string' } }]),
        { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: list.slice(0, 30).map((x, i) => ({ '@type': 'ListItem', position: i + 1, url: productUrl(base, x), name: x.name })) },
        ...(cat ? [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Главная', item: base + '/' }, { '@type': 'ListItem', position: 2, name: cat.name, item: canonical }] }] : []),
      ],
      body: `<h1>${esc(h1)}</h1>${s.tagline && !cat ? `<p>${esc(s.tagline)}</p>` : ''}<nav><h2>Категории</h2><ul>${cats.map((c) => `<li><a href="/?category=${c.id}">${esc(c.name)}</a></li>`).join('')}</ul></nav><h2>Товары</h2><ul>${list.map((x) => productCard(base, x)).join('')}</ul>`,
    };
  }

  let m = p.match(/^\/product\/(\d+)(-[a-z0-9-]*)?$/);
  if (m) {
    const raw = await prisma.product.findFirst({ where: { id: Number(m[1]), active: true, showInShop: true }, include: { ...cardInclude(s), images: { orderBy: { sort: 'asc' } }, attributes: true, barcodes: true } });
    if (raw?.parentId) return { redirect: `/product/${raw.parentId}` };
    if (!raw || (!raw.hasVariants && raw.price <= 0)) return { status: 404, title: `Товар не найден — ${shopTitle}`, noindex: true, body: '<h1>Товар не найден</h1><p><a href="/">Перейти в каталог</a></p>' };
    const x = publicProduct(raw, s, true);
    // единый адрес товара: /product/12-nazvanie (старые ссылки /product/12 — постоянный редирект)
    if (p !== x.url) return { redirect: x.url };
    const url = productUrl(base, x);
    const rv = await reviewSummary(raw.id);
    const attrs = x.attributes.map((a) => `${a.name}: ${a.value}`).join(', ');
    const gtin = raw.barcodes?.find((b) => /^\d{8}$|^\d{12,14}$/.test(b.code))?.code;
    const sizes = x.sizes.length ? `Размеры: ${x.sizes.join(', ')}. ` : '';
    const avail = (v) => (v ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock');
    const prices = x.hasVariants && x.variants.length ? x.variants.map((v) => v.price) : [x.price];
    return {
      title: `${x.name}${x.brand ? ' ' + x.brand : ''} — купить${x.priceFrom ? ' от' : ' за'} ${rub(x.price)} | ${shopTitle}`,
      description: clip(x.description || `${x.name}${x.category ? ` (${x.category.name})` : ''}${x.priceFrom ? ' от' : ' за'} ${rub(x.price)}. ${sizes}${attrs ? attrs + '. ' : ''}${x.inStock ? 'В наличии' : 'Под заказ'}, доставка по России.`),
      canonical: url, image: x.images[0], type: 'product', price: x.price,
      jsonld: [
        { '@context': 'https://schema.org', '@type': 'Product', name: x.name, sku: x.sku || String(x.id), ...(gtin ? { gtin } : {}), description: clip(x.description || x.name, 5000),
          image: x.images.map((i) => base + i), ...(x.category ? { category: x.category.name } : {}), brand: { '@type': 'Brand', name: x.brand || shopTitle },
          ...(x.colors.length ? { color: x.colors.join(', ') } : {}), ...(x.sizes.length ? { size: x.sizes.join(', ') } : {}),
          ...(x.attributes.length ? { additionalProperty: x.attributes.map((a) => ({ '@type': 'PropertyValue', name: a.name, value: a.value })) } : {}),
          ...(rv.count ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: rv.avg, reviewCount: rv.count, bestRating: 5, worstRating: 1 },
            review: rv.items.slice(0, 5).map((r) => ({ '@type': 'Review', author: { '@type': 'Person', name: r.name }, datePublished: new Date(r.createdAt).toISOString().slice(0, 10), reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5 }, ...(r.text ? { reviewBody: clip(r.text, 500) } : {}) })) } : {}),
          offers: x.hasVariants
            ? { '@type': 'AggregateOffer', url, priceCurrency: 'RUB', lowPrice: Math.min(...prices), highPrice: Math.max(...prices), offerCount: x.variants.length, availability: avail(x.inStock) }
            : { '@type': 'Offer', url, priceCurrency: 'RUB', price: x.price, availability: avail(x.inStock), itemCondition: 'https://schema.org/NewCondition', seller: { '@type': 'Organization', name: s.sellerName || shopTitle } } },
        { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Главная', item: base + '/' },
          ...(x.category ? [{ '@type': 'ListItem', position: 2, name: x.category.name, item: `${base}/?category=${x.category.id}` }] : []),
          { '@type': 'ListItem', position: x.category ? 3 : 2, name: x.name, item: url }] },
      ],
      body: `<nav><a href="/">Главная</a>${x.category ? ` / <a href="/?category=${x.category.id}">${esc(x.category.name)}</a>` : ''}</nav><h1>${esc(x.name)}</h1>`
        + x.images.map((i) => `<img src="${esc(i)}" alt="${esc(x.name)}" width="600" height="800">`).join('')
        + `<p>Цена: ${x.priceFrom ? 'от ' : ''}${rub(x.price)}${x.oldPrice ? ` (было ${rub(x.oldPrice)})` : ''}. ${x.inStock ? 'В наличии' : 'Нет в наличии'}.</p>`
        + (x.sizes.length ? `<p>Размеры: ${esc(x.sizes.join(', '))}</p>` : '') + (x.colors.length ? `<p>Цвета: ${esc(x.colors.join(', '))}</p>` : '')
        + (x.attributes.length ? `<dl>${x.attributes.map((a) => `<dt>${esc(a.name)}</dt><dd>${esc(a.value)}</dd>`).join('')}</dl>` : '')
        + (x.description ? `<div>${esc(x.description).replace(/\n/g, '<br>')}</div>` : '')
        + (rv.count ? `<h2>Отзывы (${rv.count}), средняя оценка ${rv.avg}</h2>` + rv.items.slice(0, 10).map((r) => `<blockquote><b>${esc(r.name)}</b>, ${r.rating}/5${r.text ? ': ' + esc(r.text) : ''}</blockquote>`).join('') : ''),
    };
  }

  if (p === '/favorites') return { title: `Избранное — ${shopTitle}`, noindex: true };

  if (p === '/about') {
    return { title: `Доставка и оплата — ${shopTitle}`, description: clip(`Способы доставки и оплаты в интернет-магазине ${shopTitle}. ${s.address ? 'Самовывоз: ' + s.address + '.' : ''} ${s.phone ? 'Телефон: ' + s.phone : ''}`), canonical: base + '/about', body: `<h1>Доставка и оплата</h1>${s.address ? `<p>Адрес: ${esc(s.address)}</p>` : ''}${s.workHours ? `<p>Часы работы: ${esc(s.workHours)}</p>` : ''}${s.phone ? `<p>Телефон: ${esc(s.phone)}</p>` : ''}`, jsonld: [org] };
  }
  m = p.match(/^\/legal\/(\w+)$/);
  if (m && (legal.DOCS[m[1]] || m[1] === 'requisites')) {
    const t = legal.DOCS[m[1]] || 'Реквизиты продавца';
    return { title: `${t} — ${shopTitle}`, description: clip(`${t} интернет-магазина ${shopTitle}.`), canonical: `${base}/legal/${m[1]}`, body: `<h1>${esc(t)}</h1>` };
  }
  // служебные страницы (корзина, оформление, личный кабинет, заказ) и неизвестные адреса — не индексируются
  const known = /^\/(cart|checkout|account|order\/\d+)$/.test(p);
  return { status: known ? 200 : 404, title: known ? shopTitle : `Страница не найдена — ${shopTitle}`, noindex: true, body: known ? '' : '<h1>Страница не найдена</h1><p><a href="/">Перейти в каталог</a></p>' };
}

async function renderShop(req, res, dist) {
  let html = loadShell(dist);
  const info = await storeInfo(req);
  const { s, base, title: shopTitle } = info;
  let pg;
  try { pg = await pageFor(req, info); } catch (e) { console.error('seo:', e.message); pg = { title: shopTitle }; }
  if (pg.redirect) return res.redirect(301, pg.redirect + (req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : ''));
  const img = pg.image ? (pg.image.startsWith('http') ? pg.image : base + pg.image) : null;
  const head = [
    `<title>${esc(pg.title || shopTitle)}</title>`,
    pg.description ? `<meta name="description" content="${esc(pg.description)}" />` : '',
    pg.noindex ? '<meta name="robots" content="noindex, follow" />' : '<meta name="robots" content="index, follow, max-image-preview:large" />',
    pg.canonical ? `<link rel="canonical" href="${esc(pg.canonical)}" />` : '',
    `<meta property="og:site_name" content="${esc(shopTitle)}" />`, '<meta property="og:locale" content="ru_RU" />',
    `<meta property="og:type" content="${pg.type === 'product' ? 'product' : 'website'}" />`,
    `<meta property="og:title" content="${esc(pg.title || shopTitle)}" />`,
    pg.description ? `<meta property="og:description" content="${esc(pg.description)}" />` : '',
    pg.canonical ? `<meta property="og:url" content="${esc(pg.canonical)}" />` : '',
    img ? `<meta property="og:image" content="${esc(img)}" />` : '',
    pg.price ? `<meta property="product:price:amount" content="${pg.price}" /><meta property="product:price:currency" content="RUB" />` : '',
    `<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}" />`,
    s.yandexVerification ? `<meta name="yandex-verification" content="${esc(s.yandexVerification)}" />` : '',
    s.googleVerification ? `<meta name="google-site-verification" content="${esc(s.googleVerification)}" />` : '',
    ...(pg.jsonld || []).map((j) => `<script type="application/ld+json">${json(j)}</script>`),
    metrikaTag(s),
  ].filter(Boolean).join('\n    ');
  html = html.replace(/<title>[\s\S]*?<\/title>/, '').replace(/<meta name="description"[^>]*>/, '').replace('</head>', `    ${head}\n  </head>`);
  if (pg.body) html = html.replace('<div id="root"></div>', `<div id="root"><div class="seo-prerender">${pg.body}</div></div>`);
  res.status(pg.status || 200).set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }).send(html);
}

async function robots(req, res) {
  const { base } = await storeInfo(req);
  res.type('text/plain').send([
    'User-agent: *',
    'Disallow: /admin', 'Disallow: /api/', 'Disallow: /cart', 'Disallow: /checkout', 'Disallow: /account', 'Disallow: /order/',
    'Disallow: /favorites', 'Disallow: /*?q=', 'Disallow: /*&q=', 'Disallow: /*?chat=', 'Disallow: /*testpay',
    'Allow: /uploads/',
    'Clean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&yclid&gclid&from /',
    '', `Sitemap: ${base}/sitemap.xml`, '',
  ].join('\n'));
}

async function sitemap(req, res) {
  const { s, base } = await storeInfo(req);
  const { productWhere } = require('./routes/shop');
  const where = await productWhere(s, {});
  const [products, cats] = await Promise.all([
    prisma.product.findMany({ where, select: { id: true, slug: true, updatedAt: true, images: { where: { kind: 'image' }, orderBy: { sort: 'asc' }, take: 5, select: { path: true } }, name: true }, orderBy: { id: 'desc' }, take: 45000 }),
    prisma.category.findMany({ where: { products: { some: where } }, select: { id: true } }),
  ]);
  const d = (x) => (x ? new Date(x).toISOString().slice(0, 10) : null);
  const last = products.reduce((a, p) => (p.updatedAt > a ? p.updatedAt : a), new Date(0));
  const u = (loc, mod, pr, extra = '') => `<url><loc>${esc(loc)}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ''}<priority>${pr}</priority>${extra}</url>`;
  const xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    u(base + '/', d(last), '1.0'),
    ...cats.map((c) => u(`${base}/?category=${c.id}`, d(last), '0.8')),
    ...products.map((p) => u(`${base}/product/${p.id}-${p.slug || slugify(p.name) || 'tovar'}`, d(p.updatedAt), '0.7', p.images.map((i) => `<image:image><image:loc>${esc(base + i.path)}</image:loc></image:image>`).join(''))),
    u(base + '/about', null, '0.4'),
    ...Object.keys(legal.DOCS).map((k) => u(`${base}/legal/${k}`, null, '0.2')),
    '</urlset>'];
  res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(xml.join('\n'));
}

// Товарный фид YML (Яндекс Товары / Маркет, VK, Яндекс Директ): каждый размер/цвет — отдельное предложение,
// варианты одной карточки объединены group_id
async function feed(req, res) {
  const { s, base, title } = await storeInfo(req);
  const { productWhere } = require('./routes/shop');
  const where = await productWhere({ ...s, showOutOfStock: '1' }, {});
  const sw = (st) => st.filter((x) => !s.warehouseId || x.warehouseId === Number(s.warehouseId)).reduce((a, x) => a + x.quantity, 0);
  const [cards, cats] = await Promise.all([
    prisma.product.findMany({ where, include: { images: { where: { kind: 'image' }, orderBy: { sort: 'asc' }, take: 10 }, attributes: true, barcodes: { where: { isPrimary: true } }, stocks: true,
      variants: { where: { active: true }, include: { barcodes: { where: { isPrimary: true } }, stocks: true } } }, take: 20000 }),
    prisma.category.findMany({ select: { id: true, name: true } }),
  ]);
  const x = (t) => esc(String(t ?? '')).replace(/&#39;/g, '&apos;');
  const offer = (p, v) => {
    const it = v || p;
    const qty = Math.max(0, sw(it.stocks));
    const url = `${base}/product/${p.id}-${p.slug || slugify(p.name) || 'tovar'}`;
    const pics = (v?.color ? p.images.filter((i) => !i.color || i.color === v.color) : p.images).slice(0, 10);
    return `<offer id="${it.id}"${v ? ` group_id="${p.id}"` : ''} available="${qty > 0}">`
      + `<name>${x(p.name)}${v ? x([v.color, v.size].filter(Boolean).map((t) => ', ' + t).join('')) : ''}</name><url>${x(url)}</url>`
      + `<price>${it.price}</price>${(it.oldPrice ?? p.oldPrice) > it.price ? `<oldprice>${it.oldPrice ?? p.oldPrice}</oldprice>` : ''}<currencyId>RUR</currencyId>`
      + (p.categoryId ? `<categoryId>${p.categoryId}</categoryId>` : '') + pics.map((i) => `<picture>${x(base + i.path)}</picture>`).join('')
      + (p.brand ? `<vendor>${x(p.brand)}</vendor>` : '') + (p.sku ? `<vendorCode>${x(p.sku)}</vendorCode>` : '')
      + (p.description ? `<description>${x(p.description.slice(0, 3000))}</description>` : '')
      + (it.barcodes[0] && /^\d{8,14}$/.test(it.barcodes[0].code) ? `<barcode>${it.barcodes[0].code}</barcode>` : '')
      + (v?.color ? `<param name="Цвет">${x(v.color)}</param>` : '') + (v?.size ? `<param name="Размер" unit="RU">${x(v.size)}</param>` : '')
      + p.attributes.map((a) => `<param name="${x(a.name)}">${x(a.value)}</param>`).join('')
      + `<count>${qty}</count></offer>`;
  };
  const offers = cards.flatMap((p) => (p.hasVariants ? p.variants.map((v) => offer(p, v)) : p.price > 0 ? [offer(p)] : []));
  const date = new Date().toISOString().slice(0, 16).replace('T', ' ');
  res.type('application/xml').set('Cache-Control', 'public, max-age=1800').send(`<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="${date}"><shop><name>${x(title)}</name><company>${x(s.sellerName || title)}</company><url>${x(base)}/</url>
<currencies><currency id="RUR" rate="1"/></currencies>
<categories>${cats.map((c) => `<category id="${c.id}">${x(c.name)}</category>`).join('')}</categories>
<offers>${offers.join('\n')}</offers></shop></yml_catalog>`);
}

// Манифест приложения (PWA) — название и цвета магазина из настроек
async function manifest(req, res) {
  const { s, title } = await storeInfo(req);
  res.type('application/manifest+json').set('Cache-Control', 'public, max-age=3600').send(JSON.stringify({
    name: title, short_name: title.slice(0, 12), description: s.seoDescription || s.tagline || title, lang: 'ru',
    start_url: '/?source=pwa', scope: '/', display: 'standalone', background_color: '#ffffff', theme_color: '#0f172a',
    icons: [
      { src: '/icons/shop-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/shop-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/shop-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [{ name: 'Избранное', url: '/favorites' }, { name: 'Корзина', url: '/cart' }, { name: 'Мои заказы', url: '/account' }],
  }));
}

module.exports = { renderShop, robots, sitemap, feed, manifest };
