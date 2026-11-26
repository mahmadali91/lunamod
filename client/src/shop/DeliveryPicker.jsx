import { useEffect, useRef, useState } from 'react';
import { Store, Truck, Package, MapPin, Search, Loader2 } from 'lucide-react';
import { shopApi } from './api';
import { useShop } from './store';

const ICON = { pickup: Store, courier: Truck, custom: Truck, pek: Truck, cdek_door: Truck, yandex_door: Truck, yandex_express: Truck };
const inputCls = 'w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900';

function CitySearch({ value, onPick, source = 'cdek' }) {
  const [q, setQ] = useState(value?.name || '');
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2 || q === value?.name) { setList([]); return; }
    const t = setTimeout(() => shopApi(`/delivery/${source}/cities?q=` + encodeURIComponent(q)).then((r) => { setList(r); setOpen(true); }).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative">
      <Search size={16} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-slate-400" />
      <input value={q} onChange={(e) => { setQ(e.target.value); onPick(null); }} onFocus={() => list.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder="Город" className={inputCls + ' pl-10'} />
      {open && list.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-xl">
          {list.map((c) => <button type="button" key={c.code} onMouseDown={() => { setQ(c.name); onPick(c); setOpen(false); }} className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50">{c.name}</button>)}
        </div>
      )}
    </div>
  );
}

function CdekPoints({ city, value, onPick, source = 'cdek' }) {
  const [points, setPoints] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { setPoints(null); if (city) shopApi(source === 'yandex' ? '/delivery/yandex/points?geoId=' + city.code : '/delivery/cdek/points?cityCode=' + city.code).then(setPoints).catch(() => setPoints([])); }, [city]);
  if (!city) return null;
  if (!points) return <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Загружаем пункты выдачи…</div>;
  if (!points.length) return <div className="text-sm text-rose-600">В этом городе нет пунктов выдачи {source === 'yandex' ? 'Яндекса' : 'СДЭК'}</div>;
  const list = points.filter((p) => !q || (p.address + p.name).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="rounded-2xl border border-slate-200">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Поиск по адресу (${points.length} пунктов)`} className="w-full rounded-t-2xl border-b border-slate-100 px-4 py-2.5 text-sm outline-none" />
      <div className="max-h-56 overflow-auto">
        {list.slice(0, 100).map((p) => (
          <button type="button" key={p.code} onClick={() => onPick(p)} className={`flex w-full gap-2 px-4 py-2.5 text-left text-sm ${value?.code === p.code ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}>
            <MapPin size={16} className="mt-0.5 shrink-0" /><span><span className="font-medium">{p.address}</span>{p.type && source === 'yandex' && <span className={`block text-xs ${value?.code === p.code ? 'text-slate-300' : 'text-slate-500'}`}>{p.type}{p.name ? ' · ' + p.name : ''}</span>}{p.workTime && <span className={`block text-xs ${value?.code === p.code ? 'text-slate-300' : 'text-slate-500'}`}>{p.workTime}</span>}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Выбор способа доставки и расчёт стоимости. onChange({ methodId, to, price, days, ready }) */
export default function DeliveryPicker({ items, subtotal, initialAddress, onChange }) {
  const { config, money } = useShop();
  const methods = config.deliveryMethods;
  const [methodId, setMethodId] = useState(methods[0]?.id);
  const [to, setTo] = useState({ address: initialAddress || '' });
  const [city, setCity] = useState(null);
  const [point, setPoint] = useState(null);
  const [q, setQ] = useState({ loading: false });
  const seq = useRef(0);
  const m = methods.find((x) => x.id === methodId);

  const fixedPrice = (x) => (x.freeFrom > 0 && subtotal >= x.freeFrom ? 0 : x.price);
  const body = { ...to, ...(city ? { cityCode: city.code, city: city.name } : {}), ...(point ? { pointCode: point.code, pointAddress: point.address } : {}) };
  const complete = m && ({
    none: true, address: to.address?.trim(), cityAddress: to.address?.trim(), pointText: to.point?.trim(),
    postcode: /^\d{6}$/.test(to.postcode || '') && to.address?.trim(), cdekPoint: city && point, cdekAddress: city && to.address?.trim(), yandexPoint: city && point,
  }[m.needs]);

  useEffect(() => {
    if (!m) return;
    if (!complete) { setQ({ loading: false }); onChange({ methodId, to: body, ready: false, price: m.api ? null : fixedPrice(m) }); return; }
    const id = ++seq.current;
    setQ({ loading: true });
    const t = setTimeout(() => shopApi('/delivery/quote', { method: 'POST', body: { methodId, to: body, items } })
      .then((r) => { if (id === seq.current) { setQ({ price: r.price, days: r.days }); onChange({ methodId, to: body, price: r.price, days: r.days, ready: true }); } })
      .catch((e) => { if (id === seq.current) { setQ({ error: e.message }); onChange({ methodId, to: body, ready: false }); } }), 400);
    return () => clearTimeout(t);
  }, [methodId, JSON.stringify(body), subtotal]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!methods.length) return <p className="text-rose-600">Способы доставки не настроены — свяжитесь с магазином.</p>;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {methods.map((x) => {
          const Icon = ICON[x.carrier] || Package;
          const price = x.id === methodId && q.price !== undefined ? q.price : x.api ? null : fixedPrice(x);
          return (
            <button type="button" key={x.id} onClick={() => { if ((m?.needs === 'yandexPoint') !== (x.needs === 'yandexPoint')) setCity(null); setMethodId(x.id); setPoint(null); }}
              className={`flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition ${x.id === methodId ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <Icon className="mt-0.5 shrink-0" size={20} />
              <div className="min-w-0">
                <div className="font-semibold">{x.name}</div>
                <div className="text-sm text-slate-500">{price === null ? 'стоимость по расчёту' : price === 0 ? 'бесплатно' : money(price)}{x.days ? ` · ${x.id === methodId && q.days ? q.days : x.days}` : ''}</div>
                {x.freeFrom > 0 && price !== 0 && <div className="text-xs text-emerald-700">бесплатно от {money(x.freeFrom)}</div>}
              </div>
            </button>
          );
        })}
      </div>

      {m?.description && m.needs === 'none' && <div className="flex items-start gap-2 rounded-2xl bg-slate-50 p-4 text-sm"><MapPin size={16} className="mt-0.5 shrink-0" />{m.description}</div>}
      {m?.description && m.needs !== 'none' && <p className="text-sm text-slate-500">{m.description}</p>}
      {(m?.needs === 'cdekPoint' || m?.needs === 'cdekAddress') && <CitySearch value={city} onPick={(c) => { setCity(c); setPoint(null); }} />}
      {m?.needs === 'cdekPoint' && <CdekPoints city={city} value={point} onPick={setPoint} />}
      {m?.needs === 'yandexPoint' && <CitySearch key="ya" source="yandex" value={city} onPick={(c) => { setCity(c); setPoint(null); }} />}
      {m?.needs === 'yandexPoint' && <CdekPoints source="yandex" city={city} value={point} onPick={setPoint} />}
      {m?.needs === 'postcode' && <input inputMode="numeric" maxLength={6} value={to.postcode || ''} onChange={(e) => setTo({ ...to, postcode: e.target.value.replace(/\D/g, '') })} placeholder="Почтовый индекс" className={inputCls} />}
      {['address', 'cityAddress', 'postcode', 'cdekAddress'].includes(m?.needs) && (
        <textarea rows={2} value={to.address || ''} onChange={(e) => setTo({ ...to, address: e.target.value })}
          placeholder={m.needs === 'cdekAddress' ? 'Улица, дом, квартира' : m.needs === 'postcode' ? 'Город, улица, дом, квартира' : 'Город, улица, дом, квартира, подъезд'} className={inputCls} />
      )}
      {m?.needs === 'pointText' && <input value={to.point || ''} onChange={(e) => setTo({ ...to, point: e.target.value })} placeholder="Город и адрес пункта выдачи" className={inputCls} />}
      {q.loading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Считаем доставку…</div>}
      {q.error && <div className="text-sm text-rose-600">{q.error}</div>}
    </div>
  );
}
