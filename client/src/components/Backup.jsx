import { useEffect, useState } from 'react';
import { HardDriveDownload, Database, Images } from 'lucide-react';
import { api, fileUrl } from '../api';
import { Button, useToast } from '../ui';

const size = (b) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} ГБ` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`);

/** Настройки → резервная копия: база данных (.sql.gz) и фото/файлы (.tar.gz) — скачать к себе на компьютер */
export default function Backup() {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState('');
  const toast = useToast();
  useEffect(() => { api('/admin/backup').then(setInfo).catch(() => {}); }, []);
  const get = async (kind) => {
    setBusy(kind);
    try {
      const { url } = await api('/admin/backup/link', { method: 'POST', body: { kind } });
      // браузер скачивает файл сам, потоком — подходит и для больших архивов
      const a = document.createElement('a'); a.href = fileUrl(url); a.download = ''; document.body.appendChild(a); a.click(); a.remove();
      toast('Скачивание началось — файл появится в папке «Загрузки»');
    } catch (e) { toast(e.message, 'error'); } finally { setTimeout(() => setBusy(''), 1500); }
  };
  return (
    <div className="card p-6">
      <h2 className="mb-1 flex items-center gap-2 font-semibold"><HardDriveDownload size={18} className="text-indigo-600" />Резервная копия</h2>
      <p className="mb-4 text-sm text-slate-500">Скачайте копию к себе на компьютер — например, раз в неделю и перед переездом на другой сервер. Как восстановить — в docs/DEPLOY.md.</p>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" icon={Database} loading={busy === 'db'} onClick={() => get('db')}>База данных{info ? ` · ~${size(info.dbSize)}` : ''}</Button>
        <Button variant="secondary" icon={Images} loading={busy === 'uploads'} onClick={() => get('uploads')}>Фото и файлы{info ? ` · ${info.files} шт, ${size(info.filesSize)}` : ''}</Button>
      </div>
      <p className="mt-3 text-xs text-slate-400">В копии базы есть пароли и ключи (Т-Банк, SMS, боты) — храните файл в надёжном месте и никому не пересылайте.</p>
    </div>
  );
}
