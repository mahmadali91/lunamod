import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Wand2, ImagePlus, Star, Tags, Save, X, History, Layers, Shirt, Search, PlayCircle } from 'lucide-react';
import { api, fileUrl } from '../api';
import { Badge, BarcodeSvg, Button, Field, Spinner, fmtDate, fmtNum, useLoad, useToast } from '../ui';
import { CameraButton } from '../components/CameraScanner';
import VariantsEditor from '../components/VariantsEditor';

const empty = { name: '', sku: '', description: '', unit: 'шт', price: '', oldPrice: '', costPrice: '', minStock: '', categoryId: null, showInShop: true, barcodes: [], attributes: [], variants: [], brand: '', modelInfo: '', sizeChartId: null, looks: [] };
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
  const fileRef = useRef(null);
  const { data: categories, reload: reloadCats } = useLoad('/categories');
  const { data: warehouses } = useLoad('/warehouses');
  const { data: sizeCharts } = useLoad('/size-charts');

  const load = () => api('/products/' + id).then((p) => {
    setProduct(p);
    setForm({
      ...empty, ...p, sku: p.sku || '', description: p.description || '', oldPrice: p.oldPrice ?? '',
      barcodes: p.barcodes.map((b) => b.code), attributes: p.attributes.map((a) => ({ name: a.name, value: a.value })),
      brand: p.brand || '', modelInfo: p.modelInfo || '',
      variants: p.variants.map((v) => ({ id: v.id, color: v.color || '', size: v.size || '', barcode: v.barcodes[0]?.code || '', price: v.price, costPrice: v.costPrice, stock: v.stocks.reduce((a, x) => a + x.quantity, 0) })),
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

  const uploadImages = async (productId, files) => {
    const fd = new FormData();
    files.forEach((f) => fd.append('images', f));
    return api(`/products/${productId}/images`, { method: 'POST', form: fd });
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
  const tagImage = async (imgId, color) => {
    await api(`/products/${id}/images/${imgId}`, { method: 'PUT', body: { color } });
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
      if (variantsOn && !form.variants.some((v) => v.color || v.size)) throw new Error('Добавьте хотя бы один размер или цвет — или выключите «Размеры и цвета»');
      if (!variantsOn && product?.hasVariants && !confirm('Убрать размеры и цвета? Варианты без движений удалятся, остальные уйдут в архив.')) { setSaving(false); return; }
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
          {!isNew && <Button type="button" variant="secondary" icon={Tags} onClick={() => navigate('/labels?ids=' + id)}>Ценник</Button>}
          {!isNew && <Button type="button" variant="ghost" icon={Trash2} onClick={remove} className="text-rose-600 hover:bg-rose-50">Удалить</Button>}
          <Button type="submit" icon={Save} loading={saving}>Сохранить</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
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

          <Section title={<span className="flex items-center gap-2"><Layers size={18} /> Размеры и цвета</span>} action={
            <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={variantsOn} onChange={(e) => setVariantsOn(e.target.checked)} /> Есть размеры / цвета</label>
          }>
            {variantsOn ? (
              <>
                <p className="mb-4 text-sm text-slate-500">Как на Wildberries: один артикул — несколько вариантов. У каждого размера/цвета свой штрихкод, остаток и этикетка. Продаётся и приходуется конкретный вариант.</p>
                <VariantsEditor value={form.variants} onChange={(v) => setForm({ ...form, variants: v })} price={form.price} costPrice={form.costPrice} isNew={isNew} unit={form.unit} />
                {form.variants.some((v) => !v.id && Number(v.quantity) > 0) && (warehouses || []).filter((w) => w.active).length > 1 && (
                  <Field label="Начальный остаток новых вариантов — на склад" className="mt-3 max-w-xs">
                    <select className="input" value={variantWh} onChange={(e) => setVariantWh(e.target.value)}>{warehouses.filter((w) => w.active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
                  </Field>
                )}
              </>
            ) : <p className="text-sm text-slate-500">Включите, если товар продаётся в разных размерах или цветах — например, футболка S/M/L в чёрном и белом.</p>}
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
        </div>

        <div className="space-y-6">
          <Section title="Фотографии">
            <div className="grid grid-cols-3 gap-2">
              {images.map((img, i) => (
                <div key={img.id} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200">
                  {img.kind === 'video' ? <video src={img.url} muted className="h-full w-full object-cover" /> : <img src={img.url} alt="" className="h-full w-full object-cover" />}
                  {img.kind === 'video' && <PlayCircle size={22} className="pointer-events-none absolute right-1 bottom-1 text-white drop-shadow" />}
                  {!isNew && variantsOn && (
                    <select value={img.color || ''} onChange={(e) => tagImage(img.id, e.target.value)} title="Фото какого цвета" className="absolute inset-x-1 bottom-1 z-10 rounded bg-white/90 px-1 py-0.5 text-[10px]">
                      <option value="">все цвета</option>
                      {[...new Set(form.variants.map((v) => v.color).filter(Boolean))].map((c) => <option key={c}>{c}</option>)}
                    </select>
                  )}
                  {i === 0 && <span className="absolute top-1 left-1 rounded bg-indigo-600 px-1.5 text-[10px] font-medium text-white">Главное</span>}
                  <div className="absolute inset-0 flex items-center justify-center gap-1 bg-slate-900/50 opacity-0 transition group-hover:opacity-100">
                    {!isNew && i > 0 && <button type="button" title="Сделать главным" onClick={() => makeMainImage(img.id)} className="rounded-lg bg-white/90 p-1.5 text-amber-500"><Star size={14} /></button>}
                    <button type="button" title="Удалить" onClick={() => (isNew ? setPendingFiles((s) => s.filter((_, j) => j !== i)) : deleteImage(img.id))} className="rounded-lg bg-white/90 p-1.5 text-rose-600"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => fileRef.current.click()} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-indigo-400 hover:text-indigo-600">
                <ImagePlus size={22} /> Фото / видео
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple hidden onChange={onFiles} />
            <p className="mt-2 text-xs text-slate-400">Фото и короткие видео (MP4, до 50 МБ). Первое — главное.{variantsOn ? ' Для карточки с цветами отметьте на фото его цвет — в магазине при выборе цвета покажутся его фото.' : ''}</p>
          </Section>

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
            <Field label="Вес, г (для расчёта доставки)" className="mb-4"><input className="input" type="number" step="any" min="0" value={form.weight ?? ''} onChange={set('weight')} placeholder="по умолчанию из настроек магазина" /></Field>
            {variantsOn ? <p className="text-sm text-slate-500">Остатки ведутся по каждому размеру и цвету — см. таблицу вариантов. Всего: <b>{fmtNum(form.variants.reduce((a, v) => a + (v.stock || Number(v.quantity) || 0), 0))} {form.unit}</b></p> : isNew ? (
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
