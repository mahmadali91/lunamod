// Окно выбора пункта выдачи на карте (OpenStreetMap + Leaflet, без ключей).
// Телефон: на весь экран, карта сверху, список снизу. Компьютер: список слева, карта справа.
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, Search, MapPin, Check, Clock } from 'lucide-react';

const hasPos = (p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)) && Number(p.lat) !== 0;

export default function PointMap({ points, value, title = 'Пункты выдачи', onPick, onClose }) {
  const box = useRef(null);
  const map = useRef(null);
  const markers = useRef(new Map());
  const listRef = useRef(null);
  const [active, setActive] = useState(value || null);
  const [q, setQ] = useState('');
  const [bounds, setBounds] = useState(null);
  const withPos = useMemo(() => points.filter(hasPos), [points]);

  // карта
  useEffect(() => {
    const m = L.map(box.current, { preferCanvas: true, zoomControl: true, attributionControl: true });
    map.current = m;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    const renderer = L.canvas({ padding: 0.5 });
    withPos.forEach((p) => {
      const mk = L.circleMarker([Number(p.lat), Number(p.lon)], { renderer, radius: 7, weight: 2, color: '#fff', fillColor: '#0f172a', fillOpacity: 0.9 })
        .addTo(m).on('click', () => setActive(p));
      markers.current.set(p.code, mk);
    });
    const sel = value && withPos.find((p) => p.code === value.code);
    if (sel) m.setView([Number(sel.lat), Number(sel.lon)], 15);
    else if (withPos.length) m.fitBounds(L.latLngBounds(withPos.map((p) => [Number(p.lat), Number(p.lon)])), { padding: [20, 20], maxZoom: 14 });
    else m.setView([55.751, 37.618], 10);
    // большой город: не показываем всю область сразу (точки сливаются в пятно) — центр по медиане пунктов
    if (!sel && m.getZoom() < 11) {
      const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
      m.setView([med(withPos.map((p) => Number(p.lat))), med(withPos.map((p) => Number(p.lon)))], 11, { animate: false });
    }
    const upd = () => setBounds(m.getBounds());
    m.on('moveend', upd); upd();
    // окно появилось с анимацией — пересчитать размер карты
    const t = setTimeout(() => m.invalidateSize(), 150);
    return () => { clearTimeout(t); m.remove(); markers.current.clear(); };
  }, [withPos]); // eslint-disable-line react-hooks/exhaustive-deps

  // подсветка выбранного пункта
  useEffect(() => {
    markers.current.forEach((mk, code) => {
      const on = active?.code === code;
      mk.setStyle({ radius: on ? 11 : 7, fillColor: on ? '#e11d48' : '#0f172a' });
      if (on) mk.bringToFront();
    });
    if (active && hasPos(active) && map.current) {
      const ll = [Number(active.lat), Number(active.lon)];
      if (!map.current.getBounds().contains(ll)) map.current.panTo(ll);
    }
  }, [active]);

  // закрытие по Esc, без прокрутки страницы под окном
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  // список: по поиску — все совпадения; без поиска — то, что видно на карте
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    let l = s ? points.filter((p) => `${p.address} ${p.name || ''}`.toLowerCase().includes(s))
      : bounds ? withPos.filter((p) => bounds.contains([Number(p.lat), Number(p.lon)])) : points;
    if (!s && bounds) {
      const c = bounds.getCenter();
      l = [...l].sort((a, b) => c.distanceTo([Number(a.lat), Number(a.lon)]) - c.distanceTo([Number(b.lat), Number(b.lon)]));
    }
    return l.slice(0, 150);
  }, [q, bounds, points, withPos]);

  const focus = (p) => {
    setActive(p);
    if (hasPos(p) && map.current) map.current.setView([Number(p.lat), Number(p.lon)], Math.max(map.current.getZoom(), 15));
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white sm:p-6 sm:bg-black/50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white sm:mx-auto sm:w-full sm:max-w-6xl sm:rounded-3xl sm:shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <MapPin size={20} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{title}</div>
            <div className="text-xs text-slate-500">{points.length} пунктов · нажмите на точку на карте или выберите из списка</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="rounded-full p-2 hover:bg-slate-100"><X size={22} /></button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* карта: на телефоне сверху */}
          <div className="relative h-[45vh] shrink-0 sm:order-2 sm:h-auto sm:flex-1">
            <div ref={box} className="absolute inset-0 z-0" />
          </div>

          {/* список */}
          <div className="flex min-h-0 flex-1 flex-col border-t border-slate-200 sm:order-1 sm:w-[380px] sm:flex-none sm:border-t-0 sm:border-r">
            <div className="relative p-3">
              <Search size={16} className="pointer-events-none absolute top-1/2 left-6 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Улица, метро или название" className="w-full rounded-2xl border border-slate-300 bg-white py-2.5 pr-3 pl-9 text-sm outline-none focus:border-slate-900" />
            </div>
            <div ref={listRef} className="min-h-0 flex-1 overflow-auto">
              {!list.length && <p className="px-4 py-6 text-center text-sm text-slate-500">{q ? 'Ничего не нашлось' : 'В этой части карты пунктов нет — отдалите карту'}</p>}
              {list.map((p) => {
                const on = active?.code === p.code;
                return (
                  <button type="button" key={p.code} onClick={() => focus(p)} className={`flex w-full gap-2 border-b border-slate-100 px-4 py-3 text-left text-sm ${on ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}>
                    <MapPin size={16} className="mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block font-medium">{p.address}</span>
                      {(p.type || p.name) && <span className={`block text-xs ${on ? 'text-slate-300' : 'text-slate-500'}`}>{[p.type, p.name].filter(Boolean).join(' · ')}</span>}
                      {p.workTime && <span className={`mt-0.5 flex items-center gap-1 text-xs ${on ? 'text-slate-300' : 'text-slate-500'}`}><Clock size={12} /> {p.workTime}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* выбранный пункт и кнопка */}
            <div className="border-t border-slate-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {active ? (
                <>
                  <div className="mb-2 text-sm"><span className="font-semibold">{active.address}</span>{active.workTime ? <span className="block text-xs text-slate-500">{active.workTime}</span> : null}</div>
                  <button type="button" onClick={() => onPick(active)} className="flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 py-3 font-semibold text-white"><Check size={18} /> Заберу здесь</button>
                </>
              ) : <p className="text-center text-sm text-slate-500">Выберите пункт на карте или в списке</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
