import { useState } from 'react';
import { Star, Camera, X, BadgeCheck, Loader2 } from 'lucide-react';
import { shopToken } from './api';
import { useShop } from './store';

export function Stars({ value, size = 16 }) {
  return (
    <span className="inline-flex text-amber-500" aria-label={`Оценка ${value} из 5`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} fill={value >= i - 0.25 ? 'currentColor' : 'none'} className={value >= i - 0.25 ? '' : 'text-slate-300'} />)}
    </span>
  );
}
const FIT = { small: 'Маломерит', ok: 'Соответствует размеру', large: 'Большемерит' };

function Form({ product, onDone }) {
  const { notify } = useShop();
  const [rating, setRating] = useState(0);
  const [fit, setFit] = useState('');
  const [size, setSize] = useState('');
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const send = async (e) => {
    e.preventDefault();
    if (!rating) return notify('Поставьте оценку', 'error');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('rating', rating); if (fit) fd.append('fit', fit); if (size) fd.append('size', size); if (text.trim()) fd.append('text', text.trim());
      files.forEach((f) => fd.append('photos', f));
      const res = await fetch(`/api/shop/products/${product.id}/reviews`, { method: 'POST', headers: { Authorization: 'Bearer ' + shopToken.get() }, body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Не отправлено');
      notify('Спасибо! Отзыв появится после проверки'); onDone();
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={send} className="space-y-4 rounded-3xl border border-slate-200 p-5">
      <div>
        <div className="mb-1 text-sm font-medium">Ваша оценка</div>
        <div className="flex gap-1" role="radiogroup" aria-label="Оценка">
          {[1, 2, 3, 4, 5].map((i) => <button key={i} type="button" role="radio" aria-checked={rating === i} aria-label={`${i} из 5`} onClick={() => setRating(i)} className="p-0.5 text-amber-500"><Star size={30} fill={rating >= i ? 'currentColor' : 'none'} className={rating >= i ? '' : 'text-slate-300'} /></button>)}
        </div>
      </div>
      {product.sizes.length > 0 && (
        <div className="flex flex-wrap gap-4">
          <label className="text-sm">Какой размер брали
            <select value={size} onChange={(e) => setSize(e.target.value)} className="mt-1 block rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none"><option value="">—</option>{product.sizes.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
          <div className="text-sm">Как сидит
            <div className="mt-1 flex flex-wrap gap-1.5">{Object.entries(FIT).map(([k, l]) => <button key={k} type="button" onClick={() => setFit(fit === k ? '' : k)} aria-pressed={fit === k} className={`rounded-full border px-3 py-1.5 ${fit === k ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300'}`}>{l}</button>)}</div>
          </div>
        </div>
      )}
      <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={3000} rows={4} placeholder="Расскажите о товаре: качество, посадка, цвет…" className="w-full rounded-2xl border border-slate-300 bg-white p-3 text-sm outline-none focus:border-slate-900" />
      <div className="flex flex-wrap items-center gap-2">
        {files.map((f, i) => <div key={i} className="relative h-16 w-16 overflow-hidden rounded-xl"><img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" /><button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white" aria-label="Убрать фото"><X size={12} /></button></div>)}
        {files.length < 5 && <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-[10px] text-slate-500"><Camera size={18} />Фото<input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple hidden onChange={(e) => { setFiles([...files, ...e.target.files].slice(0, 5)); e.target.value = ''; }} /></label>}
      </div>
      <button disabled={busy} className="flex items-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" />}Отправить отзыв</button>
    </form>
  );
}

export default function Reviews({ product }) {
  const { auth } = useShop();
  const [form, setForm] = useState(false);
  const [sent, setSent] = useState(false);
  const [zoom, setZoom] = useState(null);
  const r = product.reviews;
  return (
    <section id="reviews" className="scroll-mt-24 pt-16">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Отзывы {r.count > 0 && <span className="text-slate-400">{r.count}</span>}</h2>
          {r.count > 0 && <div className="mt-1 flex items-center gap-2"><Stars value={r.avg} size={20} /><b className="text-lg">{r.avg}</b><span className="text-sm text-slate-500">из 5</span></div>}
        </div>
        {!sent && !form && <button onClick={() => auth.require(() => setForm(true))} className="rounded-full border border-slate-900 px-5 py-2.5 text-sm font-semibold hover:bg-slate-900 hover:text-white">Написать отзыв</button>}
      </div>
      {form && !sent && <div className="mb-8"><Form product={product} onDone={() => { setSent(true); setForm(false); }} /></div>}
      {sent && <p className="mb-6 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">Спасибо за отзыв! Он появится после проверки.</p>}
      {r.count === 0 ? <p className="text-slate-500">Отзывов пока нет — будьте первым.</p> : (
        <div className="grid gap-4 md:grid-cols-2">
          {r.items.map((x) => (
            <article key={x.id} className="rounded-3xl bg-slate-50 p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">{x.name}{x.purchased && <span className="ml-2 inline-flex items-center gap-0.5 text-xs font-normal text-emerald-700"><BadgeCheck size={14} /> Покупатель</span>}</div>
                <time className="text-xs text-slate-400" dateTime={x.createdAt}>{new Date(x.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-500"><Stars value={x.rating} size={14} />{x.size && <span>Размер {x.size}</span>}{x.fit && <span>{FIT[x.fit]}</span>}</div>
              {x.text && <p className="mt-2 text-sm whitespace-pre-line text-slate-700">{x.text}</p>}
              {x.photos.length > 0 && <div className="mt-3 flex gap-2">{x.photos.map((ph) => <button key={ph} onClick={() => setZoom(ph)} className="h-16 w-16 overflow-hidden rounded-xl"><img src={ph} alt="Фото покупателя" loading="lazy" className="h-full w-full object-cover" /></button>)}</div>}
              {x.reply && <div className="mt-3 rounded-2xl bg-white p-3 text-sm"><b>Ответ магазина:</b> {x.reply}</div>}
            </article>
          ))}
        </div>
      )}
      {zoom && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4" onClick={() => setZoom(null)}><img src={zoom} alt="" className="max-h-full max-w-full rounded-xl" /></div>}
    </section>
  );
}
