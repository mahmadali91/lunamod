import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Play, Pause, Trash2, Send } from 'lucide-react';

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
 * Запись голосового: нажали микрофон → идёт запись (до 60 с) → «стоп» → прослушать/удалить/отправить.
 * onSend(blob, seconds) — отправка; disabled — например, во время паузы антиспама.
 */
export function VoiceRecorder({ onSend, disabled, onError, className = '' }) {
  const [state, setState] = useState('idle'); // idle | rec | ready
  const [sec, setSec] = useState(0);
  const [blob, setBlob] = useState(null);
  const [url, setUrl] = useState(null);
  const rec = useRef(null);
  const started = useRef(0);
  const timer = useRef(null);

  useEffect(() => () => { clearInterval(timer.current); rec.current?.stream?.getTracks().forEach((t) => t.stop()); }, []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = pickType();
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timer.current);
        const b = new Blob(chunks, { type: (r.mimeType || type || 'audio/webm').split(';')[0] });
        const s = Math.max(1, Math.round((Date.now() - started.current) / 1000));
        if (b.size < 500 || s < 1) { setState('idle'); return; }
        setSec(Math.min(s, MAX_VOICE)); setBlob(b); setUrl(URL.createObjectURL(b)); setState('ready');
      };
      rec.current = r; r.stream = stream;
      started.current = Date.now(); setSec(0); setState('rec');
      r.start(250);
      timer.current = setInterval(() => {
        const s = (Date.now() - started.current) / 1000;
        setSec(Math.floor(s));
        if (s >= MAX_VOICE) r.state === 'recording' && r.stop();
      }, 250);
    } catch (e) {
      onError?.(e.name === 'NotAllowedError' ? 'Разрешите доступ к микрофону в настройках браузера' : 'Микрофон недоступен');
    }
  };
  const stop = () => rec.current?.state === 'recording' && rec.current.stop();
  const reset = () => { setBlob(null); setUrl(null); setState('idle'); setSec(0); };
  const send = async () => { if (await onSend(blob, sec) !== false) reset(); };

  if (!voiceSupported()) return null;
  if (state === 'idle') {
    return (
      <button type="button" onClick={start} disabled={disabled} title="Голосовое сообщение (до 60 с)" aria-label="Записать голосовое" className={`rounded-full p-2.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40 ${className}`}>
        <Mic size={20} />
      </button>
    );
  }
  return (
    <div className="absolute inset-0 z-10 flex items-center gap-2 bg-white px-2">
      {state === 'rec' ? (
        <>
          <span className="relative ml-1 flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" /><span className="relative inline-flex h-3 w-3 rounded-full bg-rose-500" /></span>
          <span className="flex-1 text-sm tabular-nums">Запись… {fmt(sec)} <span className="text-slate-400">/ {fmt(MAX_VOICE)}</span></span>
          <button type="button" onClick={stop} className="flex items-center gap-1.5 rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white" aria-label="Остановить запись"><Square size={14} fill="currentColor" /> Стоп</button>
        </>
      ) : (
        <>
          <button type="button" onClick={reset} className="rounded-full p-2.5 text-slate-500 hover:bg-slate-100" aria-label="Удалить запись"><Trash2 size={18} /></button>
          <div className="flex-1 rounded-2xl bg-slate-100 px-3"><VoicePlayer src={url} duration={sec} /></div>
          <button type="button" onClick={send} disabled={disabled} className="rounded-full bg-slate-900 p-2.5 text-white disabled:opacity-40" aria-label="Отправить голосовое"><Send size={20} /></button>
        </>
      )}
    </div>
  );
}
