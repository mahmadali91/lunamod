// Раздел «Сообщества ВК»: подключение сообществ, посты → товары, товары → раздел «Товары» ВК
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Plus, Trash2, Download, KeyRound, CheckCircle2, ExternalLink, Loader2, Image as ImageIcon, Video, ChevronDown, Search } from 'lucide-react';
import { api } from '../api';
import { Badge, Button, Field, Modal, PageHeader, PasswordInput, RefSelect, Spinner, useToast } from '../ui';

const splitList = (s) => String(s || '').split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);

// ---------- блок поста ----------
function PostBlock({ groupId, post, onImported }) {
  const toast = useToast();
  const p = post.parsed;
  const [f, setF] = useState({ name: p.name, price: p.price || '', oldPrice: p.oldPrice || '', sizes: p.sizes.join(', '), colors: p.colors.join(', '), categoryId: null, description: p.description });
  const [photos, setPhotos] = useState(() => new Set(post.photos));
  const [withVideo, setWithVideo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [more, setMore] = useState('');
  const [open, setOpen] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const done = post.imported;

  const send = async (extra) => {
    setBusy(true);
    try {
      const colors = [...splitList(f.colors), ...splitList(extra)];
      const r = await api('/vk/import', { method: 'POST', body: {
        groupId, postId: post.postId, name: f.name, description: f.description, categoryId: f.categoryId, price: f.price, oldPrice: f.oldPrice,
        sizes: splitList(f.sizes), colors, photos: post.photos.filter((u) => photos.has(u)), videos: withVideo ? post.videos : [],
      } });
      setAsk(false); setMore('');
      toast(`Добавлено карточек: ${r.cards.length}${r.warnings.length ? ' · ' + r.warnings[0] : ''}`, r.warnings.length ? 'error' : undefined);
      onImported(post.key, r.cards);
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <div className={`card overflow-hidden ${done ? 'opacity-80' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
        <span>{new Date(post.date).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}</span>
        <a href={post.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600">пост в ВК <ExternalLink size={12} /></a>
        {done && <span className="flex flex-wrap items-center gap-1"><Badge color="green">добавлено</Badge>{done.map((id) => <Link key={id} to={`/products/${id}`} className="text-indigo-600 underline">#{id}</Link>)}</span>}
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div>
          {post.photos.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {post.photos.map((u) => {
                const on = photos.has(u);
                return (
                  <button type="button" key={u} onClick={() => { const n = new Set(photos); on ? n.delete(u) : n.add(u); setPhotos(n); }}
                    className={`relative aspect-[3/4] overflow-hidden rounded-lg border-2 ${on ? 'border-indigo-500' : 'border-transparent opacity-40'}`} title={on ? 'Не добавлять это фото' : 'Добавить это фото'}>
                    <img src={u} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" referrerPolicy="no-referrer" />
                    {on && <CheckCircle2 size={18} className="absolute top-1 right-1 rounded-full bg-white text-indigo-600" />}
                  </button>
                );
              })}
            </div>
          ) : <div className="flex items-center gap-2 text-sm text-slate-400"><ImageIcon size={16} /> В посте нет фото</div>}
          {post.videos.length > 0 && (
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={withVideo} onChange={(e) => setWithVideo(e.target.checked)} /><Video size={14} /> Видео из поста ({post.videos.length})</label>
          )}
          <button type="button" onClick={() => setOpen(!open)} className="mt-3 flex items-center gap-1 text-xs text-slate-500"><ChevronDown size={14} className={open ? 'rotate-180' : ''} /> Текст поста</button>
          {open && <pre className="mt-1 max-h-60 overflow-auto rounded-lg bg-slate-50 p-3 text-xs whitespace-pre-wrap">{post.text || '—'}</pre>}
        </div>
        <div className="grid grid-cols-2 gap-3 self-start">
          <Field label="Название" className="col-span-2"><input className="input" value={f.name} onChange={set('name')} /></Field>
          <Field label="Цена, ₽"><input className="input" type="number" min="0" value={f.price} onChange={set('price')} /></Field>
          <Field label="Старая цена, ₽"><input className="input" type="number" min="0" value={f.oldPrice} onChange={set('oldPrice')} placeholder="—" /></Field>
          <Field label="Размеры (через запятую)" className="col-span-2"><input className="input" value={f.sizes} onChange={set('sizes')} placeholder="42-44, 46-48 или S, M, L" /></Field>
          <Field label="Цвета (через запятую; каждый — своя карточка)" className="col-span-2"><input className="input" value={f.colors} onChange={set('colors')} placeholder="чёрный, бежевый" /></Field>
          <Field label="Категория" className="col-span-2"><RefSelect path="/categories" value={f.categoryId} onChange={(v) => setF({ ...f, categoryId: v })} /></Field>
          <Field label="Описание" className="col-span-2"><textarea className="input" rows={3} value={f.description} onChange={set('description')} /></Field>
          <div className="col-span-2 flex justify-end">
            <Button icon={Plus} loading={busy} onClick={() => setAsk(true)}>{done ? 'Добавить ещё раз' : 'Добавить в товары'}</Button>
          </div>
        </div>
      </div>

      <Modal open={ask} onClose={() => setAsk(false)} title="Есть ещё цвета?"
        footer={<>
          <Button variant="secondary" loading={busy} onClick={() => send('')}>Нет, добавить</Button>
          <Button className="ml-auto" loading={busy} disabled={!more.trim()} onClick={() => send(more)}>Добавить с этими цветами</Button>
        </>}>
        <p className="mb-3 text-sm text-slate-600">
          {splitList(f.colors).length ? <>В посте указаны цвета: <b>{splitList(f.colors).join(', ')}</b>.</> : 'В посте цвета не указаны.'} Если у модели есть ещё цвета, впишите их — для каждого будет создана своя карточка с теми же фото, ценой и размерами.
          Лишние фото потом уберёте в карточке цвета.
        </p>
        <Field label="Дополнительные цвета (через запятую)"><input className="input" value={more} onChange={(e) => setMore(e.target.value)} placeholder="например: мокко, графит" autoFocus /></Field>
      </Modal>
    </div>
  );
}

// ---------- выбор своих сообществ (после входа через VK ID) ----------
function MyGroups({ onConnected }) {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(null);
  useEffect(() => { api('/vk/my-groups').then(setList).catch((e) => { setList([]); toast(e.message, 'error'); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!list) return <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Загружаем ваши сообщества…</div>;
  const shown = list.filter((g) => !q || `${g.name} ${g.screenName}`.toLowerCase().includes(q.toLowerCase()));
  const connect = async (g) => {
    setBusy(g.id);
    try { await api('/vk/groups', { method: 'POST', body: { link: String(g.id).replace(/^/, 'club') } }); setList(list.map((x) => (x.id === g.id ? { ...x, connected: true } : x))); toast(`Подключено: ${g.name}`); onConnected(g.id); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  return (
    <div className="mb-4 rounded-xl border border-slate-200">
      <div className="flex items-center gap-2 border-b border-slate-100 p-2">
        <Search size={16} className="ml-1 shrink-0 text-slate-400" />
        <input className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none" name="vk-group-search" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Ваши сообщества (${list.length}) — поиск по названию`} />
      </div>
      <div className="max-h-72 overflow-auto">
        {shown.map((g) => (
          <div key={g.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            {g.photo ? <img src={g.photo} alt="" className="h-8 w-8 shrink-0 rounded-full" referrerPolicy="no-referrer" /> : <div className="h-8 w-8 shrink-0 rounded-full bg-slate-200" />}
            <span className="min-w-0 flex-1"><span className="block truncate">{g.name}</span>{g.members ? <span className="text-xs text-slate-500">{g.members.toLocaleString('ru-RU')} участников</span> : null}</span>
            {g.connected ? <Badge color="green">подключено</Badge> : <Button size="sm" variant="secondary" icon={Plus} loading={busy === g.id} onClick={() => connect(g)}>Подключить</Button>}
          </div>
        ))}
        {!shown.length && <p className="p-3 text-sm text-slate-500">Ничего не нашлось</p>}
      </div>
    </div>
  );
}

// ---------- страница ----------
export default function VkCommunities() {
  const toast = useToast();
  const [d, setD] = useState(null);
  const [link, setLink] = useState('');
  const [token, setToken] = useState('');
  const [adding, setAdding] = useState(false);
  const [keys, setKeys] = useState({ service: '', user: '', appId: '' });
  const [vkBusy, setVkBusy] = useState(false);
  const [active, setActive] = useState(null);
  const [posts, setPosts] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = () => api('/vk').then((r) => { setD(r); setActive((a) => a || r.groups[0]?.id || null); }).catch((e) => toast(e.message, 'error'));
  useEffect(() => {
    load();
    // возврат со страницы VK ID
    const q = new URLSearchParams(window.location.search).get('vkid');
    if (q) { toast(q === 'ok' ? 'Вход через VK ID выполнен' : 'VK ID: ' + q, q === 'ok' ? undefined : 'error'); window.history.replaceState(null, '', window.location.pathname); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPosts(null); }, [active]);
  const group = useMemo(() => d?.groups.find((g) => g.id === active), [d, active]);

  const add = async (e) => {
    e.preventDefault(); setAdding(true);
    try { const g = await api('/vk/groups', { method: 'POST', body: { link, token } }); setLink(''); setToken(''); toast(`Подключено: ${g.name}`); setActive(g.id); load(); } catch (err) { toast(err.message, 'error'); } finally { setAdding(false); }
  };
  const remove = async (g) => { if (!confirm(`Отключить «${g.name}»? Добавленные товары останутся.`)) return; await api('/vk/groups/' + g.id, { method: 'DELETE' }); if (active === g.id) setActive(null); load(); };
  const saveKeys = async () => { try { const k = await api('/vk/keys', { method: 'PUT', body: keys }); setD({ ...d, keys: k }); setKeys({ service: '', user: '', appId: '' }); toast('Сохранено'); } catch (e) { toast(e.message, 'error'); } };
  const vkLogin = async () => {
    setVkBusy(true);
    try {
      if (keys.appId) await api('/vk/keys', { method: 'PUT', body: { appId: keys.appId } });
      const r = await api('/vk/oauth/start', { method: 'POST' });
      window.location.href = r.url;
    } catch (e) { toast(e.message, 'error'); setVkBusy(false); }
  };
  const vkLogout = async () => { if (!confirm('Выйти из VK ID на сайте?')) return; setD({ ...d, keys: await api('/vk/oauth/logout', { method: 'POST' }) }); };
  const loadPosts = async (more) => {
    setLoading(true);
    try {
      const r = await api(`/vk/groups/${active}/posts?count=20&offset=${more ? posts.offset + 20 : 0}`);
      setPosts(more ? { ...r, items: [...posts.items, ...r.items] } : r);
    } catch (e) { toast(e.message, 'error'); } finally { setLoading(false); }
  };
  const imported = (key, cards) => setPosts((p) => ({ ...p, items: p.items.map((x) => (x.key === key ? { ...x, imported: [...(x.imported || []), ...cards] } : x)) }));

  if (!d) return <Spinner />;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Сообщества ВК" subtitle="Посты из сообществ ВКонтакте → товары магазина (фото, цена, размеры, цвета)" />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Users size={18} /> Подключённые сообщества</h2>
          {d.groups.length ? (
            <div className="mb-4 divide-y divide-slate-100">
              {d.groups.map((g) => (
                <div key={g.id} className="flex items-center gap-3 py-2">
                  {g.photo ? <img src={g.photo} alt="" className="h-9 w-9 rounded-full" referrerPolicy="no-referrer" /> : <div className="h-9 w-9 rounded-full bg-slate-200" />}
                  <button type="button" onClick={() => setActive(g.id)} className={`min-w-0 flex-1 truncate text-left text-sm ${active === g.id ? 'font-semibold text-indigo-700' : ''}`}>{g.name}</button>
                  <a href={g.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-600" title="Открыть в ВК"><ExternalLink size={16} /></a>
                  <button type="button" onClick={() => remove(g)} className="text-slate-400 hover:text-rose-600" title="Отключить"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          ) : <p className="mb-4 text-sm text-slate-500">Пока нет подключённых сообществ.</p>}
          {d.keys.vkid ? <MyGroups onConnected={(id) => { setActive(id); load(); }} /> : <p className="mb-4 rounded-lg bg-indigo-50 p-3 text-xs text-indigo-800">Войдите через VK ID (справа) — здесь появится список ваших сообществ, подключение одной кнопкой, без ключей.</p>}
          <details className="text-sm"><summary className="cursor-pointer text-slate-500">Подключить по ссылке и ключу сообщества</summary>
          <form onSubmit={add} className="mt-2 space-y-2" autoComplete="off">
            <Field label="Ссылка на сообщество"><input className="input" name="vk-community-url" autoComplete="off" data-lpignore="true" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://vk.com/имя_сообщества" required /></Field>
            <Field label="Ключ доступа сообщества"><PasswordInput className="input font-mono text-xs" name="vk-community-key" autoComplete="new-password" data-lpignore="true" value={token} onChange={(e) => setToken(e.target.value)} placeholder="vk1.a.…" /></Field>
            <p className="text-xs text-slate-500">В сообществе: <b>Управление → Работа с API → Ключи доступа → Создать ключ</b>, отметьте «Управление сообществом», «Фотографии», «Стена», «Товары». Можно подключить несколько сообществ.</p>
            <Button type="submit" icon={Plus} loading={adding}>Подключить</Button>
          </form>
          </details>
        </div>

        <div className="card space-y-3 p-5">
          <h2 className="flex items-center gap-2 font-semibold"><KeyRound size={18} /> Ключи ВК</h2>
          <div className="space-y-2 rounded-xl bg-slate-50 p-3">
            <div className="text-sm font-medium">Вход через VK ID {d.keys.vkid && <CheckCircle2 size={14} className="inline text-emerald-500" />}</div>
            {d.keys.vkid ? (
              <p className="text-xs text-slate-600">Вход выполнен (пользователь ВК {d.keys.vkid.userId}). Права: {d.keys.vkid.scope || '—'}. Ключ продлевается сам{d.keys.vkid.refreshUntil ? ` до ${new Date(d.keys.vkid.refreshUntil).toLocaleDateString('ru-RU')}` : ''}.</p>
            ) : <p className="text-xs text-slate-600">Даёт сайту ключ пользователя: список ваших сообществ, посты и видео из постов. Войти нужно администратором сообщества.</p>}
            <div className="flex flex-wrap items-end gap-2">
              <Field label="ID приложения ВК" className="w-40"><input className="input" name="vk-app-id" autoComplete="off" data-lpignore="true" inputMode="numeric" value={keys.appId} onChange={(e) => setKeys({ ...keys, appId: e.target.value.replace(/\D/g, '') })} placeholder={d.keys.appId || '54825818'} /></Field>
              <Button icon={KeyRound} loading={vkBusy} onClick={vkLogin}>{d.keys.vkid ? 'Войти заново' : 'Войти через VK ID'}</Button>
              {d.keys.vkid && <Button variant="ghost" onClick={vkLogout}>Выйти</Button>}
            </div>
            <p className="text-xs text-slate-500">В настройках приложения ВК (id.vk.com → приложение → «Доверенный Redirect URL») должен быть адрес: <code className="break-all">{d.keys.redirectUri}</code></p>
          </div>
          <Field label={<>Сервисный ключ приложения {d.keys.service && <CheckCircle2 size={14} className="inline text-emerald-500" />}</>}>
            <PasswordInput className="input font-mono text-xs" name="vk-service-key" autoComplete="new-password" data-lpignore="true" value={keys.service} onChange={(e) => setKeys({ ...keys, service: e.target.value })} placeholder={d.keys.service ? 'сохранён — вставьте новый, чтобы заменить' : 'если ключом сообщества посты не читаются'} />
          </Field>
          <p className="text-xs text-slate-500">id.vk.com → «Для бизнеса» → ваше приложение → <b>Сервисный ключ доступа</b>. Нужен, если ВК не даёт читать стену ключом сообщества.</p>
          <Field label={<>Ключ пользователя (вручную) {d.keys.user && <CheckCircle2 size={14} className="inline text-emerald-500" />}</>}>
            <PasswordInput className="input font-mono text-xs" name="vk-user-key" autoComplete="new-password" data-lpignore="true" value={keys.user} onChange={(e) => setKeys({ ...keys, user: e.target.value })} placeholder={d.keys.user ? 'сохранён — вставьте новый, чтобы заменить' : 'права: стена, фото, видео'} />
          </Field>
          <p className="text-xs text-slate-500">Не нужен, если вы вошли через VK ID.</p>
          <Button size="sm" variant="secondary" onClick={saveKeys} disabled={!keys.service && !keys.user}>Сохранить ключи</Button>
        </div>
      </div>

      {group && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-2 text-lg font-semibold">{group.name}</h2>
            <Button className="ml-auto" icon={loading ? Loader2 : Download} loading={loading && !posts} onClick={() => loadPosts(false)}>Загрузить посты из ВК</Button>
          </div>
          {!posts ? <p className="text-sm text-slate-500">Нажмите «Загрузить посты из ВК» — посты появятся блоками. Цена, размеры и цвета подставятся из текста, проверьте их и нажмите «Добавить в товары».</p> : (
              <div className="space-y-4">
                <p className="text-sm text-slate-500">Показано {posts.items.length} из {posts.total} постов</p>
                {posts.items.map((p) => <PostBlock key={p.key} groupId={group.id} post={p} onImported={imported} />)}
                {posts.offset + 20 < posts.total && <div className="text-center"><Button variant="secondary" loading={loading} onClick={() => loadPosts(true)}>Загрузить ещё</Button></div>}
              </div>
            )}
        </div>
      )}
    </div>
  );
}
