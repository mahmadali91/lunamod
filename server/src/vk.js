// Сообщества ВКонтакте: подключение (ссылка + ключ), загрузка постов, товары из постов, выгрузка товаров в раздел «Товары».
// Настройки (таблица Setting):
//   vk_groups   — JSON [{ id, screenName, name, photo, token }] — ключ доступа сообщества;
//   vk_service  — сервисный ключ приложения ВК (чтение постов, если ключом сообщества нельзя);
//   vk_user     — ключ пользователя с правами «Товары», «Фото» (выгрузка товаров в ВК);
//   vk_imports  — JSON { "groupId_postId": [id карточек] } — что уже добавлено из постов;
//   vk_market   — JSON { "groupId:cardId": itemId } — что уже выгружено в «Товары» ВК.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const prisma = require('./db');
const { UPLOAD_DIR } = require('./paths');
const { HttpError, generateEan13 } = require('./util');
const { parsePost } = require('./vkparse');

const V = '5.199';
const API = 'https://api.vk.com/method/';

async function getJson(key, def) {
  const r = await prisma.setting.findUnique({ where: { key } });
  try { return r ? JSON.parse(r.value) : def; } catch { return def; }
}
async function setJson(key, value) {
  const v = typeof value === 'string' ? value : JSON.stringify(value);
  await prisma.setting.upsert({ where: { key }, update: { value: v }, create: { key, value: v } });
}
const getKey = async (key) => (await prisma.setting.findUnique({ where: { key } }))?.value || '';

// ---------- вход через VK ID (OAuth 2.1 + PKCE): ключ пользователя на 1 час, продлевается refresh-ключом до 180 дней ----------
const VKID = 'https://id.vk.com';
const SCOPE = 'wall groups photos video market docs';
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function redirectUri() {
  const s = await require('./shop/settings').getShopSettings();
  return String(s.siteUrl || process.env.SITE_URL || '').replace(/\/$/, '') + '/api/vk/oauth';
}
async function appId() { return (await getKey('vk_app_id')) || ''; }

async function oauthStart() {
  const id = await appId();
  if (!id) throw new HttpError(400, 'Укажите ID приложения ВК');
  const verifier = b64url(crypto.randomBytes(48));
  const state = b64url(crypto.randomBytes(24));
  await setJson('vk_oauth_state', { state, verifier, at: Date.now() });
  const q = new URLSearchParams({ response_type: 'code', client_id: id, scope: SCOPE, redirect_uri: await redirectUri(), state,
    code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256' });
  return { url: `${VKID}/authorize?${q}`, redirectUri: await redirectUri() };
}

async function tokenRequest(form) {
  const res = await fetch(`${VKID}/oauth2/auth`, { method: 'POST', body: new URLSearchParams(form), signal: AbortSignal.timeout(20000) });
  const d = await res.json().catch(() => ({}));
  if (!d.access_token) throw new HttpError(400, 'VK ID: ' + (d.error_description || d.error || 'не удалось получить ключ'));
  return d;
}
const saveOauth = (d, deviceId, prev = {}) => setJson('vk_user_oauth', {
  access: d.access_token, refresh: d.refresh_token || prev.refresh, deviceId: deviceId || prev.deviceId, userId: d.user_id || prev.userId,
  scope: d.scope || prev.scope || '', expiresAt: Date.now() + (Number(d.expires_in) || 3600) * 1000, refreshUntil: d.refresh_token ? Date.now() + 180 * 864e5 : prev.refreshUntil, at: Date.now(),
});

async function oauthCallback({ code, state, device_id: deviceId }) {
  const st = await getJson('vk_oauth_state', null);
  if (!st || st.state !== state || Date.now() - st.at > 15 * 60e3) throw new HttpError(400, 'Ссылка входа устарела — нажмите «Войти через VK ID» ещё раз');
  await prisma.setting.deleteMany({ where: { key: 'vk_oauth_state' } });
  const d = await tokenRequest({ grant_type: 'authorization_code', code, code_verifier: st.verifier, client_id: await appId(), device_id: deviceId, redirect_uri: await redirectUri(), state });
  await saveOauth(d, deviceId);
  return d;
}

/** Ключ пользователя: из входа через VK ID (с продлением) или вставленный вручную. */
async function userToken() {
  const o = await getJson('vk_user_oauth', null);
  if (o?.access) {
    if (o.expiresAt - Date.now() > 5 * 60e3) return o.access;
    if (o.refresh) {
      try {
        const d = await tokenRequest({ grant_type: 'refresh_token', refresh_token: o.refresh, client_id: await appId(), device_id: o.deviceId, state: b64url(crypto.randomBytes(12)) });
        await saveOauth(d, o.deviceId, o);
        return d.access_token;
      } catch (e) { console.error('VK ID refresh:', e.message); }
    }
  }
  return getKey('vk_user');
}

const HINT = {
  5: 'ключ недействителен или отозван — создайте новый',
  15: 'нет доступа: у ключа не хватает прав',
  27: 'этим ключом сообщества метод недоступен — укажите сервисный ключ приложения ВК (для постов) или ключ пользователя (для товаров)',
  28: 'ключом приложения метод недоступен — нужен ключ пользователя с правами «Товары» и «Фото»',
  100: 'ВК не принял параметры запроса',
  203: 'нет доступа к сообществу — проверьте, что ключ от этого сообщества',
  1400: 'раздел «Товары» в сообществе не включён',
};

/** Вызов API ВК. */
async function vk(method, params, token) {
  if (!token) throw new HttpError(400, 'Не указан ключ доступа ВК');
  const body = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])), access_token: token, v: V });
  const res = await fetch(API + method, { method: 'POST', body, signal: AbortSignal.timeout(30000) });
  const d = await res.json().catch(() => ({}));
  if (d.error) {
    const code = d.error.error_code;
    const msg = HINT[code] ? `${HINT[code]} (ВК: ${d.error.error_msg})` : `ВК: ${d.error.error_msg || 'ошибка'} (код ${code})`;
    throw Object.assign(new HttpError(400, msg), { vkCode: code });
  }
  return d.response;
}

