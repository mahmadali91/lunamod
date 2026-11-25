import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Search, Clock, ArrowLeft, ArrowRight, ExternalLink, Lightbulb, PlayCircle, X, ChevronDown, Rocket, Package, Warehouse, ShoppingCart, Globe, ShieldCheck, BookOpen, HelpCircle } from 'lucide-react';
import { GROUPS, ARTICLES } from '../kb/articles';
import VideoPlayer from '../components/VideoPlayer';

const ICONS = { Rocket, Package, Warehouse, ShoppingCart, Globe, ShieldCheck };
const byId = Object.fromEntries(ARTICLES.map((a) => [a.id, a]));
const img = (name) => `/kb/${name}.webp`;

/** **жирный** и переносы строк */
function Rich({ text, className = '' }) {
  return (
    <div className={className}>
      {String(text).split('\n').map((line, i) => (
        <p key={i} className={i ? 'mt-2' : ''}>{line.split(/(\*\*[^*]+\*\*)/g).map((p, k) => (p.startsWith('**') ? <b key={k} className="font-semibold text-slate-900">{p.slice(2, -2)}</b> : p))}</p>
      ))}
    </div>
  );
}

const plain = (a) => [a.title, a.summary, ...(a.steps || []).flatMap((s) => [s.t, s.d]), ...(a.tips || []), ...(a.faq || []).flat()].join(' ').replace(/\*\*/g, '').toLowerCase();

/** Список статей: группы, поиск по тексту */
function ArticleList({ q, current, onPick }) {
  const found = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return words.length ? ARTICLES.filter((a) => words.every((w) => plain(a).includes(w))) : null;
  }, [q]);
  if (found) {
    return (
      <div className="space-y-1">
        <div className="px-2 pb-1 text-xs text-slate-500">Найдено: {found.length}</div>
        {found.map((a) => <Item key={a.id} a={a} active={a.id === current} onPick={onPick} />)}
        {!found.length && <p className="px-2 py-6 text-center text-sm text-slate-500">Ничего не нашлось. Попробуйте другое слово, например «скидка», «возврат», «размер».</p>}
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {GROUPS.map((g) => {
        const Icon = ICONS[g.icon] || BookOpen;
        return (
          <div key={g.id}>
            <div className="mb-1.5 flex items-center gap-2 px-2 text-xs font-semibold tracking-wide text-slate-500 uppercase"><Icon size={14} />{g.title}</div>
            <div className="space-y-0.5">{ARTICLES.filter((a) => a.group === g.id).map((a) => <Item key={a.id} a={a} active={a.id === current} onPick={onPick} />)}</div>
          </div>
        );
      })}
    </div>
  );
}

function Item({ a, active, onPick }) {
  return (
    <button onClick={() => onPick(a.id)} className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${active ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-700 hover:bg-slate-100'}`}>
      <span className="flex-1">{a.title}</span>
      {a.video && <PlayCircle size={15} className="mt-0.5 shrink-0 text-slate-400" title="Есть видео" />}
    </button>
  );
}

/** Скриншот: нажатие — во весь экран */
function Shot({ name, alt }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!open) return undefined; const k = (e) => e.key === 'Escape' && setOpen(false); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mt-3 block w-full cursor-zoom-in overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm transition hover:shadow-md" title="Открыть крупнее">
        <img src={img(name)} alt={alt} loading="lazy" className="w-full" />
      </button>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/90 p-2 sm:p-6" onClick={() => setOpen(false)} role="dialog" aria-label={alt}>
          <img src={img(name)} alt={alt} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
          <button className="absolute top-3 right-3 rounded-full bg-white/15 p-2 text-white hover:bg-white/25" aria-label="Закрыть"><X /></button>
        </div>
      )}
    </>
  );
}

