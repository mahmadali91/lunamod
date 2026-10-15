import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { shopApi } from '../api';
import { useShop } from '../store';

// Простая разметка: «## » — заголовок, пустая строка — абзац
function Text({ text }) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('## ')) return <h2 key={i} className="mt-8 mb-2 text-lg font-semibold">{line.slice(3)}</h2>;
    if (!line.trim()) return <div key={i} className="h-2" />;
    return <p key={i} className="mb-2 leading-relaxed text-slate-700">{line}</p>;
  });
}

export default function Legal() {
  const { doc } = useParams();
  const { config } = useShop();
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); shopApi('/legal/' + doc).then((r) => { setD(r); document.title = r.title; }).catch(() => setD(false)); }, [doc]);
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8">
      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        {config.legal.map((l) => <Link key={l.id} to={`/legal/${l.id}`} className={`rounded-full px-3 py-1 ${l.id === doc ? 'bg-slate-900 text-white' : 'bg-slate-100 hover:bg-slate-200'}`}>{l.title}</Link>)}
        <Link to="/legal/requisites" className={`rounded-full px-3 py-1 ${doc === 'requisites' ? 'bg-slate-900 text-white' : 'bg-slate-100 hover:bg-slate-200'}`}>Реквизиты</Link>
      </div>
      {doc === 'requisites' ? (
        <>
          <h1 className="text-3xl font-bold tracking-tight">Реквизиты продавца</h1>
          <dl className="mt-6 divide-y divide-slate-100 border-y border-slate-100">
            {[['Продавец', config.seller.name], ['ИНН', config.seller.inn], ['ОГРН / ОГРНИП', config.seller.ogrn], ['Адрес', config.seller.address], ['Email', config.seller.email], ['Телефон', config.seller.phone]].filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-3"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
            ))}
          </dl>
        </>
      ) : d === null ? <div className="text-slate-400">Загрузка…</div> : d === false ? <div>Документ не найден</div> : (
        <>
          <h1 className="text-3xl font-bold tracking-tight">{d.title}</h1>
          <div className="mt-4"><Text text={d.text} /></div>
        </>
      )}
    </div>
  );
}
