#!/bin/bash
# Установка / обновление на виртуальном хостинге Beget.
# Запускать в Docker-окружении хостинга (после `ssh localhost -p 222`):
#   curl -fsSL https://raw.githubusercontent.com/mahmadali91/sklad/main/deploy/beget.sh | bash
# Повторный запуск = обновление до последней версии из GitHub (данные и фото сохраняются).
set -euo pipefail

DOMAIN="${DOMAIN:-botmi.ru}"
REPO="${REPO:-https://github.com/mahmadali91/sklad}"
BRANCH="${BRANCH:-main}"
SITE="$HOME/$DOMAIN"
APP="$SITE/app"
NODE_DIR="$SITE/.node"          # Node.js внутри папки сайта — веб-сервер имеет к ней доступ
UPLOADS="$SITE/uploads"         # фото товаров, вне кода
ENV_FILE="$SITE/sklad.env"      # настройки и пароли, вне кода

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mОШИБКА: %s\033[0m\n' "$*"; exit 1; }
ask()  { local v; read -r -p "$1" v </dev/tty; printf '%s' "$v"; }
asks() { local v; read -r -s -p "$1" v </dev/tty; echo >/dev/tty; printf '%s' "$v"; }

[ -d "$SITE" ] || fail "Нет папки сайта $SITE. Создайте сайт $DOMAIN в разделе «Сайты» панели Beget и привяжите к нему домен."

step "1/7 Node.js"
. /etc/os-release || true
echo "ОС: ${PRETTY_NAME:-неизвестно}"
NODE_OK=0
if [ -x "$NODE_DIR/bin/node" ]; then
  "$NODE_DIR/bin/node" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>18||(a==18&&b>=18)?0:1)' && NODE_OK=1 || true
fi
if [ "$NODE_OK" != 1 ]; then
  if [ "${VERSION_ID:-}" = "18.04" ]; then
    URL="https://cp.beget.com/shared/bmcys1znnpqt7-csnFitRYB00n0Lnhrm/node-v20.20.2-bionic.tar.xz"
  else
    URL="https://nodejs.org/download/release/v22.12.0/node-v22.12.0-linux-x64.tar.xz"
  fi
  echo "Скачиваю $URL"
  rm -rf "$NODE_DIR" && mkdir -p "$NODE_DIR"
  curl -fSL "$URL" -o /tmp/node-$$.tar.xz
  tar xf /tmp/node-$$.tar.xz -C "$NODE_DIR" --strip-components 1
  rm -f /tmp/node-$$.tar.xz
fi
export PATH="$NODE_DIR/bin:$PATH"
echo "node $(node -v), npm $(npm -v)"

step "2/7 Код из GitHub"
if command -v git >/dev/null 2>&1; then
  if [ -d "$APP/.git" ]; then
    git -C "$APP" fetch --depth 1 origin "$BRANCH"
    git -C "$APP" reset --hard "origin/$BRANCH"
  else
    rm -rf "$APP"
    git clone --depth 1 -b "$BRANCH" "$REPO" "$APP"
  fi
else
  rm -rf "$APP.new" && mkdir -p "$APP.new"
  curl -fsSL "$REPO/archive/refs/heads/$BRANCH.tar.gz" | tar xz -C "$APP.new" --strip-components 1
  rm -rf "$APP" && mv "$APP.new" "$APP"
fi
echo "Версия: $(cat "$APP/VERSION" 2>/dev/null || git -C "$APP" log -1 --format=%h 2>/dev/null || echo '?')"

step "3/7 Настройки (.env)"
ADMIN_PASSWORD=""
if [ ! -f "$ENV_FILE" ]; then
  echo "Нужна база MySQL. Создайте её в панели Beget → «MySQL», если ещё нет."
  DB_NAME=$(ask "Имя базы данных (например, ${USER}_sklad): ")
  DB_USER=$(ask "Пользователь БД [Enter = $DB_NAME]: "); DB_USER=${DB_USER:-$DB_NAME}
  DB_PASS=$(asks "Пароль БД (не отображается): ")
  [ -n "$DB_NAME" ] && [ -n "$DB_PASS" ] || fail "Имя базы и пароль обязательны"
  ENC_PASS=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$DB_PASS")
  JWT=$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))')
  ADMIN_PASSWORD=$(node -e 'process.stdout.write(require("crypto").randomBytes(6).toString("base64url"))')
  umask 077
  cat > "$ENV_FILE" <<ENV
DATABASE_URL="mysql://$DB_USER:$ENC_PASS@localhost:3306/$DB_NAME"
JWT_SECRET="$JWT"
UPLOAD_DIR="$UPLOADS"
NODE_ENV=production
ENV
  umask 022
  echo "Сохранено в $ENV_FILE"
else
  echo "Использую существующий $ENV_FILE"
fi
ln -sfn "$ENV_FILE" "$APP/server/.env"

step "4/7 Зависимости сервера"
cd "$APP/server"
npm ci --omit=dev --no-audit --no-fund

step "5/7 База данных"
npx prisma migrate deploy
ADMIN_PASSWORD="$ADMIN_PASSWORD" node prisma/seed.js

step "6/7 Веб-сервер (Passenger + статика)"
mkdir -p "$UPLOADS"
ln -sfn "$UPLOADS" "$APP/client/dist/uploads"           # фото отдаёт nginx напрямую
if [ -e "$SITE/public_html" ] && [ ! -L "$SITE/public_html" ]; then
  mv "$SITE/public_html" "$SITE/public_html.bak.$(date +%Y%m%d%H%M%S)"
  echo "Старая папка public_html сохранена как резервная копия"
fi
ln -sfn "$APP/client/dist" "$SITE/public_html"
cat > "$SITE/.htaccess" <<HTA
PassengerNodejs $NODE_DIR/bin/node
PassengerAppRoot $APP/server
PassengerAppType node
PassengerStartupFile src/index.js
HTA
mkdir -p "$APP/server/tmp" && touch "$APP/server/tmp/restart.txt"

step "7/7 Проверка"
sleep 3
CODE=$(curl -s -o /tmp/health-$$ -w '%{http_code}' "http://$DOMAIN/api/health" || true)
echo "http://$DOMAIN/api/health → $CODE $(cat /tmp/health-$$ 2>/dev/null)"; rm -f /tmp/health-$$

printf '\n\033[1;32mГотово!\033[0m Сайт: https://%s\n' "$DOMAIN"
if [ -n "$ADMIN_PASSWORD" ]; then
  printf '\033[1;33mВход: admin / %s  — сохраните пароль и смените его в «Настройках».\033[0m\n' "$ADMIN_PASSWORD"
fi
