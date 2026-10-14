import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TrendingUp, TrendingDown, Wallet, ShoppingBag, Boxes, CircleDollarSign, AlertTriangle, Sun, ArrowRight } from 'lucide-react';
import { Badge, Spinner, Thumb, fmtDate, fmtNum, useLoad, useMoney } from '../ui';

const periods = [[7, '7 дней'], [30, '30 дней'], [90, '90 дней'], [365, 'Год']];
const compact = (v) => (v >= 1e6 ? fmtNum(v / 1e6, 1) + ' млн' : v >= 1e3 ? fmtNum(v / 1e3, 0) + ' тыс' : fmtNum(v, 0));

function Kpi({ icon: Icon, label, value, sub, delta, tone = 'indigo' }) {
  const tones = { indigo: 'bg-indigo-50 text-indigo-600', green: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', sky: 'bg-sky-50 text-sky-600' };
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <span className={`rounded-xl p-2 ${tones[tone]}`}><Icon size={18} /></span>
      </div>
      <div className="mt-3 text-lg font-bold tracking-tight text-slate-900 sm:text-2xl">{value}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
        {delta !== undefined && delta !== null && (
          <span className={`inline-flex items-center gap-0.5 font-semibold ${delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {delta >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{delta >= 0 ? '+' : ''}{fmtNum(delta, 1)}%
          </span>
        )}
        {sub}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, money }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 text-slate-500">{new Date(d.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' })}</div>
      <div className="text-sm font-semibold text-slate-900">{money(d.revenue)}</div>
      <div className="text-slate-500">Продаж: {d.count}</div>
    </div>
  );
}

export default function Dashboard() {
  const [days, setDays] = useState(30);
  const { data, loading } = useLoad('/dashboard?days=' + days);
  const money = useMoney();

  if (!data) return <Spinner />;
  const k = data.kpi;
  const delta = k.prevRevenue > 0 ? ((k.revenue - k.prevRevenue) / k.prevRevenue) * 100 : null;
  const chTotal = data.byChannel.reduce((s, c) => s + c.revenue, 0) || 1;
  const topMax = data.topProducts[0]?.revenue || 1;

  return (
    <div className={`mx-auto max-w-7xl space-y-6 transition ${loading ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Дашборд</h1>
          <p className="mt-1 text-sm text-slate-500">Сводка по продажам и складу</p>
        </div>
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {periods.map(([d, l]) => (
            <button key={d} onClick={() => setDays(d)} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${days === d ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi icon={Wallet} label="Выручка" value={money(k.revenue)} delta={delta} sub={delta !== null ? 'к прошлому периоду' : ''} />
        <Kpi icon={CircleDollarSign} tone="green" label="Валовая прибыль" value={money(k.profit)} sub={k.revenue ? `маржа ${fmtNum((k.profit / k.revenue) * 100, 1)}%` : '—'} />
        <Kpi icon={ShoppingBag} tone="sky" label="Продаж" value={fmtNum(k.salesCount)} sub={`средний чек ${money(k.avgCheck)}`} />
        <Kpi icon={Sun} tone="amber" label="Сегодня" value={money(k.todayRevenue)} sub={`${k.todayCount} продаж`} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="card p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Выручка по дням</h2>
              <p className="text-xs text-slate-500">Наведите на график, чтобы увидеть детали</p>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.chart} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2a78d6" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#2a78d6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#eef0f3" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} minTickGap={24}
                  tickFormatter={(d) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={compact} width={64} />
                <Tooltip content={<ChartTooltip money={money} />} cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} />
                <Area type="monotone" dataKey="revenue" stroke="#2a78d6" strokeWidth={2} fill="url(#rev)" activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-slate-900">Каналы продаж</h2>
          <p className="mb-4 text-xs text-slate-500">Доля выручки за период</p>
          {data.byChannel.length === 0 && <div className="py-10 text-center text-sm text-slate-400">Нет продаж за период</div>}
          {data.byChannel.length > 0 && (
            <>
              <div className="mb-5 flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
                {data.byChannel.map((c) => <div key={c.id} title={`${c.name}: ${money(c.revenue)}`} style={{ width: `${(c.revenue / chTotal) * 100}%`, background: c.color }} />)}
              </div>
              <div className="space-y-3">
                {data.byChannel.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-slate-700">{c.name}</div>
                      <div className="text-xs text-slate-400">{c.count} продаж · {fmtNum((c.revenue / chTotal) * 100, 0)}%</div>
                    </div>
                    <span className="text-right font-semibold whitespace-nowrap text-slate-900">{money(c.revenue)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
            <div><div className="text-xs text-slate-500">Склад (себест.)</div><div className="font-semibold">{money(k.stockValue)}</div></div>
            <div><div className="text-xs text-slate-500">Склад (розница)</div><div className="font-semibold">{money(k.stockRetail)}</div></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="card p-5">
          <h2 className="mb-4 font-semibold text-slate-900">Топ товаров</h2>
          {data.topProducts.length === 0 && <div className="py-10 text-center text-sm text-slate-400">Нет данных</div>}
          <div className="space-y-4">
            {data.topProducts.map((p, i) => (
              <Link to={`/products/${p.id}`} key={p.id} className="group flex items-center gap-3">
                <span className="w-4 text-xs font-semibold text-slate-400">{i + 1}</span>
                <Thumb src={p.image} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="truncate font-medium text-slate-700 group-hover:text-indigo-600">{p.name}</span>
                    <span className="shrink-0 font-semibold">{money(p.revenue)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-[#2a78d6]" style={{ width: `${(p.revenue / topMax) * 100}%` }} /></div>
                    <span className="text-xs text-slate-500">{fmtNum(p.quantity)} шт</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Заканчиваются</h2>
            {data.lowStockCount > 0 && <Badge color="amber"><AlertTriangle size={12} className="mr-1" />{data.lowStockCount}</Badge>}
          </div>
          {data.lowStock.length === 0 && <div className="flex flex-col items-center py-10 text-sm text-slate-400"><Boxes className="mb-2" />Все остатки в норме</div>}
          <div className="divide-y divide-slate-100">
            {data.lowStock.map((p) => (
              <Link to={`/products/${p.id}`} key={p.id} className="flex items-center gap-3 py-2.5 hover:bg-slate-50">
                <Thumb src={p.image} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-slate-500">{p.sku || '—'} · мин. {fmtNum(p.minStock)}</div>
                </div>
                <Badge color={p.quantity <= 0 ? 'red' : 'amber'}>{p.quantity <= 0 ? 'Нет' : fmtNum(p.quantity) + ' шт'}</Badge>
              </Link>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Последние продажи</h2>
            <Link to="/sales" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">Все <ArrowRight size={12} /></Link>
          </div>
          <div className="divide-y divide-slate-100">
            {data.recentSales.map((s) => (
              <div key={s.id} className="flex items-center gap-3 py-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.channel?.color || '#94a3b8' }} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{s.number} {s.status === 'returned' && <Badge color="red">возврат</Badge>}</div>
                  <div className="truncate text-xs text-slate-500">{fmtDate(s.date)} · {s.channel?.name || 'Без канала'}{s.counterparty ? ' · ' + s.counterparty.name : ''}</div>
                </div>
                <span className={`text-sm font-semibold ${s.status === 'returned' ? 'text-slate-400 line-through' : ''}`}>{money(s.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[['Товаров', k.productsCount, '/products'], ['Складов', k.warehouses, '/warehouses'], ['Каналов', data.channels, '/channels'], ['Контрагентов', k.counterparties, '/counterparties']].map(([l, v, to]) => (
          <Link key={l} to={to} className="card flex items-center justify-between p-4 hover:border-indigo-200 hover:shadow-md">
            <span className="text-sm text-slate-500">{l}</span><span className="text-lg font-bold">{fmtNum(v)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
