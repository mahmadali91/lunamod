// Генератор иллюстраций одежды (SVG) для демо-товаров.
// Каждая вещь — силуэт нужного типа в цвете товара на мягком фоне.

const mirror = (pts) => pts.map(([x, y]) => [400 - x, y]);
const poly = (pts) => 'M' + pts.map((p) => p.join(',')).join(' L') + ' Z';

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c * k)));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}
const light = (hex) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) > 200; };

/* ---------- Верх ---------- */
function top(o, c) {
  const { sleeve = 'short', neck = 'crew', hem = 285, open = false, pocket = false, ribs = false, belt = false } = o;
  const s = [];
  const body = `M175,95 Q200,${neck === 'v' || neck === 'lapel' ? 100 : 112} 225,95 L270,112 L265,170 L${o.flare ? 285 : 262},${hem} L${o.flare ? 115 : 138},${hem} L135,170 L130,112 Z`;
  const sl = {
    short: [[130, 112], [92, 150], [113, 168], [137, 148]],
    long: [[130, 112], [97, 178], [90, 268], [111, 271], [120, 192], [137, 158]],
    cap: [[130, 112], [110, 132], [126, 146], [136, 135]],
  }[sleeve];
  if (neck === 'hood') s.push(`<path d="M163,102 Q156,48 200,44 Q244,48 237,102 Z" fill="${shade(c, 0.85)}" stroke="${shade(c, 0.6)}" stroke-width="2"/>`);
  if (sl) {
    s.push(`<path d="${poly(sl)}" fill="${shade(c, 0.92)}" stroke="${shade(c, 0.6)}" stroke-width="2" stroke-linejoin="round"/>`);
    s.push(`<path d="${poly(mirror(sl))}" fill="${shade(c, 0.92)}" stroke="${shade(c, 0.6)}" stroke-width="2" stroke-linejoin="round"/>`);
    if (sleeve === 'long' && ribs) s.push(`<path d="M91,258 L111,261 M309,258 L289,261" stroke="${shade(c, 0.6)}" stroke-width="3"/>`);
  }
  s.push(`<path d="${body}" fill="${c}" stroke="${shade(c, 0.6)}" stroke-width="2" stroke-linejoin="round"/>`);
  if (ribs) s.push(`<path d="M139,${hem - 12} L261,${hem - 12}" stroke="${shade(c, 0.7)}" stroke-width="2"/>`);
  const d = shade(c, 0.55);
  if (neck === 'crew') s.push(`<path d="M175,95 Q200,112 225,95" fill="none" stroke="${d}" stroke-width="4"/>`);
  if (neck === 'v') s.push(`<path d="M176,96 L200,140 L224,96" fill="${shade(c, 0.75)}" stroke="${d}" stroke-width="2"/>`);
  if (neck === 'turtle') s.push(`<rect x="176" y="70" width="48" height="32" rx="6" fill="${shade(c, 0.9)}" stroke="${d}" stroke-width="2"/><path d="M182,78 L182,98 M192,76 L192,100 M202,76 L202,100 M212,76 L212,100" stroke="${shade(c, 0.75)}" stroke-width="1.5"/>`);
  if (neck === 'collar') {
    s.push(`<path d="M174,94 L200,120 L186,128 L164,104 Z" fill="${shade(c, 1.08)}" stroke="${d}" stroke-width="2"/><path d="M226,94 L200,120 L214,128 L236,104 Z" fill="${shade(c, 1.08)}" stroke="${d}" stroke-width="2"/>`);
    if (!o.polo) s.push(`<path d="M200,120 L200,${hem}" stroke="${d}" stroke-width="1.5"/>` + [150, 185, 220, 255].filter((y) => y < hem - 10).map((y) => `<circle cx="207" cy="${y}" r="3" fill="${d}"/>`).join(''));
    else s.push(`<path d="M200,120 L200,160" stroke="${d}" stroke-width="1.5"/><circle cx="206" cy="135" r="2.5" fill="${d}"/><circle cx="206" cy="152" r="2.5" fill="${d}"/>`);
  }
  if (neck === 'hood') s.push(`<path d="M175,96 Q200,128 225,96" fill="${shade(c, 0.7)}" stroke="${d}" stroke-width="2"/><path d="M190,112 L188,150 M210,112 L212,150" stroke="#f1f5f9" stroke-width="2.5" stroke-linecap="round"/>`);
  if (neck === 'lapel') {
    s.push(`<path d="M177,96 L200,195 L223,96 Z" fill="#f8fafc" stroke="${d}" stroke-width="1.5"/>`);
    if (o.tie) s.push(`<path d="M196,104 L204,104 L208,165 L200,178 L192,165 Z" fill="${o.tie}"/>`);
    s.push(`<path d="M177,96 L163,120 L182,128 L172,140 L200,195 Z" fill="${shade(c, 0.88)}" stroke="${d}" stroke-width="2"/><path d="M223,96 L237,120 L218,128 L228,140 L200,195 Z" fill="${shade(c, 0.88)}" stroke="${d}" stroke-width="2"/>`);
    s.push(`<circle cx="200" cy="215" r="3.5" fill="${d}"/><circle cx="200" cy="240" r="3.5" fill="${d}"/><path d="M150,230 L178,230 M222,230 L250,230" stroke="${d}" stroke-width="2"/>`);
  }
  if (open) s.push(`<path d="M200,${neck === 'v' ? 140 : 108} L200,${hem}" stroke="${d}" stroke-width="2"/>` + [165, 195, 225, 255].filter((y) => y < hem - 8).map((y) => `<circle cx="206" cy="${y}" r="3.5" fill="${d}"/>`).join(''));
  if (pocket) s.push(`<path d="M160,225 L240,225 L252,268 L148,268 Z" fill="${shade(c, 0.9)}" stroke="${d}" stroke-width="2"/>`);
  if (belt) s.push(`<rect x="134" y="205" width="132" height="13" fill="${shade(c, 0.8)}" stroke="${d}" stroke-width="1.5"/><path d="M200,218 L190,262 M200,218 L212,258" stroke="${shade(c, 0.8)}" stroke-width="7" stroke-linecap="round"/>`);
  return s.join('');
}

