import { useEffect, useRef, useState } from 'react';
import { Loader2, RotateCcw, VideoOff } from 'lucide-react';

export const isHls = (src) => /\.m3u8($|\?)/i.test(src || '');

/**
 * Видео товара для магазина и админки.
 * - обычный файл (MP4/WebM) — встроенный плеер браузера;
 * - поток HLS (.m3u8, видео с Wildberries): Safari/iPhone играет сам, остальные — через hls.js;
 * - пока грузится — индикатор, при ошибке — понятное сообщение и «Повторить».
 */
export default function VideoPlayer({ src, className = '', autoPlay = true, controls = true }) {
  const ref = useRef(null);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || !src) return undefined;
    setState('loading');
    let hls, dead = false;
    const fail = () => !dead && setState('error');
    if (!isHls(src)) { el.src = src; el.load(); return () => { dead = true; }; }
    if (el.canPlayType('application/vnd.apple.mpegurl')) { el.src = src; el.load(); return () => { dead = true; }; } // Safari, iPhone
    import('hls.js').then(({ default: Hls }) => {
      if (dead) return;
      if (!Hls.isSupported()) { el.src = src; return; }
      hls = new Hls({ maxBufferLength: 12, maxMaxBufferLength: 30, enableWorker: true });
      let mediaRetry = 0;
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (!d.fatal) return;
        if (d.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetry++ < 2) hls.recoverMediaError();
        else fail();
      });
      hls.loadSource(src);
      hls.attachMedia(el);
    }).catch(fail);
    return () => { dead = true; hls?.destroy(); };
  }, [src, attempt]);

  return (
    <div className={`relative bg-black ${className}`}>
      <video
        ref={ref}
        controls={controls}
        playsInline
        muted
        loop
        autoPlay={autoPlay}
        preload="metadata"
        onLoadedMetadata={() => setState('ready')}
        onLoadedData={() => setState('ready')}
        onCanPlay={() => setState('ready')}
        onError={() => setState('error')}
        className="h-full w-full object-contain"
      />
      {state === 'loading' && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><Loader2 className="animate-spin text-white/80" size={36} /></div>}
      {state === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-sm text-white/90">
          <VideoOff size={32} />
          <div>Не удалось воспроизвести видео.<br /><span className="text-white/60">Проверьте интернет или попробуйте другой браузер.</span></div>
          <button type="button" onClick={() => setAttempt((a) => a + 1)} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 font-medium hover:bg-white/25"><RotateCcw size={16} /> Повторить</button>
        </div>
      )}
    </div>
  );
}

/**
 * Проверка перед загрузкой: сможет ли браузер показать этот файл.
 * Видео с iPhone в формате HEVC часто не играет в Chrome и на Android — такое лучше пересохранить в MP4 (H.264).
 */
export function canPlayFile(file, timeout = 8000) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    let done = false;
    const end = (ok) => { if (done) return; done = true; URL.revokeObjectURL(url); v.removeAttribute('src'); resolve(ok); };
    v.muted = true; v.preload = 'auto';
    v.onloadeddata = () => end(v.videoWidth > 0);
    v.onerror = () => end(false);
    setTimeout(() => end(null), timeout); // не дождались — не мешаем загрузке
    v.src = url;
  });
}
