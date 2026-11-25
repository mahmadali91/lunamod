import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, X, Loader2 } from 'lucide-react';

/** Кнопка камеры для полей поиска. Показывается, если браузер умеет работать с камерой. */
export function CameraButton({ onResult, className = '', title = 'Сканировать камерой' }) {
  const [open, setOpen] = useState(false);
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  return (
    <>
      <button type="button" title={title} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(true)}
        className={`flex items-center justify-center rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 ${className}`}>
        <Camera size={18} />
      </button>
      {open && <CameraScanner onClose={() => setOpen(false)} onResult={(code) => { setOpen(false); onResult(code); }} />}
    </>
  );
}

/** Полноэкранное окно: видео с задней камеры, распознавание штрихкодов (EAN-13, Code 128 и др.) и QR-кодов */
export default function CameraScanner({ onClose, onResult }) {
  const video = useRef(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let controls, done = false;
    (async () => {
      try {
        if (!window.isSecureContext) throw Object.assign(new Error(), { name: 'Insecure' });
        const { BrowserMultiFormatReader } = await import('@zxing/browser'); // загружается только при открытии камеры
        const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 120 });
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          video.current,
          (result) => {
            if (!result || done) return;
            done = true;
            navigator.vibrate?.(80);
            controls?.stop();
            onResult(result.getText().trim());
          },
        );
        if (done) controls.stop();
        setReady(true);
      } catch (e) {
        setError({
          NotAllowedError: 'Нет доступа к камере. Разрешите доступ в настройках браузера для этого сайта.',
          NotFoundError: 'Камера не найдена на этом устройстве.',
          NotReadableError: 'Камера занята другим приложением.',
          Insecure: 'Камера работает только на защищённом сайте (https://).',
        }[e?.name] || 'Не удалось запустить камеру.');
      }
    })();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => { done = true; controls?.stop(); window.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="no-print fixed inset-0 z-[90] flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <div className="flex items-center gap-2 font-medium"><Camera size={20} /> Наведите камеру на штрихкод или QR-код</div>
        <button onClick={onClose} className="rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Закрыть"><X size={22} /></button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={video} className="h-full w-full object-cover" muted playsInline />
        {!error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-48 w-[80%] max-w-md rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
              <div className="absolute inset-x-4 top-1/2 h-0.5 animate-pulse bg-rose-500" />
            </div>
          </div>
        )}
        {!ready && !error && <div className="absolute inset-0 flex items-center justify-center text-white"><Loader2 className="animate-spin" size={32} /></div>}
        {error && <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-white"><div><p className="mb-4">{error}</p><button onClick={onClose} className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-900">Закрыть</button></div></div>}
      </div>
    </div>,
    document.body,
  );
}
