import { useEffect, useRef, useState } from 'react';
import { X, Phone, Loader2, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { shopApi, fmtPhone } from './api';
import { useShop } from './store';

// Маска +7 (900) 000-00-00
function maskPhone(v) {
  let d = v.replace(/\D/g, '');
  if (d[0] === '8') d = '7' + d.slice(1);
  if (d[0] !== '7') d = '7' + d;
  d = d.slice(0, 11);
  const p = d.slice(1);
  let out = '+7';
  if (p.length) out += ' (' + p.slice(0, 3);
  if (p.length >= 3) out += ') ' + p.slice(3, 6);
  if (p.length >= 6) out += '-' + p.slice(6, 8);
  if (p.length >= 8) out += '-' + p.slice(8, 10);
  return out;
}

export default function LoginModal() {
  const { loginOpen, setLoginOpen, auth, notify } = useShop();
  const [phone, setPhone] = useState('+7');
  const [step, setStep] = useState('phone');
  const [code, setCode] = useState('');
  const [testCode, setTestCode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);
  const [consent, setConsent] = useState(false);
  const codeRef = useRef(null);

  useEffect(() => { if (loginOpen) { setStep('phone'); setCode(''); setError(''); setTestCode(null); } }, [loginOpen]);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);
  useEffect(() => { if (step === 'code') codeRef.current?.focus(); }, [step]);
  if (!loginOpen) return null;

  const close = () => setLoginOpen(null);
  const request = async (e) => {
    e?.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await shopApi('/auth/request-code', { method: 'POST', body: { phone } });
      setTestCode(r.testCode || null); setStep('code'); setWait(60);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const verify = async (value = code) => {
    setBusy(true); setError('');
    try {
      const r = await shopApi('/auth/verify', { method: 'POST', body: { phone, code: value, consent } });
      auth.login(r.token, r.customer);
      notify('Вы вошли');
      const then = loginOpen.then;
      close();
      then?.();
    } catch (err) { setError(err.message); setCode(''); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center" onMouseDown={close}>
      <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold">{step === 'phone' ? 'Вход или регистрация' : 'Введите код'}</h2>
          <button onClick={close} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Закрыть"><X size={20} /></button>
        </div>
        {step === 'phone' ? (
          <form onSubmit={request} className="space-y-4">
            <p className="text-sm text-slate-500">Пришлём SMS с кодом. Аккаунт создаётся автоматически при первом входе.</p>
            <div className="relative">
              <Phone size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-slate-400" />
              <input autoFocus inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))}
                className="w-full rounded-2xl border border-slate-300 py-3.5 pr-4 pl-11 text-lg tracking-wide outline-none focus:border-slate-900" />
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <label className="flex items-start gap-2.5 text-sm text-slate-600">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-slate-900" />
              <span>Даю <Link to="/legal/consent" target="_blank" className="underline">согласие на обработку персональных данных</Link> и принимаю <Link to="/legal/privacy" target="_blank" className="underline">политику конфиденциальности</Link></span>
            </label>
            <button disabled={busy || !consent || phone.replace(/\D/g, '').length !== 11} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 font-semibold text-white disabled:opacity-40">
              {busy && <Loader2 size={18} className="animate-spin" />} Получить код
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Код отправлен на {fmtPhone(phone.replace(/\D/g, ''))} <button onClick={() => setStep('phone')} className="text-slate-900 underline">изменить</button></p>
            {testCode && <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><ShieldCheck size={16} /> Тестовый режим, SMS не отправляется. Код: <b className="text-base tracking-widest">{testCode}</b></div>}
            <input ref={codeRef} inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={code}
              onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); setCode(v); if (v.length === 4) verify(v); }}
              className="w-full rounded-2xl border border-slate-300 py-3.5 text-center text-3xl font-semibold tracking-[0.6em] outline-none focus:border-slate-900" placeholder="····" />
            {error && <p className="text-sm text-rose-600">{error}</p>}
            {busy && <div className="flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>}
            <button disabled={wait > 0 || busy} onClick={request} className="w-full text-sm text-slate-500 disabled:opacity-60">{wait > 0 ? `Отправить код повторно через ${wait} с` : 'Отправить код ещё раз'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
