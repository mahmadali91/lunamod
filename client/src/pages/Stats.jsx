import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { BarChart3, Download, Plus, Trash2, Wallet, TrendingUp, Percent, ShoppingBag, Undo2, Megaphone } from 'lucide-react';
import { api, qs } from '../api';
import { Badge, Button, Field, PageHeader, RefSelect, Spinner, Thumb, fmtDate, fmtNum, useLoad, useMoney, useToast } from '../ui';
import { downloadXlsx } from '../excel';

const iso = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const PRESETS = [
  ['month', 'Этот месяц', () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth(), 1), n]; }],
  ['prev', 'Прошлый месяц', () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 0)]; }],
  ['30', '30 дней', () => [new Date(Date.now() - 29 * 864e5), new Date()]],
  ['90', 'Квартал', () => [new Date(Date.now() - 89 * 864e5), new Date()]],
  ['365', 'Год', () => [new Date(Date.now() - 364 * 864e5), new Date()]],
];
const GROUPS = [['channel', 'Каналы'], ['category', 'Категории'], ['product', 'Товары'], ['variant', 'Размеры и цвета'], ['counterparty', 'Покупатели'], ['warehouse', 'Склады'], ['payment', 'Способы оплаты']];
const ABC_COLORS = { A: '#2a78d6', B: '#7fb0ea', C: '#c7dcf5' }; // одна шкала: A — самый насыщенный
const compact = (v) => (Math.abs(v) >= 1e6 ? fmtNum(v / 1e6, 1) + ' млн' : Math.abs(v) >= 1e3 ? fmtNum(v / 1e3, 0) + ' тыс' : fmtNum(v, 0));

function Tile({ icon: Icon, label, value, sub, tone = 'slate' }) {
  const t = { slate: 'text-slate-500 bg-slate-100', green: 'text-emerald-600 bg-emerald-50', red: 'text-rose-600 bg-rose-50', blue: 'text-sky-600 bg-sky-50', amber: 'text-amber-600 bg-amber-50' }[tone];
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-sm text-slate-500"><span className={`rounded-lg p-1.5 ${t}`}><Icon size={14} /></span>{label}</div>
      <div className="mt-2 text-xl font-bold tracking-tight">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function TrendTooltip({ active, payload, money, monthly }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const label = monthly ? new Date(d.period + '-01').toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : new Date(d.period).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 text-slate-500">{label}</div>
      <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#2a78d6]" />Выручка: <b>{money(d.revenue)}</b></div>
      <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#1baf7a]" />Прибыль: <b>{money(d.profit)}</b></div>
      <div className="text-slate-500">Продаж: {d.salesCount}</div>
    </div>
  );
}