/* ---------- Низ ---------- */
function pants(o, c) {
  const { y = 95, hem = 335, out = 128, inn = 186, flare = 0, short = false, cargo = false, denim = false, crease = false, tight = false } = o;
  const wy = y + 18, crotch = y + (short ? 70 : 85);
  const leg = [[140, wy], [200, wy], [200, crotch], [inn + (flare ? -flare / 2 : 0), hem], [out - flare, hem]];
  const d = shade(c, 0.6);
  const s = [];
  s.push(`<path d="${poly(leg)}" fill="${c}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/>`);
  s.push(`<path d="${poly(mirror(leg))}" fill="${c}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/>`);
  if (!tight) s.push(`<rect x="138" y="${y}" width="124" height="20" rx="2" fill="${shade(c, 0.88)}" stroke="${d}" stroke-width="2"/>`);
  else s.push(`<rect x="139" y="${y + 4}" width="122" height="14" rx="6" fill="${shade(c, 0.8)}"/>`);
  if (!tight) s.push(`<path d="M200,${wy} L200,${wy + 45}" stroke="${d}" stroke-width="2"/>`);
  if (denim) s.push(`<path d="M150,${wy + 4} Q165,${wy + 30} 185,${wy + 6} M250,${wy + 4} Q235,${wy + 30} 215,${wy + 6}" fill="none" stroke="#d97706" stroke-width="2" stroke-dasharray="4 3"/><path d="M${out - flare + 4},${hem - 6} L${inn - 4},${hem - 6} M${400 - out + flare - 4},${hem - 6} L${400 - inn + 4},${hem - 6}" stroke="#d97706" stroke-width="2" stroke-dasharray="4 3"/>`);
  if (cargo) s.push(`<rect x="${out - 2}" y="${crotch + 15}" width="30" height="38" rx="3" fill="${shade(c, 0.88)}" stroke="${d}" stroke-width="2"/><rect x="${400 - out - 28}" y="${crotch + 15}" width="30" height="38" rx="3" fill="${shade(c, 0.88)}" stroke="${d}" stroke-width="2"/>`);
  if (crease) s.push(`<path d="M${(170 + (out + inn) / 2) / 2},${wy + 10} L${(out + inn) / 2},${hem - 4} M${400 - (170 + (out + inn) / 2) / 2},${wy + 10} L${400 - (out + inn) / 2},${hem - 4}" stroke="${shade(c, 0.75)}" stroke-width="1.5"/>`);
  if (!tight) s.push(`<path d="M150,${y} L150,${y + 20} M250,${y} L250,${y + 20} M176,${y} L176,${y + 20} M224,${y} L224,${y + 20}" stroke="${d}" stroke-width="1.5"/>`);
  return s.join('');
}

