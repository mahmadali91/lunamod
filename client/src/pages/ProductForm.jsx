import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Wand2, ImagePlus, Star, Tags, Save, X, History, Layers, Shirt, Search, PlayCircle, ExternalLink, Video, Copy, Link2, Unlink, Palette } from 'lucide-react';
import { api, fileUrl, getToken } from '../api';
import { Badge, BarcodeSvg, Button, Field, Spinner, fmtDate, fmtNum, useLoad, useToast } from '../ui';
import { CameraButton } from '../components/CameraScanner';
import VariantsEditor, { COLOR_PRESETS } from '../components/VariantsEditor';

const empty = { name: '', sku: '', description: '', unit: 'шт', price: '', oldPrice: '', costPrice: '', minStock: '', categoryId: null, showInShop: true, barcodes: [], attributes: [], variants: [], brand: '', color: '', modelInfo: '', sizeChartId: null, looks: [] };
const attrPresets = ['Материал', 'Состав', 'Сезон', 'Страна', 'Уход', 'Посадка'];
const moveTypes = { RECEIPT: ['Приход', 'green'], SALE: ['Продажа', 'indigo'], RETURN: ['Возврат', 'blue'], ADJUST: ['Корректировка', 'amber'], TRANSFER_IN: ['Перемещение +', 'slate'], TRANSFER_OUT: ['Перемещение −', 'slate'] };

function Section({ title, action, children }) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold text-slate-900">{title}</h2>{action}</div>
      {children}
    </div>
  );
}

