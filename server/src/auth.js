const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'change-me-please';

function sign(user) {
  return jwt.sign({ id: user.id, login: user.login, name: user.name, role: user.role }, SECRET, { expiresIn: '30d' });
}

// удалённый сотрудник или сменённая роль действуют сразу (проверка по базе, кэш 30 секунд)
const alive = new Map();
async function currentUser(id) {
  const c = alive.get(id);
  if (c && c.at > Date.now() - 30e3) return c.user;
  const user = await require('./db').user.findUnique({ where: { id }, select: { id: true, role: true } }).catch(() => undefined);
  if (user !== undefined) alive.set(id, { user, at: Date.now() });
  return user;
}

async function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Требуется вход' });
  let p;
  try { p = jwt.verify(token, SECRET); } catch { return res.status(401).json({ error: 'Сессия истекла, войдите снова' }); }
  if (!p.id) return res.status(401).json({ error: 'Требуется вход' });
  const u = await currentUser(p.id);
  if (u === null) return res.status(401).json({ error: 'Пользователь удалён — войдите под другим' });
  req.user = u ? { ...p, role: u.role } : p; // база недоступна — пускаем по токену
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Недостаточно прав' });
  next();
}

module.exports = { sign, requireAuth, requireAdmin };
