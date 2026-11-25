// Загрузка фото профиля клиента (аватар): jpeg/png/webp, до 3 МБ, имя файла случайное
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { UPLOAD_DIR } = require('./paths');

const DIR = path.join(UPLOAD_DIR, 'avatars');
fs.mkdirSync(DIR, { recursive: true });

const TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const typeOf = (f) => TYPES[String(f.mimetype || '').split(';')[0].trim()];

const upload = multer({
  storage: multer.diskStorage({
    destination: DIR,
    filename: (req, f, cb) => {
      const ext = typeOf(f);
      if (!ext) return cb(Object.assign(new Error('Фото должно быть JPG, PNG или WEBP'), { status: 400 }));
      cb(null, crypto.randomBytes(16).toString('hex') + ext);
    },
  }),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (req, f, cb) => cb(null, Boolean(typeOf(f))),
}).single('avatar');

/** Путь нового фото или null */
function uploaded(req) {
  return req.file ? '/uploads/avatars/' + req.file.filename : null;
}

/** Удалить старый файл аватара (если это наш /uploads/avatars/...) */
function removeOld(avatarPath) {
  const p = String(avatarPath || '');
  if (!p.startsWith('/uploads/avatars/')) return;
  const file = path.join(UPLOAD_DIR, p.replace('/uploads/', ''));
  fs.unlink(file, () => {});
}

module.exports = { upload, uploaded, removeOld };