export default function ProductForm() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(empty);
  const [product, setProduct] = useState(null);
  const [pendingFiles, setPendingFiles] = useState([]); // для нового товара
  const [initialStock, setInitialStock] = useState({});
  const [saving, setSaving] = useState(false);
  const [newCat, setNewCat] = useState(null);
  const [variantsOn, setVariantsOn] = useState(false);
  const [variantWh, setVariantWh] = useState('');
  const [progress, setProgress] = useState(null); // загрузка видео/фото, %
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const { data: categories, reload: reloadCats } = useLoad('/categories');
  const { data: warehouses } = useLoad('/warehouses');
  const { data: sizeCharts } = useLoad('/size-charts');

  const load = () => api('/products/' + id).then((p) => {
    setProduct(p);
    setForm({
      ...empty, ...p, sku: p.sku || '', description: p.description || '', oldPrice: p.oldPrice ?? '',
      barcodes: p.barcodes.map((b) => b.code), attributes: p.attributes.map((a) => ({ name: a.name, value: a.value })),
      brand: p.brand || '', color: p.color || '', modelInfo: p.modelInfo || '',
      packLength: p.packLength ?? '', packWidth: p.packWidth ?? '', packHeight: p.packHeight ?? '',
      variants: p.variants.map((v) => ({ id: v.id, size: v.size || '', sizeRu: v.sizeRu || '', barcode: v.barcodes[0]?.code || '', price: v.price, costPrice: v.costPrice, stock: v.stocks.reduce((a, x) => a + x.quantity, 0) })),
      looks: p.looks.map((l) => l.linked),
    });
    setVariantsOn(p.hasVariants);
  }).catch((e) => { toast(e.message, 'error'); navigate('/products'); });

  useEffect(() => {
    if (isNew) {
      setForm(empty); setProduct(null); setVariantsOn(false);
      api('/products/generate-barcode', { method: 'POST' }).then((r) => setForm((f) => ({ ...f, barcodes: [r.code] })));
    } else load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const setBarcode = (i, v) => setForm({ ...form, barcodes: form.barcodes.map((b, j) => (i === j ? v.replace(/\s/g, '') : b)) });
  const genBarcode = async (i) => {
    const { code } = await api('/products/generate-barcode', { method: 'POST' });
    if (i === undefined) setForm((f) => ({ ...f, barcodes: [...f.barcodes, code] }));
    else setBarcode(i, code);
  };
  const makePrimary = (i) => setForm({ ...form, barcodes: [form.barcodes[i], ...form.barcodes.filter((_, j) => j !== i)] });

  const setAttr = (i, k, v) => setForm({ ...form, attributes: form.attributes.map((a, j) => (i === j ? { ...a, [k]: v } : a)) });

  const addCategory = async () => {
    if (!newCat?.trim()) return setNewCat(null);
    try {
      const c = await api('/categories', { method: 'POST', body: { name: newCat } });
      await reloadCats(); setForm({ ...form, categoryId: c.id }); setNewCat(null);
    } catch (e) { toast(e.message, 'error'); }
  };

  // загрузка с прогрессом — видео могут быть десятки мегабайт
  const uploadImages = (productId, files) => new Promise((resolve, reject) => {
    const fd = new FormData();
    files.forEach((f) => fd.append('images', f));
    const x = new XMLHttpRequest();
    x.open('POST', `/api/products/${productId}/images`);
    x.setRequestHeader('Authorization', 'Bearer ' + getToken());
    x.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    x.onload = () => { setProgress(null); let d = {}; try { d = JSON.parse(x.responseText); } catch { /* не JSON */ }
      if (x.status < 300) resolve(d); else reject(new Error(d.error || (x.status === 413 ? 'Файл слишком большой для сервера' : 'Не удалось загрузить'))); };
    x.onerror = () => { setProgress(null); reject(new Error('Нет связи с сервером')); };
    setProgress(0); x.send(fd);
  });
  const onVideo = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) return toast('Видео больше 50 МБ — сожмите его (например, в приложении «Фото» или CapCut)', 'error');
    if (isNew) return setPendingFiles((s) => [...s, f]);
    try { await uploadImages(id, [f]); toast('Видео загружено'); load(); } catch (err) { toast(err.message, 'error'); }
  };

  const onFiles = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    if (isNew) return setPendingFiles((s) => [...s, ...files]);
    try { await uploadImages(id, files); toast('Фото загружены'); load(); } catch (err) { toast(err.message, 'error'); }
  };

  const deleteImage = async (imgId) => {
    await api(`/products/${id}/images/${imgId}`, { method: 'DELETE' });
    load();
  };
  const makeMainImage = async (imgId) => {
    const ids = [imgId, ...product.images.map((i) => i.id).filter((x) => x !== imgId)];
    await api(`/products/${id}/images/order`, { method: 'PUT', body: { ids } });
    load();
  };

  const save = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      if (variantsOn && !form.variants.some((v) => String(v.size || '').trim())) throw new Error('Добавьте хотя бы один размер — или выключите «Есть размеры»');
      if (!variantsOn && product?.hasVariants && !confirm('Убрать размеры? Размеры без движений удалятся, остальные уйдут в архив.')) { setSaving(false); return; }
      const body = { ...form, barcodes: form.barcodes.filter((b) => b.trim()), variants: variantsOn ? form.variants : [], variantWarehouseId: variantWh || warehouses?.find((w) => w.active)?.id, lookIds: form.looks.map((l) => l.id) };
      delete body.looks;
      if (isNew) {
        body.initialStock = Object.entries(initialStock).map(([warehouseId, quantity]) => ({ warehouseId, quantity }));
        const p = await api('/products', { method: 'POST', body });
        if (pendingFiles.length) await uploadImages(p.id, pendingFiles);
        toast('Товар создан');
        navigate('/products/' + p.id, { replace: true });
      } else {
        await api('/products/' + id, { method: 'PUT', body });
        toast('Сохранено');
        load();
      }
    } catch (err) { toast(err.message, 'error'); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!confirm('Удалить товар? Если по нему есть продажи или приходы — он будет перемещён в архив.')) return;
    const r = await api('/products/' + id, { method: 'DELETE' });
    toast(r.archived ? 'Товар перемещён в архив' : 'Товар удалён');
    navigate('/products');
  };

  if (!isNew && !product) return <Spinner />;
  const images = isNew ? pendingFiles.map((f, i) => ({ id: i, url: URL.createObjectURL(f), kind: f.type.startsWith('video/') ? 'video' : 'image' })) : product.images.map((i) => ({ id: i.id, url: fileUrl(i.path), kind: i.kind, color: i.color }));
  const margin = Number(form.price) > 0 && Number(form.costPrice) > 0 ? ((form.price - form.costPrice) / form.price) * 100 : null;

  return (
    <form onSubmit={save} className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/products" className="rounded-lg p-2 text-slate-500 hover:bg-white hover:shadow-sm"><ArrowLeft size={20} /></Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{isNew ? 'Новый товар' : form.name}</h1>
            {!isNew && <p className="text-sm text-slate-500">Остаток всего: <b>{fmtNum(product.totalStock)} {product.unit}</b>{!product.active && <> · <Badge color="amber">в архиве</Badge></>}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          {!isNew && product.showInShop && <a href={`/product/${product.id}`} target="_blank" rel="noreferrer"><Button type="button" variant="secondary" icon={ExternalLink}>На сайте</Button></a>}
          {!isNew && <Button type="button" variant="secondary" icon={Tags} onClick={() => navigate('/labels?ids=' + id)}>Ценник</Button>}
          {!isNew && <Button type="button" variant="ghost" icon={Trash2} onClick={remove} className="text-rose-600 hover:bg-rose-50">Удалить</Button>}
          <Button type="submit" icon={Save} loading={saving}>Сохранить</Button>
        </div>
      </div>

      {/* Раскладка как в кабинете WB: модель (цвета) · фото · поля карточки */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[250px_300px_minmax(0,1fr)]">
        <div className="space-y-6 xl:contents">
          <div className="space-y-6 xl:sticky xl:top-0 xl:self-start">
            {!isNew && <ModelPanel product={product} onChanged={load} />}
          </div>
          <div className="space-y-6 xl:sticky xl:top-0 xl:self-start">
            <Section title="Фотографии">
              <div className="grid grid-cols-3 gap-2">
                {images.map((img, i) => (
                  <div key={img.id} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200">
                    {img.kind === 'video' ? <video src={img.url} muted className="h-full w-full object-cover" /> : <img src={img.url} alt="" className="h-full w-full object-cover" />}
                    {img.kind === 'video' && <PlayCircle size={22} className="pointer-events-none absolute right-1 bottom-1 text-white drop-shadow" />}
                    {i === 0 && <span className="absolute top-1 left-1 rounded bg-indigo-600 px-1.5 text-[10px] font-medium text-white">Главное</span>}
                    <div className="absolute inset-0 flex items-center justify-center gap-1 bg-slate-900/50 opacity-0 transition group-hover:opacity-100">
                      {!isNew && i > 0 && <button type="button" title="Сделать главным" onClick={() => makeMainImage(img.id)} className="rounded-lg bg-white/90 p-1.5 text-amber-500"><Star size={14} /></button>}
                      <button type="button" title="Удалить" onClick={() => (isNew ? setPendingFiles((s) => s.filter((_, j) => j !== i)) : deleteImage(img.id))} className="rounded-lg bg-white/90 p-1.5 text-rose-600"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => fileRef.current.click()} disabled={progress !== null} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-indigo-400 hover:text-indigo-600">
                  <ImagePlus size={22} /> Фото
                </button>
                <button type="button" onClick={() => videoRef.current.click()} disabled={progress !== null} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-indigo-400 hover:text-indigo-600">
                  <Video size={22} /> Видео
                </button>
              </div>
              {progress !== null && (
                <div className="mt-3"><div className="mb-1 flex justify-between text-xs text-slate-500"><span>Загрузка…</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: progress + '%' }} /></div></div>
              )}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/avif" multiple hidden onChange={onFiles} />
              <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={onVideo} />
              <p className="mt-2 text-xs text-slate-400">Фото — до 10 МБ, видео — MP4/MOV до 50 МБ (лучше вертикальное, 10–30 секунд). Первое фото — главное, видео показывается в галерее магазина.</p>
            </Section>
          </div>
        </div>
        <div className="min-w-0 space-y-6">
          {!isNew && product.wbNmId && <WbInfo product={product} />}
          <Section title="Основное">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Название *" className="sm:col-span-2"><input className="input" required value={form.name} onChange={set('name')} autoFocus={isNew} /></Field>
              <Field label="Артикул"><input className="input font-mono" value={form.sku} onChange={set('sku')} placeholder="напр. TSH-001" /></Field>
              <Field label="Категория">
                {newCat === null ? (
                  <div className="flex gap-2">
                    <select className="input" value={form.categoryId ?? ''} onChange={(e) => setForm({ ...form, categoryId: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">— без категории —</option>
                      {(categories || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <Button type="button" variant="secondary" icon={Plus} onClick={() => setNewCat('')} title="Новая категория" />
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input className="input" autoFocus placeholder="Новая категория" value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }} />
                    <Button type="button" onClick={addCategory}>OK</Button>
                  </div>
                )}
              </Field>
              <Field label="Бренд"><input className="input" value={form.brand} onChange={set('brand')} placeholder="необязательно" /></Field>
              <Field label="Цвет карточки">
                <input className="input" value={form.color} onChange={set('color')} placeholder="например, тёмно-синий" list="color-presets" />
                <datalist id="color-presets">{COLOR_PRESETS.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <Field label="Таблица размеров">
                <select className="input" value={form.sizeChartId ?? ''} onChange={(e) => setForm({ ...form, sizeChartId: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">{categories?.find((c) => c.id === form.categoryId)?.sizeChartId ? 'как у категории' : '— нет —'}</option>
                  {(sizeCharts || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Описание" className="sm:col-span-2"><textarea className="input" rows={3} value={form.description} onChange={set('description')} /></Field>
              <Field label="Параметры модели на фото" className="sm:col-span-2"><input className="input" value={form.modelInfo} onChange={set('modelInfo')} placeholder="Например: рост 172 см, на модели размер S" /></Field>
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={form.showInShop !== false} onChange={(e) => setForm({ ...form, showInShop: e.target.checked })} /> Показывать в интернет-магазине</label>
            </div>
          </Section>

          <Section title="Цены">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Цена продажи"><input className="input" type="number" step="any" min="0" value={form.price} onChange={set('price')} /></Field>
              <Field label="Старая цена"><input className="input" type="number" step="any" min="0" value={form.oldPrice} onChange={set('oldPrice')} placeholder="для акции" /></Field>
              <Field label="Закупочная"><input className="input" type="number" step="any" min="0" value={form.costPrice} onChange={set('costPrice')} /></Field>
              <Field label="Ед. изм.">
                <select className="input" value={form.unit} onChange={set('unit')}>{['шт', 'кг', 'г', 'л', 'м', 'уп', 'пара', 'компл'].map((u) => <option key={u}>{u}</option>)}</select>
              </Field>
            </div>
            {margin !== null && <p className="mt-3 text-sm text-slate-500">Наценка: <b className="text-emerald-600">{fmtNum(form.price - form.costPrice, 2)}</b> · маржа {fmtNum(margin, 1)}%</p>}
          </Section>

          <Section title={<span className="flex items-center gap-2"><Layers size={18} /> Баркод, размер и цена</span>} action={
            <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={variantsOn} onChange={(e) => setVariantsOn(e.target.checked)} /> Есть размеры</label>
          }>
            {variantsOn ? (
              <>
                <p className="mb-4 text-sm text-slate-500">Как на Wildberries: у каждого размера свой штрихкод, остаток и этикетка. Другой цвет — отдельная карточка этой модели (кнопка «Дублировать» в блоке «Модель»).</p>
                <VariantsEditor value={form.variants} onChange={(v) => setForm({ ...form, variants: v })} price={form.price} costPrice={form.costPrice} isNew={isNew} unit={form.unit} />
                {form.variants.some((v) => !v.id && Number(v.quantity) > 0) && (warehouses || []).filter((w) => w.active).length > 1 && (
                  <Field label="Начальный остаток новых вариантов — на склад" className="mt-3 max-w-xs">
                    <select className="input" value={variantWh} onChange={(e) => setVariantWh(e.target.value)}>{warehouses.filter((w) => w.active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
                  </Field>
                )}
              </>
            ) : <p className="text-sm text-slate-500">Включите, если товар продаётся в разных размерах: S/M/L, 42–48, oversize. Без размеров у товара один штрихкод (справа).</p>}
            {product?.salesBySize?.length > 0 && <SizeSales rows={product.salesBySize} />}
          </Section>

          <Section title="Характеристики" action={<Button type="button" size="sm" variant="secondary" icon={Plus} onClick={() => setForm({ ...form, attributes: [...form.attributes, { name: '', value: '' }] })}>Добавить</Button>}>
            {form.attributes.length === 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                Быстро добавить:
                {attrPresets.map((a) => <button type="button" key={a} onClick={() => setForm({ ...form, attributes: [...form.attributes, { name: a, value: '' }] })} className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs hover:border-indigo-400 hover:text-indigo-600">+ {a}</button>)}
              </div>
            )}
            <div className="space-y-2">
              {form.attributes.map((a, i) => (
                <div key={i} className="flex gap-2">
                  <input className="input w-2/5" placeholder="Название (напр. Цвет)" value={a.name} onChange={(e) => setAttr(i, 'name', e.target.value)} list="attr-presets" />
                  <input className="input flex-1" placeholder="Значение" value={a.value} onChange={(e) => setAttr(i, 'value', e.target.value)} />
                  <Button type="button" variant="ghost" icon={X} onClick={() => setForm({ ...form, attributes: form.attributes.filter((_, j) => j !== i) })} />
                </div>
              ))}
            </div>
            <datalist id="attr-presets">{attrPresets.map((a) => <option key={a} value={a} />)}</datalist>
          </Section>

          {!isNew && <BatchesSection product={product} />}

          <Section title={<span className="flex items-center gap-2"><Shirt size={18} /> Собрать образ</span>}>
            <p className="mb-3 text-sm text-slate-500">Товары, которые в магазине показываются вместе с этим: «С этим носят».</p>
            <LookPicker value={form.looks} onChange={(looks) => setForm({ ...form, looks })} selfId={product?.id} />
          </Section>

          {!isNew && (
            <Section title={<span className="flex items-center gap-2"><History size={18} /> История движения</span>}>
              {product.movements.length === 0 ? <p className="text-sm text-slate-500">Движений пока нет</p> : (
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {product.movements.map((m) => (
                        <tr key={m.id}>
                          <td className="py-2 text-slate-500">{fmtDate(m.createdAt)}</td>
                          <td className="py-2"><Badge color={moveTypes[m.type]?.[1]}>{moveTypes[m.type]?.[0] || m.type}</Badge></td>
                          <td className="py-2 text-slate-600">{m.warehouse.name}</td>
                          <td className="py-2 text-slate-500">{product.hasVariants && <span className="mr-1 text-slate-700">{m.product.name.split(' · ').slice(1).join(' · ')}</span>}{m.note}</td>
                          <td className={`py-2 text-right font-semibold ${m.quantity > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{m.quantity > 0 ? '+' : ''}{fmtNum(m.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          )}
          {!variantsOn && <Section title="Штрихкоды" action={
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="secondary" icon={Wand2} onClick={() => genBarcode()} title="Сгенерировать EAN-13" />
              <Button type="button" size="sm" variant="secondary" icon={Plus} onClick={() => setForm({ ...form, barcodes: [...form.barcodes, ''] })}>Свой</Button>
            </div>
          }>
            <div className="space-y-4">
              {form.barcodes.map((b, i) => (
                <div key={i} className={`rounded-xl border p-3 ${i === 0 ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200'}`}>
                  <div className="mb-2 flex items-center justify-between text-xs">
                    {i === 0 ? <span className="font-semibold text-indigo-700">Основной (на этикетке)</span> : <button type="button" onClick={() => makePrimary(i)} className="text-slate-500 hover:text-indigo-600">Сделать основным</button>}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => genBarcode(i)} className="text-slate-400 hover:text-indigo-600" title="Сгенерировать"><Wand2 size={14} /></button>
                      <button type="button" onClick={() => setForm({ ...form, barcodes: form.barcodes.filter((_, j) => j !== i) })} className="text-slate-400 hover:text-rose-600" title="Удалить"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="relative">
                    <input className="input pr-11 font-mono" value={b} onChange={(e) => setBarcode(i, e.target.value)} placeholder="Введите или отсканируйте" />
                    <CameraButton onResult={(code) => setBarcode(i, code)} className="absolute top-1/2 right-2 -translate-y-1/2" />
                  </div>
                  {b && <div className="mt-2 flex justify-center rounded-lg bg-white p-2"><BarcodeSvg value={b} height={44} width={1.6} /></div>}
                </div>
              ))}
              {form.barcodes.length === 0 && <p className="text-sm text-slate-500">При сохранении будет сгенерирован EAN-13 автоматически.</p>}
            </div>
          </Section>}
          <Section title="Остатки">
            <Field label="Минимальный остаток (уведомление)" className="mb-4"><input className="input" type="number" step="any" min="0" value={form.minStock} onChange={set('minStock')} /></Field>
            <div className="mb-4">
              <div className="label">Габариты упаковки, см (длина × ширина × высота)</div>
              <div className="flex gap-2">{['packLength', 'packWidth', 'packHeight'].map((k) => <input key={k} className="input" type="number" step="any" min="0" value={form[k] ?? ''} onChange={set(k)} placeholder={{ packLength: 'Д', packWidth: 'Ш', packHeight: 'В' }[k]} />)}</div>
            </div>
            <Field label="Вес, г (для расчёта доставки)" className="mb-4"><input className="input" type="number" step="any" min="0" value={form.weight ?? ''} onChange={set('weight')} placeholder="по умолчанию из настроек магазина" /></Field>
            {variantsOn ? <p className="text-sm text-slate-500">Остатки ведутся по каждому размеру — см. «Баркод, размер и цена». Всего: <b>{fmtNum(form.variants.reduce((a, v) => a + (v.stock || Number(v.quantity) || 0), 0))} {form.unit}</b></p> : isNew ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">Начальный остаток по складам:</p>
                {(warehouses || []).filter((w) => w.active).map((w) => (
                  <div key={w.id} className="flex items-center gap-2">
                    <span className="flex-1 truncate text-sm">{w.name}</span>
                    <input className="input w-28" type="number" step="any" placeholder="0" value={initialStock[w.id] || ''} onChange={(e) => setInitialStock({ ...initialStock, [w.id]: e.target.value })} />
                  </div>
                ))}
                {warehouses?.length === 0 && <p className="text-sm text-amber-600">Сначала <Link to="/warehouses" className="underline">создайте склад</Link></p>}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {product.stocks.length === 0 && <p className="text-sm text-slate-500">Нет на складах. Оформите <Link className="text-indigo-600 underline" to="/receipts/new">приход</Link>.</p>}
                {product.stocks.map((s) => (
                  <div key={s.id} className="flex justify-between py-2 text-sm"><span>{s.warehouse.name}</span><b className={s.quantity <= 0 ? 'text-rose-600' : ''}>{fmtNum(s.quantity)} {product.unit}</b></div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>
    </form>
  );
}

function BatchesSection({ product }) {
  const money = (v) => fmtNum(v, 2) + ' ₽';
  const left = product.batches.filter((b) => b.remaining > 0);
  return (
    <Section title={<span className="flex items-center gap-2"><Layers size={18} /> Партии и себестоимость</span>}>
      <p className="mb-3 text-sm text-slate-500">Каждый приход — отдельная партия со своей закупочной ценой и поставщиком. Продажа списывает сначала старые партии (FIFO), себестоимость продажи считается по ним.
        {product.avgCost !== null && <> Средняя себестоимость остатка: <b className="text-slate-900">{money(product.avgCost)}</b>.</>}</p>
      {product.batches.length === 0 ? <p className="text-sm text-slate-500">Партий пока нет — оформите приход.</p> : (
        <div className="-mx-5 max-h-96 overflow-auto px-5">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="py-2 font-medium">Дата</th>{product.hasVariants && <th className="font-medium">Вариант</th>}<th className="font-medium">Поставщик</th><th className="font-medium">Склад</th><th className="text-right font-medium">Пришло</th><th className="text-right font-medium">Осталось</th><th className="text-right font-medium">Закупка</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {product.batches.map((b) => (
                <tr key={b.id} className={b.remaining > 0 ? '' : 'text-slate-400'}>
                  <td className="py-2">{fmtDate(b.date).split(',')[0]}</td>
                  {product.hasVariants && <td>{b.variant || '—'}</td>}
                  <td>{b.supplier || <span className="text-slate-400">{b.note || '—'}</span>}</td>
                  <td>{b.warehouse}</td>
                  <td className="text-right">{fmtNum(b.quantity)}</td>
                  <td className="text-right font-semibold">{fmtNum(b.remaining)}</td>
                  <td className="text-right">{money(b.costPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {left.length > 1 && new Set(left.map((b) => b.costPrice)).size > 1 && <p className="mt-2 text-xs text-amber-700">На складе партии по разной цене: от {money(Math.min(...left.map((b) => b.costPrice)))} до {money(Math.max(...left.map((b) => b.costPrice)))}.</p>}
    </Section>
  );
}

function LookPicker({ value, onChange, selfId }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  useEffect(() => {
    if (!q.trim()) { setList([]); return; }
    const t = setTimeout(() => api('/products?limit=8&q=' + encodeURIComponent(q.trim())).then((d) => setList(d.items.filter((p) => p.id !== selfId && !value.some((v) => v.id === p.id)))).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q, value, selfId]);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {value.map((p) => (
          <div key={p.id} className="flex items-center gap-2 rounded-xl border border-slate-200 py-1 pr-1 pl-1">
            <div className="h-9 w-9 overflow-hidden rounded-lg bg-slate-100">{p.images?.[0] && <img src={fileUrl(p.images[0].path)} alt="" className="h-full w-full object-cover" />}</div>
            <span className="max-w-40 truncate text-sm">{p.name}</span>
            <button type="button" onClick={() => onChange(value.filter((x) => x.id !== p.id))} className="rounded p-1 text-slate-400 hover:text-rose-600"><X size={14} /></button>
          </div>
        ))}
      </div>
      <div className="relative max-w-sm">
        <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти товар для образа" />
        {list.length > 0 && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            {list.map((p) => <button type="button" key={p.id} onClick={() => { onChange([...value, p]); setQ(''); }} className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-slate-50">{p.name} <span className="text-slate-400">{p.sku}</span></button>)}
          </div>
        )}
      </div>
    </div>
  );
}

// Продажи по размерам за 90 дней — какие размеры заказывать
function SizeSales({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.sold));
  const total = rows.reduce((a, r) => a + r.sold, 0);
  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <div className="mb-2 text-sm font-medium">Продажи по размерам за 90 дней <span className="font-normal text-slate-400">· всего {fmtNum(total)}</span></div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 text-sm">
            <span className="w-16 shrink-0 font-medium">{r.size}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: (r.sold / max) * 100 + '%' }} /></div>
            <span className="w-24 shrink-0 text-right text-slate-600">{fmtNum(r.sold)} шт{total ? ` · ${Math.round((r.sold / total) * 100)}%` : ''}</span>
            <span className={`w-20 shrink-0 text-right text-xs ${r.stock <= 0 ? 'text-rose-600' : 'text-slate-400'}`}>ост. {fmtNum(r.stock)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// «Модель» как на WB: карточки разных цветов одного товара (у каждой свой артикул и фото), до 30
function ModelPanel({ product, onChanged }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState(null); // dup | join
  const [color, setColor] = useState('');
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const cards = product.group?.length ? product.group : [{ id: product.id, name: product.name, sku: product.sku, color: product.color, image: product.images[0]?.path, stock: product.totalStock }];
  useEffect(() => {
    if (mode !== 'join' || !q.trim()) { setFound([]); return; }
    const t = setTimeout(() => api('/products?limit=8&q=' + encodeURIComponent(q.trim())).then((d) => setFound(d.items.filter((p) => !cards.some((c) => c.id === p.id)))).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const duplicate = async () => {
    try { const c = await api(`/products/${product.id}/duplicate`, { method: 'POST', body: { color } }); toast('Карточка создана — добавьте фото этого цвета'); setMode(null); setColor(''); navigate('/products/' + c.id); }
    catch (e) { toast(e.message, 'error'); }
  };
  const join = async (other) => { try { await api(`/products/${product.id}/group`, { method: 'POST', body: { productId: other.id } }); toast('Карточки объединены'); setMode(null); setQ(''); onChanged(); } catch (e) { toast(e.message, 'error'); } };
  const leave = async () => { if (!confirm('Отвязать эту карточку от модели? Она станет отдельным товаром.')) return; await api(`/products/${product.id}/group`, { method: 'DELETE' }); toast('Карточка отвязана'); onChanged(); };
  return (
    <Section title={<span className="flex items-center gap-2"><Palette size={18} /> Варианты</span>} action={<span className="text-sm text-slate-400">{cards.length} из 30</span>}>
      <div className="space-y-2">
        {cards.map((c) => (
          <button type="button" key={c.id} onClick={() => c.id !== product.id && navigate('/products/' + c.id)}
            className={`flex w-full items-center gap-3 rounded-xl p-2 text-left ${c.id === product.id ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-50'}`}>
            <div className="h-14 w-11 shrink-0 overflow-hidden rounded-lg bg-slate-100">{c.image && <img src={fileUrl(c.image)} alt="" className="h-full w-full object-cover" />}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{c.name}</div>
              <div className="truncate font-mono text-xs text-slate-500">{c.sku || 'без артикула'}</div>
              <div className="text-xs text-slate-600">{c.color || <span className="text-amber-600">цвет не указан</span>} · ост. {fmtNum(c.stock)}</div>
            </div>
          </button>
        ))}
      </div>
      {mode === 'dup' ? (
        <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3">
          <div className="text-sm">Новая карточка этой модели: те же название, описание, цена и размеры, новые штрихкоды и артикул. Фото добавите для нового цвета.</div>
          <input className="input" autoFocus value={color} onChange={(e) => setColor(e.target.value)} placeholder="Цвет новой карточки" list="color-presets" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), duplicate())} />
          <div className="flex gap-2"><Button type="button" size="sm" onClick={duplicate} disabled={!color.trim()}>Создать</Button><Button type="button" size="sm" variant="ghost" onClick={() => setMode(null)}>Отмена</Button></div>
        </div>
      ) : mode === 'join' ? (
        <div className="relative mt-3 space-y-2 rounded-xl bg-slate-50 p-3">
          <div className="text-sm">Найдите карточку другого цвета этой же модели — она объединится с этой (на сайте будет выбор цвета).</div>
          <input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название или артикул" />
          {found.map((p) => <button type="button" key={p.id} onClick={() => join(p)} className="block w-full truncate rounded-lg bg-white px-3 py-2 text-left text-sm hover:bg-indigo-50">{p.name} <span className="text-slate-400">{p.sku}</span>{p.color && <span className="text-slate-500"> · {p.color}</span>}</button>)}
          <Button type="button" size="sm" variant="ghost" onClick={() => setMode(null)}>Отмена</Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" icon={Copy} onClick={() => setMode('dup')}>Дублировать (другой цвет)</Button>
          <Button type="button" size="sm" variant="secondary" icon={Link2} onClick={() => setMode('join')}>Из своей карточки</Button>
          {cards.length > 1 && <Button type="button" size="sm" variant="ghost" icon={Unlink} onClick={leave}>Отвязать</Button>}
        </div>
      )}
    </Section>
  );
}

// Связь с Wildberries: артикул WB, модель, габариты упаковки
function WbInfo({ product: p }) {
  return (
    <div className="card flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
      <span className="rounded-md bg-fuchsia-600 px-2 py-0.5 text-xs font-bold text-white">WB</span>
      <span>Артикул WB: <a href={`https://www.wildberries.ru/catalog/${p.wbNmId}/detail.aspx`} target="_blank" rel="noreferrer" className="font-mono font-semibold text-indigo-600 hover:underline">{p.wbNmId}</a></span>
      {p.wbImtId && <span className="text-slate-500">Модель WB: <span className="font-mono">{p.wbImtId}</span></span>}
      {(p.packLength || p.packWidth || p.packHeight) && <span className="text-slate-500">Упаковка: {p.packLength}×{p.packWidth}×{p.packHeight} см</span>}
    </div>
  );
}