function Article({ a }) {
  const navigate = useNavigate();
  const all = ARTICLES;
  const i = all.indexOf(a);
  const prev = all[i - 1], next = all[i + 1];
  const group = GROUPS.find((g) => g.id === a.group);
  return (
    <article className="min-w-0">
      <div className="text-xs font-medium tracking-wide text-indigo-600 uppercase">{group?.title}</div>
      <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{a.title}</h1>
      <p className="mt-2 text-slate-600">{a.summary}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-600"><Clock size={14} /> {a.time} мин</span>
        {a.steps && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{a.steps.length} {a.steps.length === 1 ? 'шаг' : a.steps.length < 5 ? 'шага' : 'шагов'}</span>}
        {a.route && a.id !== 'faq' && <button onClick={() => navigate(a.route)} className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-3 py-1 font-medium text-white hover:bg-indigo-700"><ExternalLink size={14} /> Открыть раздел</button>}
      </div>

      {a.video && (
        <div className="mt-6">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><PlayCircle size={18} className="text-indigo-600" /> Видеообзор</div>
          <VideoPlayer src={a.video.startsWith('/') ? a.video : '/' + a.video} autoPlay={false} className="aspect-video w-full overflow-hidden rounded-xl border border-slate-200" />
        </div>
      )}

      {a.steps && (
        <ol className="mt-8 space-y-10">
          {a.steps.map((s, k) => (
            <li key={k} className="relative">
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">{k + 1}</span>
                <div className="min-w-0 flex-1">
                  <h2 className="pt-1 text-lg font-semibold">{s.t}</h2>
                  <Rich text={s.d} className="mt-1.5 leading-relaxed text-slate-700" />
                  {s.tip && <div className="mt-2 flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><Lightbulb size={16} className="mt-0.5 shrink-0" /><Rich text={s.tip} /></div>}
                </div>
              </div>
              {s.img && <div className="sm:pl-11"><Shot name={s.img} alt={s.t} /></div>}
            </li>
          ))}
        </ol>
      )}

      {a.faq && (
        <div className="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {a.faq.map(([q, ans]) => (
            <details key={q} className="group p-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center gap-3 font-medium"><HelpCircle size={18} className="shrink-0 text-indigo-600" /><span className="flex-1">{q}</span><ChevronDown size={18} className="shrink-0 text-slate-400 transition group-open:rotate-180" /></summary>
              <Rich text={ans} className="mt-2 pl-8 text-sm leading-relaxed text-slate-700" />
            </details>
          ))}
        </div>
      )}

      {a.tips?.length > 0 && (
        <div className="mt-10 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 flex items-center gap-2 font-semibold text-amber-900"><Lightbulb size={18} /> Полезно знать</div>
          <ul className="space-y-2 text-sm text-amber-900">{a.tips.map((t, k) => <li key={k} className="flex gap-2"><span>•</span><Rich text={t} /></li>)}</ul>
        </div>
      )}

      {a.related?.length > 0 && (
        <div className="mt-8">
          <div className="mb-2 text-sm font-semibold text-slate-500">Читайте также</div>
          <div className="flex flex-wrap gap-2">{a.related.map((id) => byId[id] && <Link key={id} to={'/help/' + id} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm hover:border-indigo-400 hover:text-indigo-700">{byId[id].title}</Link>)}</div>
        </div>
      )}

      <div className="mt-12 grid grid-cols-2 gap-3 border-t border-slate-200 pt-6">
        {prev ? <Link to={'/help/' + prev.id} className="group rounded-xl border border-slate-200 bg-white p-3 text-sm hover:border-indigo-400"><div className="flex items-center gap-1 text-slate-500"><ArrowLeft size={14} /> Назад</div><div className="mt-0.5 font-medium group-hover:text-indigo-700">{prev.title}</div></Link> : <span />}
        {next && <Link to={'/help/' + next.id} className="group rounded-xl border border-slate-200 bg-white p-3 text-right text-sm hover:border-indigo-400"><div className="flex items-center justify-end gap-1 text-slate-500">Далее <ArrowRight size={14} /></div><div className="mt-0.5 font-medium group-hover:text-indigo-700">{next.title}</div></Link>}
      </div>
    </article>
  );
}

/** Справочники → База знаний: пошаговые инструкции со скриншотами и видео */
export default function Help() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const a = id ? byId[id] : null;
  useEffect(() => { document.querySelector('main')?.scrollTo(0, 0); }, [id]);
  const pick = (x) => { setQ(''); navigate('/help/' + x); };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><BookOpen className="text-indigo-600" /> База знаний</h1>
          <p className="text-sm text-slate-500">Пошаговые инструкции со скриншотами: на картинках нужные кнопки обведены и пронумерованы, как в тексте.</p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Поиск: «скидка», «возврат», «ценник»…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className={`card self-start p-3 lg:sticky lg:top-0 ${a && !q ? 'hidden lg:block' : ''}`}>
          <ArticleList q={q} current={a?.id} onPick={pick} />
        </aside>
        <div className={`card min-w-0 p-5 sm:p-8 ${!a || q ? 'hidden lg:block' : ''}`}>
          {a ? (
            <>
              <button onClick={() => navigate('/help')} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600 lg:hidden"><ArrowLeft size={16} /> Все статьи</button>
              <Article a={a} />
            </>
          ) : (
            <Welcome onPick={pick} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Главная базы знаний: с чего начать */
function Welcome({ onPick }) {
  const path = ['first-steps', 'setup', 'add-product', 'receipt', 'sale', 'orders'];
  return (
    <div>
      <h2 className="text-xl font-bold">Добро пожаловать!</h2>
      <p className="mt-1 text-slate-600">Если вы только начинаете — пройдите эти статьи по порядку. Каждая занимает 3–5 минут.</p>
      <ol className="mt-5 space-y-2">
        {path.map((id, k) => (
          <li key={id}>
            <button onClick={() => onPick(id)} className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-indigo-400">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-bold text-indigo-700">{k + 1}</span>
              <span className="flex-1"><span className="block font-medium group-hover:text-indigo-700">{byId[id].title}</span><span className="block text-sm text-slate-500">{byId[id].summary}</span></span>
              {byId[id].video && <PlayCircle size={18} className="shrink-0 text-indigo-500" />}
              <ArrowRight size={18} className="shrink-0 text-slate-300 group-hover:text-indigo-600" />
            </button>
          </li>
        ))}
      </ol>
      <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
        <b className="text-slate-800">Подсказка:</b> в любом разделе программы нажмите <b className="text-slate-800">«Справка»</b> вверху справа — откроется инструкция именно к этому разделу.
      </div>
    </div>
  );
}
