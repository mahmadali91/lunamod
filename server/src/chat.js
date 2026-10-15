// Общие функции чата: загрузка изображений, добавление сообщений
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const prisma = require('./db');
const { UPLOAD_DIR } = require('./paths');

const CHAT_DIR = path.join(UPLOAD_DIR, 'chat');
fs.mkdirSync(CHAT_DIR, { recursive: true });
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/heic': '.heic' };

// Только растровые изображения (без SVG — в нём может быть скрипт), до 10 МБ, имя файла случайное
const upload = multer({
  storage: multer.diskStorage({ destination: CHAT_DIR, filename: (req, f, cb) => cb(null, crypto.randomBytes(16).toString('hex') + (EXT[f.mimetype] || '.jpg')) }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, f, cb) => cb(null, Boolean(EXT[f.mimetype])),
});

async function addMessage(conversationId, { sender, text, image, userId }) {
  const t = String(text || '').trim().slice(0, 4000) || null;
  if (!t && !image) throw Object.assign(new Error('Пустое сообщение'), { status: 400 });
  const msg = await prisma.chatMessage.create({ data: { conversationId, sender, text: t, image, userId } });
  await prisma.conversation.update({ where: { id: conversationId }, data: {
    lastMessageAt: new Date(), lastText: t || '📷 Фото', status: 'open',
    ...(sender === 'customer' ? { unreadAdmin: { increment: 1 } } : { unreadCustomer: { increment: 1 } }),
  } });
  return msg;
}

module.exports = { upload, addMessage };