function skirt(o, c) {
  const { y = 100, hem = 300, shape = 'a' } = o;
  const w = { a: 70, pencil: 4, pleat: 55, flare: 95, maxi: 60 }[shape];
  const d = shade(c, 0.6);
  const s = [`<path d="M140,${y + 16} L260,${y + 16} L${260 + w},${hem} L${140 - w},${hem} Z" fill="${c}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/>`];
  s.push(`<rect x="138" y="${y}" width="124" height="18" rx="2" fill="${shade(c, 0.85)}" stroke="${d}" stroke-width="2"/>`);
  if (shape === 'pleat') for (let i = 1; i < 8; i++) { const t = i / 8; s.push(`<path d="M${140 + 120 * t},${y + 18} L${140 - w + (120 + 2 * w) * t},${hem}" stroke="${shade(c, 0.75)}" stroke-width="1.5"/>`); }
  if (shape === 'pencil') s.push(`<path d="M200,${hem} L200,${hem - 40}" stroke="${d}" stroke-width="2"/>`);
  if (shape === 'flare' || shape === 'maxi') s.push(`<path d="M${170},${y + 30} Q${150},${(y + hem) / 2} ${125},${hem - 5} M${230},${y + 30} Q${250},${(y + hem) / 2} ${275},${hem - 5}" fill="none" stroke="${shade(c, 0.8)}" stroke-width="1.5"/>`);
  return s.join('');
}

function dress(o, c) {
  const { hem = 340, strap = true, sleeve = null, fit = false, slip = false } = o;
  const d = shade(c, 0.6);
  const w = fit ? 6 : slip ? 30 : 75;
  const s = [];
  if (sleeve) s.push(top({ sleeve, neck: 'v', hem: 200 }, c));
  else {
    if (strap) {
      s.push(`<path d="M168,72 L172,112 M232,72 L228,112" stroke="${d}" stroke-width="4" stroke-linecap="round"/>`);
      s.push(`<path d="M160,110 Q200,${slip ? 135 : 125} 240,110 L246,190 L154,190 Z" fill="${c}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/>`);
    } else {
      // без бретелей — платье с широкими плечами (футляр)
      s.push(`<path d="M172,92 Q200,112 228,92 L258,104 L250,190 L150,190 L142,104 Z" fill="${c}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/>`);
      s.push(`<path d="M172,92 Q200,112 228,92" fill="none" stroke="${d}" stroke-width="4"/>`);
    }
  }
  s.push(`<path d="M150,188 L250,188 L${250 + w},${hem} L${150 - w},${hem} Z" fill="${c}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/>`);
  if (!fit) s.push(`<path d="M150,190 Q200,202 250,190" fill="none" stroke="${d}" stroke-width="3"/><path d="M175,205 Q160,${hem - 60} 140,${hem - 4} M225,205 Q240,${hem - 60} 260,${hem - 4}" fill="none" stroke="${shade(c, 0.82)}" stroke-width="1.5"/>`);
  if (slip) s.push(`<path d="M${150 - w + 6},${hem - 10} Q200,${hem - 2} ${250 + w - 6},${hem - 10}" fill="none" stroke="${shade(c, 1.15)}" stroke-width="3" stroke-dasharray="2 4"/>`);
  return s.join('');
}

