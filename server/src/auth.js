const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'change-me-please';

function sign(user) {
  return jwt.sign({ id: user.id, login: user.login, name: user.name, role: user.role }, SECRET, { expiresIn: '30d' });
}

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Требуется вход' });
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { res.status(401).json({ error: 'Сессия истекла, войдите снова' }); }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Недостаточно прав' });
  next();
}

module.exports = { sign, requireAuth, requireAdmin };
