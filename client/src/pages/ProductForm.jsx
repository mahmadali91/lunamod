import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Wand2, ImagePlus, Star, Tags, Save, X, History } from 'lucide-react';
import { api, fileUrl } from '../api';
import { Badge, BarcodeSvg, Button, Field, Spinner, fmtDate, fmtNum, useLoad, useToast } from '../ui';
import { CameraButton } from '../components/CameraScanner';

const empty = { name: '', sku: '', description: '', unit: 'шт', price: '', oldPrice: '', costPrice: '', minStock: '', categoryId: null, barcodes: [], attributes: [] };
const attrPresets = ['Размер', 'Цвет', 'Материал', 'Вес', 'Бренд', 'Страна'];
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
  const fileRef = useRef(null);
  const { data: categories, reload: reloadCats } = useLoad('/categories');
  const { data: warehouses } = useLoad('/warehouses');

  const load = () => api('/products/' + id).then((p) => {
    setProduct(p);
    setForm({
      ...empty, ...p, sku: p.sku || '', description: p.description || '', oldPrice: p.oldPrice ?? '',
      barcodes: p.barcodes.map((b) => b.code), attributes: p.attributes.map((a) => ({ name: a.name, value: a.value })),
    });
  }).catch((e) => { toast(e.message, 'error'); navigate('/products'); });

  useEffect(() => {
    if (isNew) {
      setForm(empty); setProduct(null);
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
  const makeMainImage = async (imgId) => {
    const ids = [imgId, ...product.images.map((i) => i.id).filter((x) => x !== imgId)];
    await api(`/products/${id}/images/order`, { method: 'PUT', body: { ids } });
    load();
  };

  const save = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const body = { ...form, barcodes: form.barcodes.filter((b) => b.trim()) };
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
  const images = isNew ? pendingFiles.map((f, i) => ({ id: i, url: URL.createObjectURL(f) })) : product.images.map((i) => ({ id: i.id, url: fileUrl(i.path) }));
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
              <Field label="Описание" className="sm:col-span-2"><textarea className="input" rows={3} value={form.description} onChange={set('description')} /></Field>
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
                          <td className="py-2 text-slate-500">{m.note}</td>
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
                  <img src={img.url} alt="" className="h-full w-full object-cover" />
                  {i === 0 && <span className="absolute top-1 left-1 rounded bg-indigo-600 px-1.5 text-[10px] font-medium text-white">Главное</span>}
                  <div className="absolute inset-0 flex items-center justify-center gap-1 bg-slate-900/50 opacity-0 transition group-hover:opacity-100">
                    {!isNew && i > 0 && <button type="button" title="Сделать главным" onClick={() => makeMainImage(img.id)} className="rounded-lg bg-white/90 p-1.5 text-amber-500"><Star size={14} /></button>}
                    <button type="button" title="Удалить" onClick={() => (isNew ? setPendingFiles((s) => s.filter((_, j) => j !== i)) : deleteImage(img.id))} className="rounded-lg bg-white/90 p-1.5 text-rose-600"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => fileRef.current.click()} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-indigo-400 hover:text-indigo-600">
                <ImagePlus size={22} /> Добавить
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
          </Section>

          <Section title="Штрихкоды" action={
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
          </Section>

          <Section title="Остатки">
            <Field label="Минимальный остаток (уведомление)" className="mb-4"><input className="input" type="number" step="any" min="0" value={form.minStock} onChange={set('minStock')} /></Field>
            {isNew ? (
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
