import { useEffect, useMemo } from 'react';
import qrcode from 'qrcode-generator';
import { Smartphone, QrCode } from 'lucide-react';

/** Оплата через СБП: QR-код (с компьютера) и кнопка «Открыть приложение банка» (на телефоне). Статус обновляется сам. */
export default function SbpPay({ order, money, onCheck, onTestPay, test }) {
  const svg = useMemo(() => {
    const q = qrcode(0, 'M'); q.addData(order.paymentUrl || ''); q.make();
    return q.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
  }, [order.paymentUrl]);
  useEffect(() => { const t = setInterval(onCheck, 4000); return () => clearInterval(t); }, [onCheck]);
  const mobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent);
  return (
    <div className="mb-6 rounded-3xl border border-slate-200 p-6 text-center">
      <div className="flex items-center justify-center gap-2 text-lg font-bold"><QrCode size={22} /> Оплата через СБП · {money(order.total)}</div>
      {mobile && !test && <a href={order.paymentUrl} className="mx-auto mt-4 flex max-w-xs items-center justify-center gap-2 rounded-full bg-slate-900 py-3.5 font-semibold text-white"><Smartphone size={18} /> Открыть приложение банка</a>}
      <div className="mx-auto mt-4 w-56 rounded-2xl bg-white p-2 [&_svg]:h-auto [&_svg]:w-full" aria-label="QR-код для оплаты через СБП" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="mt-3 text-sm text-slate-500">{mobile ? 'Или отсканируйте QR-код с другого телефона.' : 'Отсканируйте QR-код камерой телефона или в приложении вашего банка.'} После оплаты страница обновится сама.</p>
      {test && <button onClick={onTestPay} className="mt-4 rounded-full bg-amber-500 px-6 py-3 font-semibold text-white">Оплатить (тест, без банка)</button>}
    </div>
  );
}
