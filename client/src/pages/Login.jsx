import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Boxes } from 'lucide-react';
import { api } from '../api';
import { Button, Field } from '../ui';

export default function Login() {
  const [form, setForm] = useState({ login: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const r = await api('/auth/login', { method: 'POST', body: form });
      localStorage.setItem('token', r.token);
      localStorage.setItem('user', JSON.stringify(r.user));
      navigate('/');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-8 shadow-xl shadow-indigo-500/5">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30"><Boxes size={28} /></div>
          <h1 className="text-xl font-bold">Вход в систему</h1>
          <p className="mt-1 text-sm text-slate-500">Учёт товаров и продаж</p>
        </div>
        <div className="space-y-4">
          <Field label="Логин"><input className="input" autoFocus value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} /></Field>
          <Field label="Пароль"><input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <Button type="submit" loading={loading} className="w-full py-2.5">Войти</Button>
        </div>
      </form>
    </div>
  );
}
