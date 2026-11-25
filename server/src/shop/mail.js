// Минимальный SMTP-клиент без внешних зависимостей (net/tls):
// поддерживает неявный TLS (465), STARTTLS (587) и AUTH LOGIN/PLAIN.
// Используется для кодов входа по email и уведомлений клиентам.
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');

const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
const enc = (s) => '=?UTF-8?B?' + b64(s) + '?=';
// Тема и имя отправителя — в UTF-8 (RFC 2047), тело — base64 (RFC 2045)
function buildMessage({ from, fromName, to, subject, text }) {
  const head = [
    'From: ' + (fromName ? enc(fromName) + ' <' + from + '>' : from),
    'To: ' + to,
    'Subject: ' + enc(subject || ''),
    'Date: ' + new Date().toUTCString(),
    'Message-ID: <' + crypto.randomBytes(12).toString('hex') + '@' + String(from).split('@')[1] + '>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(String(text || '')).replace(/(.{1,76})/g, '$1\r\n'),
    '',
  ];
  return head.join('\r\n');
}

/** Одна SMTP-команда: ждём код ответа (все строки, пока не «NNN ») */
function command(socket, line, timeout = 15000) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => { cleanup(); reject(new Error('SMTP: нет ответа')); }, timeout);
    const onData = (chunk) => {
      buf += chunk.toString('utf8');
      // ответ сервера: последняя строка вида «250 текст» (с пробелом, не «250-»)
      const lines = buf.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (!/^\d{3} /.test(last)) return;
      cleanup();
      resolve({ code: Number(last.slice(0, 3)), text: buf });
    };
    const onErr = (e) => { cleanup(); reject(e); };
    function cleanup() { clearTimeout(timer); socket.removeListener('data', onData); socket.removeListener('error', onErr); }
    socket.on('data', onData);
    socket.on('error', onErr);
    if (line !== null) socket.write(line + '\r\n');
  });
}

function expect(res, codes, what) {
  if (!codes.includes(res.code)) {
    const msg = String(res.text).split(/\r?\n/).filter(Boolean).pop() || '';
    throw new Error(`SMTP (${what}): ${msg || 'ошибка ' + res.code}`);
  }
  return res;
}

/** Проверка/отправка письма. Возвращает { ok: true } или бросает понятную ошибку. */
async function sendMail(s, { to, subject, text }) {
  const host = String(s.smtpHost || '').trim();
  const port = Number(s.smtpPort) || 465;
  const secure = String(s.smtpSecure ?? '1') !== '0';
  const user = String(s.smtpUser || '').trim();
  const pass = String(s.smtpPass || '');
  const from = String(s.smtpFrom || user || '').trim();
  if (!host) throw Object.assign(new Error('Не настроена почта (SMTP-сервер)'), { status: 400 });
  if (!from) throw Object.assign(new Error('Не указан адрес отправителя'), { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to || ''))) throw Object.assign(new Error('Неверный адрес получателя'), { status: 400 });

  let socket;
  if (secure) {
    socket = tls.connect({ host, port, servername: host, timeout: 15000 });
  } else {
    socket = net.connect({ host, port, timeout: 15000 });
  }
  await new Promise((resolve, reject) => {
    const ev = secure ? 'secureConnect' : 'connect';
    const onOk = () => { socket.removeListener('error', onFail); resolve(); };
    const onFail = (e) => { socket.removeListener(ev, onOk); reject(e); };
    socket.once(ev, onOk);
    socket.once('error', onFail);
  });

  try {
    expect(await command(socket, null), [220], 'приветствие');
    const hello = await command(socket, 'EHLO ' + (host || 'localhost'));
    expect(hello, [250], 'EHLO');
    if (!secure && /STARTTLS/i.test(hello.text)) {
      expect(await command(socket, 'STARTTLS'), [220], 'STARTTLS');
      socket = tls.connect({ socket, servername: host, timeout: 15000 });
      await new Promise((resolve, reject) => {
        socket.once('secureConnect', resolve);
        socket.once('error', reject);
        setTimeout(() => reject(new Error('SMTP: TLS не установился')), 15000).unref?.();
      });
      expect(await command(socket, 'EHLO ' + (host || 'localhost')), [250], 'EHLO/TLS');
    }
    if (user) {
      // AUTH LOGIN надёжнее всего поддерживается на российских почтовиках
      const auth = await command(socket, 'AUTH LOGIN');
      if (auth.code === 334) {
        expect(await command(socket, b64(user)), [334], 'AUTH login');
        expect(await command(socket, b64(pass)), [235], 'AUTH пароль');
      } else if (auth.code === 503) {
        // сервер уже авторизован — пропускаем
      } else if (auth.code === 504 || auth.code === 500) {
        expect(await command(socket, 'AUTH PLAIN ' + b64('\0' + user + '\0' + pass)), [235], 'AUTH PLAIN');
      } else {
        expect(auth, [235, 334], 'AUTH');
      }
    }
    expect(await command(socket, 'MAIL FROM:<' + from + '>'), [250], 'MAIL FROM');
    expect(await command(socket, 'RCPT TO:<' + to + '>'), [250, 251], 'RCPT TO');
    expect(await command(socket, 'DATA'), [354], 'DATA');
    expect(await command(socket, buildMessage({ from, fromName: s.smtpFromName, to, subject, text }) + '.'), [250], 'отправка');
    await command(socket, 'QUIT').catch(() => {});
    return { ok: true };
  } finally {
    try { socket.destroy(); } catch { /* уже закрыт */ }
  }
}

module.exports = { sendMail };
