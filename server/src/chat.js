// Общие функции чата: загрузка изображений, добавление сообщений
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const prisma = require('./db');
const { UPLOAD_DIR } = require('./paths');

const CHAT_DIR = path.join(UPLOAD_DIR, 'chat');
fs.mkdirSync(CHAT_DIR, { recursive: true });
const IMG = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/heic': '.heic' };
const AUDIO = { 'audio/webm': '.webm', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/aac': '.aac', 'audio/mpeg': '.mp3', 'audio/wav': '.wav' };
const mime = (f) => String(f.mimetype || '').split(';')[0].trim();
const extOf = (f) => (f.fieldname === 'audio' ? AUDIO : IMG)[mime(f)];

// Фото — только растровые (без SVG: в нём может быть скрипт), голосовые — аудио до 60 с. До 10 МБ, имя файла случайное
const upload = multer({
  storage: multer.diskStorage({ destination: CHAT_DIR, filename: (req, f, cb) => cb(null, crypto.randomBytes(16).toString('hex') + extOf(f)) }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, f, cb) => cb(null, Boolean(extOf(f))),
}).fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }]);

/** Из загруженных файлов: { image, audio, duration } */
function attachments(req) {
  const img = req.files?.image?.[0], aud = req.files?.audio?.[0];
  return {
    image: img ? '/uploads/chat/' + img.filename : null,
    audio: aud ? '/uploads/chat/' + aud.filename : null,
    duration: aud ? Math.max(1, Math.min(60, Math.round(Number(req.body.duration) || 1))) : null,
  };
}

async function addMessage(conversationId, { sender, text, image, audio, duration, userId }) {
  const t = String(text || '').trim().slice(0, 4000) || null;
  if (!t && !image && !audio) throw Object.assign(new Error('Пустое сообщение'), { status: 400 });
  const msg = await prisma.chatMessage.create({ data: { conversationId, sender, text: t, image, audio, duration, userId } });
  await prisma.conversation.update({ where: { id: conversationId }, data: {
    lastMessageAt: new Date(), lastText: t || (audio ? `🎤 Голосовое, ${duration} с` : '📷 Фото'), status: 'open',
    ...(sender === 'customer' ? { unreadAdmin: { increment: 1 } } : { unreadCustomer: { increment: 1 } }),
  } });
  return msg;
}

// Антиспам: после сообщения покупателя пауза 10 с; если писать подряд (интервал < 30 с) — 15 с.
// Считается по базе, поэтому работает и при нескольких процессах сервера.
async function cooldownLeft(conversationId) {
  const last = await prisma.chatMessage.findMany({ where: { conversationId, sender: 'customer' }, orderBy: { id: 'desc' }, take: 2, select: { createdAt: true } });
  if (!last.length) return 0;
  const pause = last[1] && last[0].createdAt - last[1].createdAt < 30e3 ? 15e3 : 10e3;
  return Math.max(0, Math.ceil((last[0].createdAt.getTime() + pause - Date.now()) / 1000));
}
async function nextCooldown(conversationId) {
  const last = await prisma.chatMessage.findMany({ where: { conversationId, sender: 'customer' }, orderBy: { id: 'desc' }, take: 2, select: { createdAt: true } });
  return last[1] && last[0].createdAt - last[1].createdAt < 30e3 ? 15 : 10;
}

module.exports = { upload, addMessage, attachments, cooldownLeft, nextCooldown };