function Analytics({ range, money }) {
  const [groupBy, setGroupBy] = useState('channel');
  const { data, loading } = useLoad('/stats' + qs({ ...range, groupBy }));
  const trend = useLoad('/stats/trend' + qs(range));
  const t = data?.totals;
  const isCh = groupBy === 'channel';

  const exportXlsx = () => downloadXlsx(`statistika-${groupBy}-${range.from}_${range.to}.xlsx`, [
    { title: GROUPS.find((g) => g[0] === groupBy)[1], value: (r) => r.name, width: 36 },
    ...(['product', 'variant'].includes(groupBy) ? [{ title: 'Артикул', value: (r) => r.sku, width: 16 }] : []),
    { title: 'Продаж', value: (r) => r.salesCount }, { title: 'Единиц', value: (r) => r.qty },
    { title: 'Выручка', value: (r) => r.revenue, width: 14 }, { title: 'Себестоимость', value: (r) => r.cost, width: 14 },
    { title: 'Валовая прибыль', value: (r) => r.profit, width: 16 }, { title: 'Маржа, %', value: (r) => r.margin },
    { title: 'Доля выручки, %', value: (r) => r.share, width: 16 }, { title: 'Средний чек', value: (r) => r.avgCheck, width: 13 },
    { title: 'Возвраты, ₽', value: (r) => r.returnedSum, width: 12 },
    ...(isCh ? [{ title: 'Расходы', value: (r) => r.expense }, { title: 'Чистая прибыль', value: (r) => r.netProfit, width: 15 }, { title: 'ROMI, %', value: (r) => r.romi }] : []),
  ], data.rows);

  return (
    <div className="space-y-6">
      {!t ? <Spinner /> : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile icon={Wallet} tone="blue" label="Выручка" value={money(t.revenue)} />
          <Tile icon={ShoppingBag} label="Себестоимость" value={money(t.cost)} />
          <Tile icon={TrendingUp} tone="green" label="Валовая прибыль" value={money(t.profit)} />
          <Tile icon={Percent} tone="green" label="Маржа" value={fmtNum(t.margin, 1) + '%'} />
          <Tile icon={Megaphone} tone="amber" label="Расходы каналов" value={money(t.expense)} />
          <Tile icon={TrendingUp} tone={t.netProfit >= 0 ? 'green' : 'red'} label="Чистая прибыль" value={money(t.netProfit)} />
          <Tile icon={ShoppingBag} label="Продаж" value={fmtNum(t.salesCount)} sub={`ср. чек ${money(t.avgCheck)}`} />
          <Tile icon={Undo2} tone="red" label="Возвраты" value={money(t.returnedSum)} />
        </div>
      )}

      <div className="card p-5">
        <h2 className="font-semibold">Выручка и прибыль {trend.data?.monthly ? 'по месяцам' : 'по дням'}</h2>
        <p className="mb-3 text-xs text-slate-500">Наведите на график, чтобы увидеть значения</p>
        <div className="h-72">
          {trend.data && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend.data.points} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#eef0f3" />
                <XAxis dataKey="period" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} minTickGap={20}
                  tickFormatter={(p) => (trend.data.monthly ? new Date(p + '-01').toLocaleDateString('ru-RU', { month: 'short' }) : new Date(p).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }))} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={compact} width={64} />
                <Tooltip content={<TrendTooltip money={money} monthly={trend.data.monthly} />} cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Line name="Выручка" type="monotone" dataKey="revenue" stroke="#2a78d6" strokeWidth={2} dot={trend.data.monthly ? { r: 4, strokeWidth: 2, fill: '#fff' } : false} activeDot={{ r: 5 }} />
                <Line name="Валовая прибыль" type="monotone" dataKey="profit" stroke="#1baf7a" strokeWidth={2} dot={trend.data.monthly ? { r: 4, strokeWidth: 2, fill: '#fff' } : false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
          <span className="text-sm text-slate-500">Разрез:</span>
          {GROUPS.map(([k, l]) => (
            <button key={k} onClick={() => setGroupBy(k)} className={`rounded-full px-3 py-1 text-sm ${groupBy === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{l}</button>
          ))}
          <Button size="sm" variant="secondary" icon={Download} className="ml-auto" disabled={!data} onClick={exportXlsx}>Excel</Button>
        </div>
        {!data ? <Spinner /> : data.rows.length === 0 ? <div className="py-12 text-center text-sm text-slate-400">Нет продаж за период</div> : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th">{GROUPS.find((g) => g[0] === groupBy)[1]}</th>
                  <th className="th text-right">Продаж</th><th className="th text-right">Ед.</th>
                  <th className="th text-right">Выручка</th><th className="th w-40">Доля</th>
                  <th className="th text-right">Прибыль</th><th className="th text-right">Маржа</th>
                  {isCh && <><th className="th text-right">Расходы</th><th className="th text-right">Чистая</th><th className="th text-right">ROMI</th><th className="th text-right">Цена продажи</th></>}
                  {!isCh && <th className="th text-right">Ср. чек</th>}
                  <th className="th text-right">Возвраты</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="td">
                      <div className="flex items-center gap-2">
                        {['product', 'variant'].includes(groupBy) && <Thumb src={r.image} size={32} />}
                        {r.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />}
                        <div className="min-w-0"><div className="truncate font-medium">{r.name}</div>{r.sku && <div className="font-mono text-xs text-slate-400">{r.sku}</div>}</div>
                      </div>
                    </td>
                    <td className="td text-right tabular-nums">{fmtNum(r.salesCount)}</td>
                    <td className="td text-right tabular-nums">{fmtNum(r.qty)}</td>
                    <td className="td text-right font-semibold tabular-nums">{money(r.revenue)}</td>
                    <td className="td"><div className="flex items-center gap-2"><div className="h-1.5 flex-1 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-[#2a78d6]" style={{ width: `${r.share}%` }} /></div><span className="w-10 text-right text-xs text-slate-500">{fmtNum(r.share, 1)}%</span></div></td>
                    <td className={`td text-right tabular-nums ${r.profit < 0 ? 'text-rose-600' : ''}`}>{money(r.profit)}</td>
                    <td className="td text-right tabular-nums">{fmtNum(r.margin, 1)}%</td>
                    {isCh && <>
                      <td className="td text-right tabular-nums text-slate-600">{r.expense ? money(r.expense) : '—'}</td>
                      <td className={`td text-right font-medium tabular-nums ${r.netProfit < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{money(r.netProfit)}</td>
                      <td className="td text-right tabular-nums">{r.romi === null ? '—' : <Badge color={r.romi >= 0 ? 'green' : 'red'}>{fmtNum(r.romi, 0)}%</Badge>}</td>
                      <td className="td text-right tabular-nums text-slate-600">{r.costPerSale ? money(r.costPerSale) : '—'}</td>
                    </>}
                    {!isCh && <td className="td text-right tabular-nums">{money(r.avgCheck)}</td>}
                    <td className="td text-right tabular-nums text-slate-500">{r.returnedSum ? money(r.returnedSum) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {isCh && <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">ROMI = (валовая прибыль − расходы) ÷ расходы. Расходы на рекламу и комиссии каналов вносятся на вкладке «Расходы».</p>}
      </div>
    </div>
  );
}

function Abc({ range, money }) {
  const [by, setBy] = useState('product');
  const [metric, setMetric] = useState('revenue');
  const [categoryId, setCategoryId] = useState(null);
  const [cls, setCls] = useState('');
  const { data, loading } = useLoad('/stats/abc' + qs({ ...range, by, metric, categoryId: by === 'product' ? categoryId : '' }));
  const fmt = (v) => (metric === 'qty' ? fmtNum(v) + ' шт' : money(v));
  const rows = (data?.rows || []).filter((r) => !cls || r.abc === cls);
  const counts = data ? data.rows.length : 0;

  const exportXlsx = () => downloadXlsx(`abc-${by}-${metric}-${range.from}_${range.to}.xlsx`, [
    { title: 'Класс', value: (r) => r.abc, width: 7 }, { title: by === 'product' ? 'Товар' : 'Категория', value: (r) => r.name, width: 40 },
    ...(by === 'product' ? [{ title: 'Артикул', value: (r) => r.sku, width: 16 }] : []),
    { title: 'Выручка', value: (r) => r.revenue, width: 14 }, { title: 'Прибыль', value: (r) => r.profit, width: 14 }, { title: 'Продано, шт', value: (r) => r.qty, width: 12 },
    { title: 'Доля, %', value: (r) => r.share }, { title: 'Накопленная доля, %', value: (r) => r.cumShare, width: 18 },
  ], data.rows);

  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-end gap-4 p-4">
        <Field label="Анализировать">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-sm">
            {[['product', 'Товары'], ['category', 'Категории']].map(([k, l]) => <button key={k} onClick={() => setBy(k)} className={`rounded-md px-3 py-1.5 ${by === k ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}>{l}</button>)}
          </div>
        </Field>
        <Field label="По показателю">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-sm">
            {[['revenue', 'Выручка'], ['profit', 'Прибыль'], ['qty', 'Количество']].map(([k, l]) => <button key={k} onClick={() => setMetric(k)} className={`rounded-md px-3 py-1.5 ${metric === k ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}>{l}</button>)}
          </div>
        </Field>
        {by === 'product' && <Field label="Категория" className="w-64"><RefSelect path="/categories" value={categoryId} onChange={setCategoryId} placeholder="Все категории" /></Field>}
        <Button size="sm" variant="secondary" icon={Download} className="ml-auto" disabled={!data} onClick={exportXlsx}>Excel</Button>
      </div>

      {!data ? <Spinner /> : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[['A', 'Приносят ~80%', 'Ключевые позиции: держите в наличии, следите за ценой'], ['B', 'Следующие ~15%', 'Средняя важность: регулярный контроль'], ['C', 'Последние ~5%', 'Кандидаты на распродажу или вывод из ассортимента']].map(([k, title, hint]) => (
              <button key={k} onClick={() => setCls(cls === k ? '' : k)} className={`card p-5 text-left transition hover:shadow-md ${cls === k ? 'ring-2 ring-indigo-500' : ''}`}>
                <div className="flex items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl text-lg font-bold" style={{ background: ABC_COLORS[k], color: k === 'A' ? '#fff' : '#1e3a5f' }}>{k}</span>
                  <span className="text-xs text-slate-500">{title}</span>
                </div>
                <div className="mt-3 text-2xl font-bold">{fmtNum(data.summary[k].count)} <span className="text-sm font-normal text-slate-500">из {fmtNum(counts)} ({counts ? fmtNum((data.summary[k].count / counts) * 100, 0) : 0}%)</span></div>
                <div className="text-sm text-slate-600">{fmt(data.summary[k].value)} · {fmtNum(data.summary[k].share, 1)}%</div>
                <div className="mt-2 text-xs text-slate-400">{hint}</div>
              </button>
            ))}
          </div>

          <div className="card p-5">
            <div className="mb-2 text-sm font-medium">Доля в {metric === 'qty' ? 'количестве' : metric === 'profit' ? 'прибыли' : 'выручке'} и доля позиций</div>
            {[['Вклад', (k) => data.summary[k].share], ['Позиций', (k) => (counts ? (data.summary[k].count / counts) * 100 : 0)]].map(([label, f]) => (
              <div key={label} className="mb-2 flex items-center gap-3">
                <span className="w-16 text-xs text-slate-500">{label}</span>
                <div className="flex h-6 flex-1 gap-0.5 overflow-hidden rounded-md">
                  {'ABC'.split('').map((k) => f(k) > 0 && <div key={k} title={`${k}: ${fmtNum(f(k), 1)}%`} className="flex items-center justify-center text-xs font-semibold" style={{ width: `${f(k)}%`, background: ABC_COLORS[k], color: k === 'A' ? '#fff' : '#1e3a5f' }}>{f(k) > 6 ? `${k} ${fmtNum(f(k), 0)}%` : ''}</div>)}
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className="th w-16">Класс</th><th className="th">{by === 'product' ? 'Товар' : 'Категория'}</th><th className="th text-right">Выручка</th><th className="th text-right">Прибыль</th><th className="th text-right">Продано</th><th className="th text-right">Доля</th><th className="th text-right">Накоплено</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="td"><span className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold" style={{ background: ABC_COLORS[r.abc], color: r.abc === 'A' ? '#fff' : '#1e3a5f' }}>{r.abc}</span></td>
                      <td className="td"><div className="flex items-center gap-2">{by === 'product' && <Thumb src={r.image} size={32} />}<div className="min-w-0"><div className="truncate font-medium">{r.name}</div>{r.sku && <div className="font-mono text-xs text-slate-400">{r.sku}</div>}</div></div></td>
                      <td className="td text-right tabular-nums">{money(r.revenue)}</td>
                      <td className={`td text-right tabular-nums ${r.profit < 0 ? 'text-rose-600' : ''}`}>{money(r.profit)}</td>
                      <td className="td text-right tabular-nums">{fmtNum(r.qty)}</td>
                      <td className="td text-right tabular-nums">{fmtNum(r.share, 2)}%</td>
                      <td className="td text-right tabular-nums text-slate-500">{fmtNum(r.cumShare, 1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Expenses({ range, money }) {
  const { data, reload } = useLoad('/stats/expenses' + qs(range));
  const [f, setF] = useState({ channelId: null, date: iso(new Date()), amount: '', note: '' });
  const toast = useToast();
  const add = async (e) => {
    e.preventDefault();
    try { await api('/stats/expenses', { method: 'POST', body: f }); setF({ ...f, amount: '', note: '' }); toast('Расход добавлен'); reload(); } catch (err) { toast(err.message, 'error'); }
  };
  const del = async (id) => { if (!confirm('Удалить расход?')) return; await api('/stats/expenses/' + id, { method: 'DELETE' }); reload(); };
  const total = (data || []).reduce((a, x) => a + x.amount, 0);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <form onSubmit={add} className="card h-fit space-y-4 p-5">
        <h2 className="font-semibold">Добавить расход</h2>
        <p className="text-xs text-slate-500">Реклама, продвижение, комиссии площадок — всё, что вы тратите на канал продаж. Участвует в расчёте чистой прибыли и ROMI.</p>
        <Field label="Канал *"><RefSelect path="/channels" value={f.channelId} onChange={(v) => setF({ ...f, channelId: v })} placeholder="Выберите канал" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Дата"><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Сумма *"><input className="input" type="number" min="0" step="any" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        </div>
        <Field label="Комментарий"><input className="input" placeholder="напр. таргет в Instagram" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <Button type="submit" icon={Plus} disabled={!f.channelId || !f.amount}>Добавить</Button>
      </form>
      <div className="card lg:col-span-2">
        <div className="flex items-center justify-between border-b border-slate-100 p-4"><h2 className="font-semibold">Расходы за период</h2><b>{money(total)}</b></div>
        {!data ? <Spinner /> : data.length === 0 ? <div className="py-12 text-center text-sm text-slate-400">Расходов за период нет</div> : (
          <div className="divide-y divide-slate-100">
            {data.map((x) => (
              <div key={x.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.channel.color }} />
                <div className="min-w-0 flex-1"><div className="font-medium">{x.channel.name}</div><div className="text-xs text-slate-500">{fmtDate(x.date, false)}{x.note ? ' · ' + x.note : ''}</div></div>
                <b>{money(x.amount)}</b>
                <button onClick={() => del(x.id)} className="p-1.5 text-slate-400 hover:text-rose-600"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Stats() {
  const [preset, setPreset] = useState('30');
  const [custom, setCustom] = useState(null);
  const [tab, setTab] = useState('analytics');
  const money = useMoney();
  const range = useMemo(() => {
    if (custom) return custom;
    const [a, b] = PRESETS.find((p) => p[0] === preset)[2]();
    return { from: iso(a), to: iso(b) };
  }, [preset, custom]);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Статистика" subtitle={`Период: ${new Date(range.from).toLocaleDateString('ru-RU')} — ${new Date(range.to).toLocaleDateString('ru-RU')}`} />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="flex max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {PRESETS.map(([k, l]) => <button key={k} onClick={() => { setPreset(k); setCustom(null); }} className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap ${!custom && preset === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{l}</button>)}
        </div>
        <div className="flex items-center gap-1 text-sm">
          <input type="date" className="input w-auto py-1.5" value={range.from} onChange={(e) => setCustom({ ...range, from: e.target.value })} />
          <span className="text-slate-400">—</span>
          <input type="date" className="input w-auto py-1.5" value={range.to} onChange={(e) => setCustom({ ...range, to: e.target.value })} />
        </div>
      </div>
      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {[['analytics', 'Сквозная аналитика', BarChart3], ['abc', 'ABC-анализ', Percent], ['expenses', 'Расходы', Megaphone]].map(([k, l, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium ${tab === k ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}><Icon size={16} /> {l}</button>
        ))}
      </div>
      {tab === 'analytics' && <Analytics range={range} money={money} />}
      {tab === 'abc' && <Abc range={range} money={money} />}
      {tab === 'expenses' && <Expenses range={range} money={money} />}
    </div>
  );
}
