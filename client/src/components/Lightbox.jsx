import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { fileUrl } from '../api';

/** Просмотр фото крупно: стрелки / свайп / Esc */
export default function Lightbox({ images, start = 0, title, onClose }) {
  const [i, setI] = useState(start);
  const [touch, setTouch] = useState(null);
  const n = images.length;
  const go = (d) => setI((x) => (x + d + n) % n);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  if (!n) return null;
  return createPortal(
    <div className="no-print fixed inset-0 z-[80] flex flex-col bg-slate-950/90 backdrop-blur-sm" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 truncate font-medium">{title}{n > 1 && <span className="ml-2 text-sm text-white/60">{i + 1} / {n}</span>}</div>
        <button onClick={onClose} className="rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Закрыть"><X size={22} /></button>
      </div>
      <div className="relative flex flex-1 items-center justify-center p-4"
        onTouchStart={(e) => setTouch(e.touches[0].clientX)} onTouchEnd={(e) => { if (touch !== null) { const dx = e.changedTouches[0].clientX - touch; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); } setTouch(null); }}>
        <img src={fileUrl(images[i])} alt={title} onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded-xl bg-white object-contain shadow-2xl" style={{ maxHeight: 'calc(100vh - 140px)' }} />
        {n > 1 && (
          <>
            <button onClick={(e) => { e.stopPropagation(); go(-1); }} className="absolute left-3 rounded-full bg-white/15 p-3 text-white hover:bg-white/25" aria-label="Назад"><ChevronLeft size={26} /></button>
            <button onClick={(e) => { e.stopPropagation(); go(1); }} className="absolute right-3 rounded-full bg-white/15 p-3 text-white hover:bg-white/25" aria-label="Вперёд"><ChevronRight size={26} /></button>
          </>
        )}
      </div>
      {n > 1 && (
        <div className="flex justify-center gap-2 pb-4" onClick={(e) => e.stopPropagation()}>
          {images.map((src, k) => <img key={k} src={fileUrl(src)} alt="" onClick={() => setI(k)} className={`h-14 w-14 cursor-pointer rounded-lg bg-white object-cover ${k === i ? 'ring-2 ring-indigo-400' : 'opacity-60 hover:opacity-100'}`} />)}
        </div>
      )}
    </div>,
    document.body,
  );
}
