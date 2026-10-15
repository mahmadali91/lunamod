import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { api } from '../api';
import { Button, useToast } from '../ui';
import { disablePush, enablePush, pushState } from '../push';

export default function PushToggle({ compact }) {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => { pushState().then(setSt).catch(() => setSt('unsupported')); }, []);
  if (!st) return null;
  const run = async (fn, msg) => { setBusy(true); try { await fn(); setSt(await pushState()); toast(msg); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); } };

  if (st === 'on') return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700"><BellRing size={16} /> Уведомления включены на этом устройстве</span>
      {!compact && <Button size="sm" variant="secondary" loading={busy} onClick={() => run(() => api('/push/test', { method: 'POST' }), 'Тестовое уведомление отправлено')}>Проверить</Button>}
      {!compact && <Button size="sm" variant="ghost" icon={BellOff} loading={busy} onClick={() => run(disablePush, 'Уведомления выключены')}>Выключить</Button>}
    </div>
  );
  if (st === 'ios-install') return <p className="text-sm text-amber-700">На iPhone уведомления работают, если добавить админку на экран «Домой»: Поделиться → «На экран Домой», затем открыть оттуда.</p>;
  if (st === 'unsupported') return <p className="text-sm text-slate-500">Этот браузер не поддерживает пуш-уведомления. Используйте Telegram (настройки магазина).</p>;
  if (st === 'denied') return <p className="text-sm text-rose-600">Уведомления запрещены в настройках браузера для этого сайта — разрешите их и обновите страницу.</p>;
  return <Button size="sm" icon={Bell} loading={busy} onClick={() => run(enablePush, 'Уведомления включены')}>Включить уведомления на этом устройстве</Button>;
}