function bodysuit(o, c) {
  const d = shade(c, 0.6);
  return top({ sleeve: o.sleeve || 'none', neck: o.neck || 'crew', hem: 240 }, c).replace(/<path d="M139,228[^>]*>/, '') +
    `<path d="M138,238 L262,238 L262,262 Q230,262 212,300 L188,300 Q170,262 138,262 Z" fill="${c}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/>`;
}

function jumpsuit(o, c) {
  const d = shade(c, 0.6);
  return pants({ y: 190, hem: 355, out: 132, inn: 188, flare: o.flare || 0 }, c) +
    `<path d="M150,190 L156,108 L244,108 L250,190 Z" fill="${c}" stroke="${d}" stroke-width="2"/>` +
    `<path d="M160,110 L150,62 M240,110 L250,62" stroke="${d}" stroke-width="7" stroke-linecap="round"/>` +
    `<rect x="178" y="128" width="44" height="36" rx="4" fill="${shade(c, 0.88)}" stroke="${d}" stroke-width="2"/>`;
}

// Комплект из двух вещей (костюмы, пижамы)
const scaled = (svg, tx, ty, k) => `<g transform="translate(${tx},${ty}) scale(${k})">${svg}</g>`;

const BUILDERS = {
  pants: (o, c) => pants(o, c),
  skirt: (o, c) => skirt(o, c),
  dress: (o, c) => dress(o, c),
  top: (o, c) => top(o, c),
  body: (o, c) => bodysuit(o, c),
  jumpsuit: (o, c) => jumpsuit(o, c),
  set: (o, c) => scaled(top(o.top, c), -20, 20, 0.62) + scaled(pants(o.pants || {}, o.pantsColor || c), 135, 70, 0.66),
};

/**
 * @param {object} spec  { kind, ...параметры силуэта, pattern?: 'dots'|'stripes' }
 * @param {string} color hex
 */
function garmentSvg(spec, color, bg) {
  const tint = bg || (light(color) ? '#e2e8f0' : shade(color, 1.0));
  const id = Math.random().toString(36).slice(2, 8);
  let art = BUILDERS[spec.kind](spec, color);
  let defs = `<radialGradient id="b${id}" cx="50%" cy="40%" r="75%"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="${tint}" stop-opacity="0.35"/></radialGradient>`;
  if (spec.pattern) {
    const p = spec.pattern === 'dots'
      ? `<pattern id="p${id}" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="2.4" fill="#ffffff" fill-opacity="0.75"/></pattern>`
      : `<pattern id="p${id}" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="6" height="14" fill="#ffffff" fill-opacity="0.35"/></pattern>`;
    defs += p;
    art += `<g style="mix-blend-mode:normal" clip-path="url(#c${id})"></g>`;
    art = art.replace(new RegExp(`fill="${color}"`, 'g'), `fill="${color}"`) + art.replace(/<(path|rect)([^>]*?)fill="[^"]*"/g, `<$1$2fill="url(#p${id})"`).replace(/stroke="[^"]*"/g, 'stroke="none"');
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="600" height="600"><defs>${defs}</defs>` +
    `<rect width="400" height="400" fill="url(#b${id})"/><rect width="400" height="400" fill="${tint}" fill-opacity="0.12"/>` +
    `<ellipse cx="200" cy="372" rx="120" ry="10" fill="#0f172a" fill-opacity="0.08"/>${art}</svg>`;
}

module.exports = { garmentSvg };
