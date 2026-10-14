import { useEffect, useState } from 'react';
import { Trash2, UserPlus, Save } from 'lucide-react';
import { api } from '../api';
import { Badge, Button, Field, PageHeader, useLoad, useSettings, useToast } from '../ui';

export default function SettingsPage() {
  const settings = useSettings();
  const toast = useToast();
  const me = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = me.role === 'admin';
  const [s, setS] = useState({ storeName: '', currency: '' });
  const [pw, setPw] = useState({ oldPassword: '', newPassword: '' });
  const [nu, setNu] = useState({ login: '', name: '', password: '', role: 'seller' });
  const users = useLoad(isAdmin ? '/users' : null);
  const cats = useLoad('/categories');

  useEffect(() => { setS({ storeName: settings.storeName, currency: settings.currency }); }, [settings.storeName, settings.currency]);

  const run = (fn, msg) => async (e) => { e?.preventDefault(); try { await fn(); toast(msg); } catch (err) { toast(err.message, 'error'); } };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Настройки" />
      {isAdmin && (
        <form className="card space-y-4 p-6" onSubmit={run(async () => { await api('/settings', { method: 'PUT', body: s }); settings.reloadSettings(); }, 'Настройки сохранены')}>
          <h2 className="font-semibold">Магазин</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Название (на ценниках)" className="sm:col-span-2"><input className="input" value={s.storeName} onChange={(e) => setS({ ...s, storeName: e.target.value })} /></Field>
            <Field label="Валюта">
              <input className="input" list="currencies" value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value })} />
              <datalist id="currencies">{['₽', '₸', 'сум', 'сом', '$', '€', '₴', 'BYN'].map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
          </div>
          <Button type="submit" icon={Save}>Сохранить</Button>
        </form>
      )}

      <div className="card p-6">
        <h2 className="mb-4 font-semibold">Категории товаров</h2>
        <div className="flex flex-wrap gap-2">
          {(cats.data || []).map((c) => (
            <span key={c.id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pr-1 pl-3 text-sm">
              {c.name} <span className="text-xs text-slate-400">{c._count.products}</span>
              <button onClick={run(async () => { await api('/categories/' + c.id, { method: 'DELETE' }); cats.reload(); }, 'Категория удалена')} className="rounded-full p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={12} /></button>
            </span>
          ))}
          {cats.data?.length === 0 && <span className="text-sm text-slate-500">Категории создаются в карточке товара</span>}
        </div>
      </div>

      {isAdmin && (
        <div className="card p-6">
          <h2 className="mb-4 font-semibold">Пользователи</h2>
          <div className="mb-4 divide-y divide-slate-100">
            {(users.data || []).map((u) => (
              <div key={u.id} className="flex items-center gap-3 py-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold">{u.name[0]}</div>
                <div className="flex-1"><div className="text-sm font-medium">{u.name}</div><div className="text-xs text-slate-500">{u.login}</div></div>
                <Badge color={u.role === 'admin' ? 'indigo' : 'slate'}>{u.role === 'admin' ? 'Админ' : 'Продавец'}</Badge>
                {u.id !== me.id && <button onClick={run(async () => { if (!confirm('Удалить пользователя?')) throw new Error('Отменено'); await api('/users/' + u.id, { method: 'DELETE' }); users.reload(); }, 'Пользователь удалён')} className="p-1.5 text-slate-400 hover:text-rose-600"><Trash2 size={16} /></button>}
              </div>
            ))}
          </div>
          <form className="grid grid-cols-2 gap-3 sm:grid-cols-5" onSubmit={run(async () => { await api('/users', { method: 'POST', body: nu }); setNu({ login: '', name: '', password: '', role: 'seller' }); users.reload(); }, 'Пользователь добавлен')}>
            <input className="input" placeholder="Логин" value={nu.login} onChange={(e) => setNu({ ...nu, login: e.target.value })} required />
            <input className="input" placeholder="Имя" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} />
            <input className="input" placeholder="Пароль" type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} required minLength={6} />
            <select className="input" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}><option value="seller">Продавец</option><option value="admin">Админ</option></select>
            <Button type="submit" icon={UserPlus}>Добавить</Button>
          </form>
        </div>
      )}

      <form className="card space-y-4 p-6" onSubmit={run(async () => { await api('/auth/password', { method: 'POST', body: pw }); setPw({ oldPassword: '', newPassword: '' }); }, 'Пароль изменён')}>
        <h2 className="font-semibold">Сменить пароль</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Текущий пароль"><input className="input" type="password" value={pw.oldPassword} onChange={(e) => setPw({ ...pw, oldPassword: e.target.value })} required /></Field>
          <Field label="Новый пароль"><input className="input" type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required minLength={6} /></Field>
        </div>
        <Button type="submit" variant="secondary">Сменить пароль</Button>
      </form>
    </div>
  );
}