/** Ссылка или короткое имя → screen_name / id */
function parseLink(link) {
  const s = String(link || '').trim().replace(/^https?:\/\/(m\.)?vk\.(com|ru)\//i, '').replace(/^@/, '').split(/[/?#]/)[0];
  const m = s.match(/^(?:club|public|event)(\d+)$/i);
  return m ? m[1] : s;
}

// ---------- сообщества ----------
const publicGroup = (g) => ({ id: g.id, screenName: g.screenName, name: g.name, photo: g.photo, hasToken: Boolean(g.token), url: `https://vk.com/${g.screenName || 'club' + g.id}` });

async function listGroups() {
  return (await getJson('vk_groups', [])).map(publicGroup);
}

async function addGroup({ link, token }) {
  const ref = parseLink(link);
  if (!ref) throw new HttpError(400, 'Укажите ссылку на сообщество');
  const key = String(token || '').trim();
  const service = await getKey('vk_service');
  if (!key && !service) throw new HttpError(400, 'Укажите ключ доступа сообщества (Управление → Работа с API → Ключи доступа)');
  const r = await vk('groups.getById', { group_id: ref, fields: 'market,screen_name' }, key || service);
  const g = (r.groups || r)[0];
  if (!g) throw new HttpError(400, 'Сообщество не найдено');
  const list = await getJson('vk_groups', []);
  const item = { id: g.id, screenName: g.screen_name, name: g.name, photo: g.photo_100 || g.photo_50 || null, token: key || null };
  const i = list.findIndex((x) => x.id === g.id);
  if (i >= 0) list[i] = { ...list[i], ...item, token: key || list[i].token }; else list.push(item);
  await setJson('vk_groups', list);
  return { ...publicGroup(item), market: g.market || null };
}

async function removeGroup(id) {
  const list = (await getJson('vk_groups', [])).filter((g) => g.id !== Number(id));
  await setJson('vk_groups', list);
}

async function findGroup(id) {
  const g = (await getJson('vk_groups', [])).find((x) => x.id === Number(id));
  if (!g) throw new HttpError(404, 'Сообщество не подключено');
  return g;
}

// ---------- посты ----------
const bestPhoto = (p) => (p?.sizes || []).reduce((a, s) => (!a || s.width * s.height > a.width * a.height ? s : a), null);

function postBlock(groupId, p, imports) {
  const src = p.copy_history?.length && !(p.attachments || []).length ? p.copy_history[0] : p; // репост: вложения из оригинала
  const text = [p.text, src !== p ? src.text : ''].filter(Boolean).join('\n\n');
  const att = src.attachments || [];
  const photos = att.filter((a) => a.type === 'photo').map((a) => bestPhoto(a.photo)).filter(Boolean).map((s) => s.url);
  const videos = att.filter((a) => a.type === 'video').map((a) => ({
    ownerId: a.video.owner_id, id: a.video.id, accessKey: a.video.access_key || null, title: a.video.title || '',
    image: (a.video.image || []).reduce((x, i) => (!x || i.width > x.width ? i : x), null)?.url || null,
  }));
  return {
    key: `${groupId}_${p.id}`, postId: p.id, date: new Date(p.date * 1000).toISOString(), url: `https://vk.com/wall-${groupId}_${p.id}`,
    text, photos, videos, parsed: parsePost(text), imported: imports[`${groupId}_${p.id}`] || null,
  };
}

async function loadPosts(groupId, { offset = 0, count = 20 } = {}) {
  const g = await findGroup(groupId);
  const imports = await getJson('vk_imports', {});
  const params = { owner_id: -g.id, offset: Math.max(0, Number(offset) || 0), count: Math.min(50, Math.max(1, Number(count) || 20)), filter: 'owner' };
  // стену читаем сервисным ключом приложения или ключом пользователя (ключом сообщества ВК не даёт — ошибка 27)
  const tokens = [await getKey('vk_service'), await userToken(), g.token].filter(Boolean);
  let r; let err;
  for (const t of tokens) {
    try { r = await vk('wall.get', params, t); break; } catch (e) { err = e; if (![5, 15, 27, 28].includes(e.vkCode)) throw e; }
  }
  if (!r) throw err || new HttpError(400, 'Нет ключа для чтения постов — укажите сервисный ключ приложения или войдите через VK ID');
  const items = (r.items || []).map((p) => postBlock(g.id, p, imports));
  return { total: r.count || 0, offset: params.offset, items: items.filter((x) => x.photos.length || x.text) };
}

// ---------- товары из поста ----------
async function download(url, prefix) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const type = String(res.headers.get('content-type') || '');
  const ext = type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : type.includes('mp4') || type.includes('video') ? '.mp4' : '.jpg';
  const len = Number(res.headers.get('content-length') || 0);
  if (len > 150 * 1024 * 1024) throw new Error('файл больше 150 МБ');
  const file = `${prefix}-${crypto.randomBytes(5).toString('hex')}${ext}`;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, file), Buffer.from(await res.arrayBuffer()));
  return '/uploads/' + file;
}

