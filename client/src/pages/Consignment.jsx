import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HandCoins, Plus, AlertTriangle, Users, Wallet } from 'lucide-react';
import { api, qs } from '../api';
import SaleDetails, { SaleStatus } from '../components/SaleDetails';
import { Button, Empty, PageHeader, Spinner, fmtDate, fmtNum, useLoad, useMoney } from '../ui';

function Stat({ icon: Icon, label, value, tone }) {
  const t = { amber: 'bg-amber-50 text-amber-600', red: 'bg-rose-50 text-rose-600', indigo: 'bg-indigo-50 text-indigo-600' }[tone];
  return (
    <div className="card flex items-center gap-4 p-5">
      <span className={`rounded-xl p-3 ${t}`}><Icon size={20} /></span>
      <div><div className="text-sm text-slate-500">{label}</div><div className="text-xl font-bold">{value}</div></div>
    </div>
  );
}

export default function Consignment() {
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [cp, setCp] = useState(null);
  const summary = useLoad('/sales/consignment/summary');
  const { data, reload } = useLoad('/sales' + qs({ consignment: 1, open: onlyOpen ? 1 : '', counterpartyId: cp }));
  const [view, setView] = useState(null);
  const navigate = useNavigate();
  const money = useMoney();
  const sm = summary.data;
  const refresh = () => { reload(); summary.reload(); };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Реализация" subtitle="Товар, отданный под реализацию (в долг): долги, оплаты и возвраты">
        <Button icon={Plus} onClick={() => navigate('/pos?consignment=1')}>Отдать под реализацию</Button>
      </PageHeader>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat icon={Wallet} tone="amber" label="Общий долг" value={sm ? money(sm.totalDebt) : '…'} />
        <Stat icon={HandCoins} tone="indigo" label="Открытых реализаций" value={sm ? fmtNum(sm.openCount) : '…'} />
        <Stat icon={AlertTriangle} tone="red" label="Просрочено" value={sm ? fmtNum(sm.overdue) : '…'} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card h-fit p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Users size={18} /> Должники</h2>
          {sm?.byCounterparty.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Долгов нет</p>}
          <div className="space-y-1">
            {cp && <button onClick={() => setCp(null)} className="mb-2 text-xs text-indigo-600 hover:underline">← Показать всех</button>}
            {sm?.byCounterparty.map((c) => (
              <button key={c.id} onClick={() => setCp(c.id || null)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-slate-50 ${cp === c.id ? 'bg-indigo-50' : ''}`}>
                <div className="min-w-0"><div className="truncate text-sm font-medium">{c.name}</div><div className="text-xs text-slate-500">реализаций: {c.count} · с {fmtDate(c.oldest, false)}{c.phone ? ' · ' + c.phone : ''}</div></div>
                <b className="shrink-0 text-rose-600">{money(c.debt)}</b>
              </button>
            ))}
          </div>
        </div>

        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <h2 className="font-semibold">Реализации</h2>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-sm">
              {[[true, 'С долгом'], [false, 'Все']].map(([v, l]) => (
                <button key={l} onClick={() => setOnlyOpen(v)} className={`rounded-md px-3 py-1 ${onlyOpen === v ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}>{l}</button>
              ))}
            </div>
          </div>
          {!data ? <Spinner /> : data.length === 0 ? (
            <Empty icon={HandCoins} title={onlyOpen ? 'Открытых долгов нет' : 'Реализаций пока нет'} text="Оформите продажу с отметкой «Под реализацию»" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className="th">Номер</th><th className="th">Контрагент</th><th className="th">Дата / срок</th><th className="th text-right">Сумма</th><th className="th text-right">Оплачено</th><th className="th text-right">Долг</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map((s) => (
                    <tr key={s.id} onClick={async () => setView(await api('/sales/' + s.id))} className="cursor-pointer hover:bg-slate-50/70">
                      <td className="td font-medium"><div>{s.number}</div><SaleStatus s={s} /></td>
                      <td className="td">{s.counterparty?.name || '—'}</td>
                      <td className="td text-slate-500">{fmtDate(s.date, false)}{s.dueDate && <div className={`text-xs ${new Date(s.dueDate) < new Date() && s.debt > 0 ? 'font-medium text-rose-600' : ''}`}>до {fmtDate(s.dueDate, false)}</div>}</td>
                      <td className="td text-right">{money(s.total)}</td>
                      <td className="td text-right text-emerald-700">{money(s.paidAmount)}</td>
                      <td className={`td text-right font-semibold ${s.debt > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{money(s.debt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {view && <SaleDetails sale={view} onClose={() => setView(null)} onChange={(s) => { setView(s); refresh(); }} />}
    </div>
  );
}
