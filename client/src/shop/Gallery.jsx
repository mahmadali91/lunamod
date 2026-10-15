import { useEffect, useRef, useState } from 'react';
import VideoPlayer from '../components/VideoPlayer';
import { ChevronLeft, ChevronRight, X, ImageOff, Play } from 'lucide-react';

/**
 * Галерея товара: свайп на телефоне, стрелки и миниатюры на компьютере, видео.
 * Нажатие — полноэкранный просмотр: двойное нажатие/колесо — увеличение, два пальца — масштаб, перетаскивание — сдвиг.
 */
export default function Gallery({ media, alt }) {
  const [i, setI] = useState(0);
  const [full, setFull] = useState(false);
  const n = media.length;
  useEffect(() => { setI(0); }, [media]);
  const go = (d) => setI((x) => (x + d + n) % n);
  const touch = useRef(null);
  const strip = useRef(null);
  // активная миниатюра всегда видна в колонке
  useEffect(() => { strip.current?.querySelector(`[data-k="${i}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [i]);
  const onTouchStart = (e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x, dy = e.changedTouches[0].clientY - touch.current.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    touch.current = null;
  };
  if (!n) return <div className="flex aspect-[3/4] items-center justify-center rounded-3xl bg-slate-100 text-slate-300"><ImageOff size={48} /></div>;
  const cur = media[i];
  return (
    // сетка: слева колонка миниатюр той же высоты, что и главное фото (прокручивается внутри), справа фото 3:4
    <div className="lg:grid lg:grid-cols-[4.5rem_minmax(0,1fr)] lg:content-start lg:gap-3 lg:self-start">
      {n > 1 && (
        <div className="relative hidden lg:block">
          <div ref={strip} className="no-scrollbar absolute inset-0 flex flex-col gap-2 overflow-y-auto overscroll-contain">
            {media.map((m, k) => (
              <button key={k} data-k={k} onClick={() => setI(k)} onMouseEnter={() => m.kind !== 'video' && setI(k)} aria-label={m.kind === 'video' ? 'Видео' : `Фото ${k + 1}`} aria-current={k === i}
                className={`relative aspect-[3/4] w-full shrink-0 overflow-hidden rounded-xl border-2 bg-slate-100 transition ${k === i ? 'border-slate-900' : 'border-transparent opacity-75 hover:opacity-100'}`}>
                {m.kind === 'video' ? <span className="flex h-full w-full items-center justify-center bg-slate-800"><Play size={20} className="text-white" fill="currentColor" /></span> : <img src={m.path} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={`relative aspect-[3/4] w-full overflow-hidden rounded-3xl bg-slate-100 ${n > 1 ? '' : 'lg:col-span-2'}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {cur.kind === 'video'
          ? <VideoPlayer key={cur.path} src={cur.path} className="absolute inset-0 h-full w-full" />
          : <button type="button" onClick={() => setFull(true)} className="absolute inset-0 h-full w-full cursor-zoom-in" aria-label="Открыть фото во весь экран"><img src={cur.path} alt={alt} className="absolute inset-0 h-full w-full object-cover" /></button>}
        {n > 1 && <>
          <button onClick={() => go(-1)} className="absolute top-1/2 left-3 hidden -translate-y-1/2 rounded-full bg-white/90 p-2 text-slate-900 shadow sm:block" aria-label="Предыдущее фото"><ChevronLeft /></button>
          <button onClick={() => go(1)} className="absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-full bg-white/90 p-2 text-slate-900 shadow sm:block" aria-label="Следующее фото"><ChevronRight /></button>
          {n <= 8
            ? <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5 lg:hidden">{media.map((_, k) => <span key={k} className={`h-1.5 rounded-full shadow transition-all ${k === i ? 'w-5 bg-white' : 'w-1.5 bg-white/60'}`} />)}</div>
            : <div className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white lg:hidden">{i + 1} / {n}</div>}
        </>}
      </div>
      {full && <Viewer media={media.filter((m) => m.kind !== 'video')} start={media.filter((m) => m.kind !== 'video').indexOf(cur)} alt={alt} onClose={() => setFull(false)} />}
    </div>
  );
}

function Viewer({ media, start, alt, onClose }) {
  const [i, setI] = useState(Math.max(0, start));
  const [z, setZ] = useState({ s: 1, x: 0, y: 0 });
  const g = useRef({});
  const n = media.length;
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') nav(1); if (e.key === 'ArrowLeft') nav(-1); };
    window.addEventListener('keydown', k); document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const nav = (d) => { setI((x) => (x + d + n) % n); setZ({ s: 1, x: 0, y: 0 }); };
  const clamp = (s) => Math.min(4, Math.max(1, s));
  const onWheel = (e) => setZ((v) => { const s = clamp(v.s * (e.deltaY < 0 ? 1.2 : 1 / 1.2)); return s === 1 ? { s, x: 0, y: 0 } : { ...v, s }; });
  const onDouble = () => setZ((v) => (v.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.5, x: 0, y: 0 }));
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const onTouchStart = (e) => {
    const t = e.touches;
    if (t.length === 2) g.current = { pinch: dist(t), s0: z.s };
    else g.current = { x: t[0].clientX, y: t[0].clientY, x0: z.x, y0: z.y, t: Date.now(), last: g.current.tap };
  };
  const onTouchMove = (e) => {
    const t = e.touches;
    if (t.length === 2 && g.current.pinch) { const s = clamp((g.current.s0 * dist(t)) / g.current.pinch); setZ((v) => ({ ...v, s })); }
    else if (t.length === 1 && z.s > 1) setZ((v) => ({ ...v, x: g.current.x0 + t[0].clientX - g.current.x, y: g.current.y0 + t[0].clientY - g.current.y }));
  };
  const onTouchEnd = (e) => {
    const c = g.current;
    if (c.pinch) { g.current = {}; if (z.s <= 1.05) setZ({ s: 1, x: 0, y: 0 }); return; }
    const dx = e.changedTouches[0].clientX - c.x;
    if (z.s === 1 && Math.abs(dx) > 50) { nav(dx < 0 ? 1 : -1); return; }
    // двойное касание — увеличить/уменьшить
    if (Date.now() - c.t < 250 && Math.abs(dx) < 10) { if (c.last && Date.now() - c.last < 350) { onDouble(); g.current = {}; } else g.current = { tap: Date.now() }; }
  };
  const img = media[i];
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black" role="dialog" aria-label="Просмотр фото">
      <div className="absolute inset-0 overflow-hidden" onWheel={onWheel} onDoubleClick={onDouble} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} style={{ touchAction: 'none' }}>
        <img src={img.path} alt={alt} draggable={false} className="h-full w-full object-contain transition-transform duration-75 select-none" style={{ transform: `translate(${z.x}px, ${z.y}px) scale(${z.s})`, cursor: z.s > 1 ? 'zoom-out' : 'zoom-in' }} />
      </div>
      <button onClick={onClose} className="absolute top-4 right-4 rounded-full bg-white/15 p-2.5 text-white" aria-label="Закрыть"><X /></button>
      {n > 1 && <>
        <button onClick={() => nav(-1)} className="absolute top-1/2 left-3 hidden -translate-y-1/2 rounded-full bg-white/15 p-3 text-white sm:block" aria-label="Предыдущее"><ChevronLeft /></button>
        <button onClick={() => nav(1)} className="absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-full bg-white/15 p-3 text-white sm:block" aria-label="Следующее"><ChevronRight /></button>
      </>}
      <div className="absolute bottom-4 rounded-full bg-white/15 px-3 py-1 text-xs text-white">{i + 1} / {n} · дважды нажмите, чтобы увеличить</div>
    </div>
  );
}
