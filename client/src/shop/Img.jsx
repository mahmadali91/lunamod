import { useState } from 'react';
import { ImageOff } from 'lucide-react';

/** Фото товара: если файла нет или он не загрузился — аккуратная заглушка вместо «битой» картинки */
export default function Img({ src, alt = '', className = '', icon = 20 }) {
  const [bad, setBad] = useState(null);
  if (!src || bad === src) return <div className={`flex h-full w-full items-center justify-center text-slate-300 ${className}`}><ImageOff size={icon} /></div>;
  return <img src={src} alt={alt} loading="lazy" onError={() => setBad(src)} className={`h-full w-full object-cover ${className}`} />;
}
