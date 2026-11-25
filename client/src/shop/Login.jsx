import { useEffect, useRef, useState } from 'react';
import { X, Mail, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { shopApi } from './api';
import { useShop } from './store';
import { solveCaptcha } from '../captcha';

export default function LoginModal() {
  const { loginOpen, setLoginOpen, auth, notify } = useShop();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState('input'); // input | code
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);
  const [consent, setConsent] = useState(false);
  const codeRef = useRef(null);

  useEffect(() => {
    if (loginOpen) { setStep('input'); setCode(''); setError(''); setConsent(false); }
  }, [loginOpen]);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);
  useEffect(() => { if (step === 'code') codeRef.current?.focus(); }, [step]);
  if (!loginOpen) return null;

  const close = () => setLoginOpen(null);
  const normEmail = email.trim().toLowerCase();

  const request = async (e) => {
    e?.preventDefault();
    setBusy(true); setError('');
    try {
      const captcha = await solveCaptcha();
      await shopApi('/auth/email/request-code', { method: 'POST', body: { email: normEmail, captcha } });
      setStep('code'); setWait(60);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const verify = async (value = code) => {
    setBusy(true); setError('');
    try {
      const r = await shopApi('/auth/email/verify', { method: 'POST', body: { email: normEmail, code: value, consent } });
      auth.login(r.token, r.customer);
      notify('Вы вошли');
      const then = loginOpen.then;
      close();
      then?.();
    } catch (err) { setError(err.message); setCode(''); } finally { setBusy(false); }
  };

  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normEmail);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center" onMouseDown={close}>
      <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold">{step === 'input' ? 'Вход или регистрация' : 'Введите код'}</h2>
          <button onClick={close} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Закрыть"><X size={20} /></button>
        </div>

        {step === 'input' ? (
          <form onSubmit={request} className="space-y-4">
            <p className="text-sm text-slate-500">Пришлём код на email. Если аккаунта с таким email нет — он создастся автоматически, телефон укажете при оформлении заказа.</p>
            <div className="relative">
              <Mail size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-slate-400" />
              <input autoFocus type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.ru"
                className="w-full rounded-2xl border border-slate-300 py-3.5 pr-4 pl-11 text-lg outline-none focus:border-slate-900" />
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <label className="flex items-start gap-2.5 text-sm text-slate-600">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-slate-900" />
              <span>Даю <Link to="/legal/consent" target="_blank" className="underline">согласие на обработку персональных данных</Link> и принимаю <Link to="/legal/privacy" target="_blank" className="underline">политику конфиденциальности</Link></span>
            </label>
            <button disabled={busy || !consent || !validEmail}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 font-semibold text-white disabled:opacity-40">
              {busy && <Loader2 size={18} className="animate-spin" />} {busy ? 'Проверяем и отправляем…' : 'Получить код'}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Код отправлен на {normEmail}{' '}
              <button onClick={() => { setStep('input'); setError(''); }} className="text-slate-900 underline">изменить</button>
            </p>
            <input ref={codeRef} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
              onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(v); if (v.length === 6) verify(v); }}
              className="w-full rounded-2xl border border-slate-300 py-3.5 text-center text-3xl font-semibold tracking-[0.35em] outline-none focus:border-slate-900" placeholder="······" />
            {error && <p className="text-sm text-rose-600">{error}</p>}
            {busy && <div className="flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>}
            <button disabled={wait > 0 || busy} onClick={request} className="w-full text-sm text-slate-500 disabled:opacity-60">{wait > 0 ? `Отправить код повторно через ${wait} с` : 'Отправить код ещё раз'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