/** Ссылка на mp4 видео из поста (нужен ключ пользователя; не всегда ВК отдаёт файл). */
async function videoFile(v) {
  const user = await userToken();
  if (!user) return null;
  const r = await vk('video.get', { videos: `${v.ownerId}_${v.id}${v.accessKey ? '_' + v.accessKey : ''}` }, user).catch(() => null);
  const f = r?.items?.[0]?.files || {};
  return f.mp4_720 || f.mp4_1080 || f.mp4_480 || f.mp4_360 || null;
}

/**
 * Создать товар(ы) из поста: каждый цвет — карточка модели (как на WB), размеры внутри, фото общие.
 * b: { groupId, postId, name, description, categoryId, price, oldPrice, sizes[], colors[], photos[], videos[] }
 */
async function importPost(b) {
  const { pickProduct, saveVariants, saveRelations, slugify } = require('./routes/products');
  const name = String(b.name || '').trim();
  if (!name) throw new HttpError(400, 'Укажите название товара');
  const price = Number(b.price) || 0;
  if (price <= 0) throw new HttpError(400, 'Укажите цену');
  const sizes = [...new Set((b.sizes || []).map((x) => String(x).trim()).filter(Boolean))].slice(0, 30);
  const colors = [...new Set((b.colors || []).map((x) => String(x).trim()).filter(Boolean))].slice(0, 20);
  const photos = (b.photos || []).filter((u) => /^https:\/\//.test(u)).slice(0, 30);
  const report = { cards: [], photos: 0, videos: 0, warnings: [] };

  // фото — один раз, общие для всех цветов (на карточке цвета их потом можно убрать лишние)
  const saved = [];
  for (const u of photos) {
    try { saved.push(await download(u, `vk-${b.groupId}-${b.postId}`)); report.photos++; } catch (e) { report.warnings.push(`Фото не скачалось: ${e.message}`); }
  }
  const videoPaths = [];
  for (const v of (b.videos || []).slice(0, 3)) {
    try {
      const url = await videoFile(v);
      if (!url) { report.warnings.push(`Видео «${v.title || v.id}» ВК не отдаёт файлом — добавьте его в карточку вручную`); continue; }
      videoPaths.push(await download(url, `vk-${b.groupId}-${b.postId}-v`)); report.videos++;
    } catch (e) { report.warnings.push(`Видео не скачалось: ${e.message}`); }
  }

  const list = colors.length ? colors : [null];
  const ids = await prisma.$transaction(async (tx) => {
    const group = list.length > 1 ? await tx.productGroup.create({ data: {} }) : null;
    const out = [];
    for (const color of list) {
      const data = pickProduct({ name, description: b.description, price, oldPrice: Number(b.oldPrice) > price ? b.oldPrice : null, categoryId: b.categoryId, color, showInShop: true, active: true });
      let card = await tx.product.create({ data: { ...data, groupId: group?.id || null } });
      card = await tx.product.update({ where: { id: card.id }, data: { slug: slugify(name) || null } });
      if (sizes.length) {
        await saveRelations(tx, card.id, { attributes: [{ name: 'Источник', value: `ВК: https://vk.com/wall-${b.groupId}_${b.postId}` }] });
        await saveVariants(tx, card, sizes.map((size) => ({ size, price })), null);
      } else {
        await saveRelations(tx, card.id, { barcodes: [], attributes: [{ name: 'Источник', value: `ВК: https://vk.com/wall-${b.groupId}_${b.postId}` }] });
      }
      const media = [...saved.map((p, i) => ({ productId: card.id, path: p, sort: i, kind: 'image' })), ...videoPaths.map((p, i) => ({ productId: card.id, path: p, sort: 100 + i, kind: 'video' }))];
      if (media.length) await tx.productImage.createMany({ data: media });
      out.push(card.id);
    }
    return out;
  }, { timeout: 60000 });
  report.cards = ids;
  const imports = await getJson('vk_imports', {});
  imports[`${b.groupId}_${b.postId}`] = [...(imports[`${b.groupId}_${b.postId}`] || []), ...ids];
  await setJson('vk_imports', imports);
  return report;
}

/** Ещё цвета той же модели: копии карточки (фото, размеры, цена, описание), цвет — новый. */
async function addColors(cardId, colors) {
  const { saveVariants, saveRelations, slugify } = require('./routes/products');
  const src = await prisma.product.findUnique({ where: { id: Number(cardId) }, include: { variants: { orderBy: { sort: 'asc' } }, images: true, attributes: true } });
  if (!src || src.parentId) throw new HttpError(404, 'Карточка не найдена');
  const list = [...new Set((colors || []).map((x) => String(x).trim()).filter(Boolean))].slice(0, 20);
  if (!list.length) throw new HttpError(400, 'Укажите цвета');
  return prisma.$transaction(async (tx) => {
    let groupId = src.groupId;
    if (!groupId) { groupId = (await tx.productGroup.create({ data: {} })).id; await tx.product.update({ where: { id: src.id }, data: { groupId } }); }
    const out = [];
    for (const color of list) {
      const { id, createdAt, updatedAt, variants, images, attributes, sku, wbNmId, wbImtId, featuredPos, slug, ...rest } = src; // eslint-disable-line no-unused-vars
      let card = await tx.product.create({ data: { ...rest, color, groupId, hasVariants: false } });
      card = await tx.product.update({ where: { id: card.id }, data: { slug: slugify(src.name) || null } });
      const attrs = attributes.map((a) => ({ name: a.name, value: a.value }));
      if (variants.length) {
        await saveRelations(tx, card.id, { attributes: attrs });
        await saveVariants(tx, card, variants.map((v) => ({ size: v.size, sizeRu: v.sizeRu, price: v.price, oldPrice: v.oldPrice })), null);
      } else await saveRelations(tx, card.id, { barcodes: [], attributes: attrs });
      if (images.length) await tx.productImage.createMany({ data: images.map((i) => ({ productId: card.id, path: i.path, sort: i.sort, kind: i.kind })) });
      out.push(card.id);
    }
    return out;
  }, { timeout: 60000 });
}

// ---------- выгрузка в «Товары» ВК ----------
async function marketCategories() {
  const user = await userToken();
  const r = await vk('market.getCategories', { count: 1000 }, user);
  const flat = [];
  const walk = (list, prefix) => (list || []).forEach((c) => { flat.push({ id: c.id, name: prefix + c.name }); walk(c.children, prefix + c.name + ' / '); });
  walk(r.items || r, '');
  return flat;
}

async function uploadMarketPhoto(user, groupId, filePath, main) {
  const srv = await vk('photos.getMarketUploadServer', { group_id: groupId, main_photo: main ? 1 : 0 }, user);
  const form = new FormData();
  const abs = path.join(UPLOAD_DIR, path.basename(filePath));
  form.append('file', new Blob([fs.readFileSync(abs)]), path.basename(abs).replace(/\.webp$/i, '.jpg'));
  const up = await (await fetch(srv.upload_url, { method: 'POST', body: form, signal: AbortSignal.timeout(60000) })).json();
  if (up.error) throw new HttpError(400, 'ВК не принял фото: ' + (up.error_descr || up.error));
  const saved = await vk('photos.saveMarketPhoto', { group_id: groupId, photo: up.photo, server: up.server, hash: up.hash, crop_data: up.crop_data, crop_hash: up.crop_hash }, user);
  return saved[0].id;
}

/** Выгрузить карточки в раздел «Товары» сообщества. Возвращает [{ cardId, ok, itemId, error }] */
async function exportToMarket(groupId, cardIds, categoryId) {
  const user = await userToken();
  if (!user) throw new HttpError(400, 'Для выгрузки в «Товары» ВК нужен ключ пользователя с правами «Товары» и «Фото» — или подключите каталог по YML-ссылке (инструкция на странице)');
  const g = await findGroup(groupId);
  const s = await require('./shop/settings').getShopSettings();
  const base = String(s.siteUrl || '').replace(/\/$/, '');
  const map = await getJson('vk_market', {});
  const out = [];
  for (const id of (cardIds || []).map(Number).slice(0, 50)) {
    try {
      const p = await prisma.product.findUnique({ where: { id }, include: { variants: { orderBy: { sort: 'asc' } }, images: { where: { kind: 'image' }, orderBy: { sort: 'asc' }, take: 5 } } });
      if (!p || p.parentId) throw new Error('карточка не найдена');
      if (!p.images.length) throw new Error('нет фото — ВК не принимает товар без фото');
      const url = `${base}/product/${p.id}${p.slug ? '-' + p.slug : ''}`;
      const sizes = p.variants.map((v) => v.size).filter(Boolean);
      const description = [p.description || p.name, '', sizes.length ? 'Размеры: ' + sizes.join(', ') : '', p.color ? 'Цвет: ' + p.color : '', '', 'Заказать на сайте: ' + url].filter((x, i, a) => x || a[i - 1]).join('\n').slice(0, 4000);
      const mainId = await uploadMarketPhoto(user, g.id, p.images[0].path, true);
      const more = [];
      for (const im of p.images.slice(1, 5)) more.push(await uploadMarketPhoto(user, g.id, im.path, false).catch(() => null));
      const params = { owner_id: -g.id, name: p.name.slice(0, 100), description: description.length >= 10 ? description : description + ' '.repeat(10), category_id: categoryId || 1,
        price: p.price, old_price: p.oldPrice && p.oldPrice > p.price ? p.oldPrice : undefined, main_photo_id: mainId, photo_ids: more.filter(Boolean).join(',') || undefined, url, sku: p.sku || undefined };
      const k = `${g.id}:${p.id}`;
      let itemId = map[k];
      if (itemId) await vk('market.edit', { ...params, item_id: itemId }, user).catch(async (e) => { if (e.vkCode === 1403 || /not found|удал/i.test(e.message)) itemId = null; else throw e; });
      if (!itemId) itemId = (await vk('market.add', params, user)).market_item_id;
      map[k] = itemId;
      out.push({ cardId: id, ok: true, itemId, url: `https://vk.com/market-${g.id}?w=product-${g.id}_${itemId}` });
    } catch (e) { out.push({ cardId: id, ok: false, error: e.message }); }
  }
  await setJson('vk_market', map);
  return out;
}

async function keysStatus() {
  const [service, manual, o, app] = await Promise.all([getKey('vk_service'), getKey('vk_user'), getJson('vk_user_oauth', null), appId()]);
  return {
    service: Boolean(service), user: Boolean(manual || o?.access), appId: app, redirectUri: await redirectUri(),
    vkid: o?.access ? { userId: o.userId, scope: o.scope, refreshUntil: o.refreshUntil || null, at: o.at } : null,
  };
}
async function setKeys({ service, user, appId: app }) {
  if (app !== undefined) { const v = String(app || '').replace(/\D/g, ''); if (v) await setJson('vk_app_id', v); }
  for (const [k, v] of [['vk_service', service], ['vk_user', user]]) {
    if (v === undefined || v === '••••••') continue;
    const val = String(v || '').trim();
    if (!val) await prisma.setting.deleteMany({ where: { key: k } });
    else await setJson(k, val);
  }
  return keysStatus();
}

async function logoutVkId() { await prisma.setting.deleteMany({ where: { key: { in: ['vk_user_oauth', 'vk_oauth_state'] } } }); }

module.exports = { oauthStart, oauthCallback, userToken, logoutVkId, vk, parseLink, listGroups, addGroup, removeGroup, loadPosts, importPost, addColors, marketCategories, exportToMarket, keysStatus, setKeys, getJson };
