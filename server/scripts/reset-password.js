// Сброс пароля пользователя (по умолчанию admin). Печатает новый пароль.
//   node scripts/reset-password.js [логин]
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../src/db');

(async () => {
  const login = process.argv[2] || 'admin';
  const password = crypto.randomBytes(6).toString('base64url');
  const hash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { login },
    update: { password: hash },
    create: { login, name: 'Администратор', role: 'admin', password: hash },
  });
  console.log(`Новый пароль для ${login}: ${password}`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
