import { useEffect, useRef, useState } from 'react';
import { Mic, Play, Pause, Trash2, Send } from 'lucide-react';

export const MAX_VOICE = 60; // секунд
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const voiceSupported = () => typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

function pickType() {
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) if (MediaRecorder.isTypeSupported?.(t)) return t;
  return '';
}

/** Плеер голосового сообщения */
export function VoicePlayer({ src, duration, dark }) {
  const a = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const total = duration || 0;
  const toggle = () => { const el = a.current; if (!el) return; if (el.paused) { document.querySelectorAll('audio[data-voice]').forEach((x) => x !== el && x.pause()); el.play(); } else el.pause(); };
  return (
    <div className="flex min-w-[180px] items-center gap-2 py-0.5">
      <audio ref={a} data-voice src={src} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setPos(0); }} onTimeUpdate={(e) => setPos(e.target.currentTime)} />
      <button type="button" onClick={toggle} aria-label={playing ? 'Пауза' : 'Прослушать'} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${dark ? 'bg-white/20 text-white' : 'bg-indigo-600 text-white'}`}>
        {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>
      <div className="flex-1">
        <div className={`h-1.5 overflow-hidden rounded-full ${dark ? 'bg-white/25' : 'bg-slate-200'}`}>
          <div className={`h-full rounded-full ${dark ? 'bg-white' : 'bg-indigo-600'}`} style={{ width: total ? `${Math.min(100, (pos / total) * 100)}%` : '0%' }} />
        </div>
      </div>
      <span className="text-xs tabular-nums opacity-70">{fmt(playing || pos ? pos : total)}</span>
    </div>
  );
}

/**
 * Голосовое «как в мессенджерах»: нажмите и удерживайте микрофон — идёт запись (до 60 с),
 * отпустите — запись можно прослушать, удалить или отправить. Смахните влево во время записи — отмена.
 * В первый раз браузер спросит разрешение на микрофон. onSend(blob, seconds) → false, если не отправилось.
 */
export function VoiceRecorder({ onSend, disabled, onError, className = '' }) {
  const [state, setState] = useState('idle'); // idle | wait | rec | ready
  const [sec, setSec] = useState(0);
  const [level, setLevel] = useState(0);
  const [cancelHint, setCancelHint] = useState(false);
  const [blob, setBlob] = useState(null);
  const [url, setUrl] = useState(null);
  const [heard, setHeard] = useState(true);
  const s = useRef({}); // текущая запись: stream, rec, ctx, timer, raf, holding, x0, cancel, started, peak

  const cleanup = () => {
    const c = s.current;
    clearInterval(c.timer); cancelAnimationFrame(c.raf);
    c.stream?.getTracks().forEach((t) => t.stop());
    c.ctx?.close().catch(() => {});
    window.removeEventListener('pointerup', c.up); window.removeEventListener('pointercancel', c.up); window.removeEventListener('pointermove', c.move);
    s.current = { holding: false };
  };
  useEffect(() => cleanup, []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const finish = (cancel) => {
    const c = s.current;
    if (!c.rec) { c.holding = false; return; }
    c.cancel = cancel;
    if (c.rec.state === 'recording') { try { c.rec.requestData(); } catch { /* старые браузеры */ } c.rec.stop(); }
  };

  const down = async (e) => {
    if (disabled || state !== 'idle' || (e.button !== undefined && e.button !== 0)) return;
    e.preventDefault();
    const c = { holding: true, x0: e.clientX, peak: 0 };
    s.current = c;
    c.up = () => { c.holding = false; finish(c.cancelNow); };
    c.move = (ev) => { const away = c.x0 - ev.clientX > 80; c.cancelNow = away; setCancelHint(away); };
    window.addEventListener('pointerup', c.up); window.addEventListener('pointercancel', c.up); window.addEventListener('pointermove', c.move);
    setState('wait'); setCancelHint(false);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (err) {
      cleanup(); setState('idle');
      onError?.(err.name === 'NotAllowedError' ? 'Разрешите доступ к микрофону: значок замка в адресной строке → Микрофон → Разрешить' : 'Микрофон недоступен или занят другим приложением');
      return;
    }
    c.stream = stream;
    if (!c.holding) { // первое нажатие ушло на окно разрешения
      cleanup(); setState('idle');
      onError?.('Микрофон разрешён. Теперь нажмите и удерживайте кнопку, пока говорите');
      return;
    }
    // индикатор громкости — видно, что голос действительно записывается
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const an = ctx.createAnalyser(); an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128));
        const l = Math.min(1, m / 50); c.peak = Math.max(c.peak, l); setLevel(l);
        c.raf = requestAnimationFrame(tick);
      };
      c.ctx = ctx; tick();
    } catch { /* без индикатора */ }
    const type = pickType();
    const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    r.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
    r.onstop = () => {
      const secs = (Date.now() - c.started) / 1000;
      const peak = c.peak, cancel = c.cancel;
      const b = new Blob(chunks, { type: (r.mimeType || type || 'audio/webm').split(';')[0] });
      cleanup(); setLevel(0); setCancelHint(false);
      if (cancel) { setState('idle'); return; }
      if (secs < 0.8 || b.size < 300) { setState('idle'); onError?.('Удерживайте кнопку микрофона, пока говорите'); return; }
      setHeard(peak > 0.04);
      setSec(Math.min(MAX_VOICE, Math.max(1, Math.round(secs)))); setBlob(b); setUrl(URL.createObjectURL(b)); setState('ready');
    };
    c.rec = r; c.started = Date.now();
    r.start();
    setSec(0); setState('rec');
    c.timer = setInterval(() => { const t = (Date.now() - c.started) / 1000; setSec(Math.floor(t)); if (t >= MAX_VOICE) finish(false); }, 200);
  };

  const reset = () => { setBlob(null); setUrl(null); setState('idle'); setSec(0); };
  const send = async () => { if (await onSend(blob, sec) !== false) reset(); };

  if (!voiceSupported()) return null;
  return (
    <>
      {(state === 'rec' || state === 'wait') && (
        <div className="absolute inset-y-0 left-0 right-12 z-10 flex items-center gap-3 rounded-2xl bg-white px-3 select-none">
          <span className="relative flex h-3 w-3 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" /><span className="relative inline-flex h-3 w-3 rounded-full bg-rose-500" /></span>
          <span className="text-sm tabular-nums">{fmt(sec)}</span>
          <div className="flex h-6 flex-1 items-center gap-0.5" aria-hidden="true">
            {Array.from({ length: 16 }, (_, i) => <span key={i} className="w-1 rounded-full bg-rose-400 transition-all" style={{ height: `${Math.max(12, Math.min(100, level * 100 * (0.5 + ((i * 7) % 5) / 8)))}%` }} />)}
          </div>
          <span className={`text-xs ${cancelHint ? 'font-semibold text-rose-600' : 'text-slate-400'}`}>{state === 'wait' ? 'Включаю микрофон…' : cancelHint ? 'Отпустите — отмена' : '← смахните для отмены'}</span>
        </div>
      )}
      {state === 'ready' && (
        <div className="absolute inset-0 z-20 flex items-center gap-2 bg-white px-1">
          <button type="button" onClick={reset} className="rounded-full p-2.5 text-slate-500 hover:bg-slate-100" aria-label="Удалить запись"><Trash2 size={18} /></button>
          <div className="min-w-0 flex-1">
            <div className="rounded-2xl bg-slate-100 px-3"><VoicePlayer src={url} duration={sec} /></div>
            {!heard && <div className="mt-0.5 px-1 text-[11px] text-amber-600">Звук почти не слышен — проверьте микрофон и прослушайте перед отправкой</div>}
          </div>
          <button type="button" onClick={send} disabled={disabled} className="rounded-full bg-slate-900 p-2.5 text-white disabled:opacity-40" aria-label="Отправить голосовое"><Send size={20} /></button>
        </div>
      )}
      <button type="button" onPointerDown={down} onContextMenu={(e) => e.preventDefault()} disabled={disabled}
        title="Нажмите и удерживайте, чтобы записать голосовое (до 60 с)" aria-label="Удерживайте, чтобы записать голосовое"
        style={{ touchAction: 'none', WebkitTouchCallout: 'none' }}
        className={`relative z-10 shrink-0 select-none rounded-full p-2.5 transition disabled:opacity-40 ${state === 'rec' ? 'scale-125 bg-rose-500 text-white' : 'text-slate-500 hover:bg-slate-100'} ${className}`}>
        <Mic size={20} />
      </button>
    </>
  );
}
