#!/bin/bash
# Установка / обновление на виртуальном хостинге Beget.
# Запускать в Docker-окружении хостинга (после `ssh localhost -p 222`):
#   curl -fsSL https://raw.githubusercontent.com/mahmadali91/sklad/main/deploy/beget.sh | bash
# Повторный запуск = обновление до последней версии из GitHub (данные и фото сохраняются).
# Ввести данные базы заново: ... | RESET=1 bash
# Закрытый репозиторий: код приходит архивом (автодеплой присылает его сам), например вручную:
#   tar xzf sklad.tar.gz -O deploy/beget.sh | ARCHIVE=$HOME/sklad.tar.gz bash   (подходит и .zip из GitHub)
set -euo pipefail

DOMAIN="${DOMAIN:-lunaramod.ru}"
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
# папка сайта может называться иначе, чем домен (например, ~/lunara), а ~/lunaramod.ru — ярлык на неё:
# дальше везде настоящий путь, чтобы веб-сервер и Passenger работали с реальной папкой
SITE="$(cd "$SITE" && pwd -P)"; APP="$SITE/app"; NODE_DIR="$SITE/.node"; UPLOADS="$SITE/uploads"; ENV_FILE="$SITE/sklad.env"
echo "Папка сайта: $SITE"

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

step "2/7 Код"
if [ -n "${ARCHIVE:-}" ]; then
  # код из архива (закрытый репозиторий): .tar.gz от автодеплоя или .zip, скачанный с GitHub
  [ -s "$ARCHIVE" ] || fail "Нет архива с кодом: $ARCHIVE"
  rm -rf "$APP.new" "$APP.unpack" && mkdir -p "$APP.unpack"
  case "$ARCHIVE" in
    *.zip) unzip -q "$ARCHIVE" -d "$APP.unpack" ;;
    *) tar xzf "$ARCHIVE" -C "$APP.unpack" ;;
  esac
  # в .zip с GitHub всё лежит в одной папке sklad-main/ — поднимаем её
  if [ -d "$APP.unpack/server" ]; then mv "$APP.unpack" "$APP.new"; else mv "$APP.unpack"/*/ "$APP.new" && rm -rf "$APP.unpack"; fi
  [ -f "$APP.new/server/package.json" ] || fail "В архиве нет папки server — это не тот архив"
  echo "${COMMIT:-archive-$(date +%Y%m%d%H%M)}" > "$APP.new/server/VERSION"
  rm -rf "$APP.old" && { [ -d "$APP" ] && mv "$APP" "$APP.old" || true; } && mv "$APP.new" "$APP" && rm -rf "$APP.old"
elif command -v git >/dev/null 2>&1; then
  [ -d "$APP/.git" ] || { rm -rf "$APP"; git clone --depth 1 -b "$BRANCH" "$REPO" "$APP"; }
  # COMMIT — точная версия (передаёт автодеплой), иначе последняя в ветке
  git -C "$APP" fetch --depth 1 origin "${COMMIT:-$BRANCH}"
  git -C "$APP" reset --hard FETCH_HEAD
  git -C "$APP" rev-parse HEAD > "$APP/server/VERSION"
else
  rm -rf "$APP.new" && mkdir -p "$APP.new"
  curl -fsSL "$REPO/archive/${COMMIT:-refs/heads/$BRANCH}.tar.gz" | tar xz -C "$APP.new" --strip-components 1
  echo "${COMMIT:-$BRANCH}" > "$APP.new/server/VERSION"
  rm -rf "$APP" && mv "$APP.new" "$APP"
fi
echo "Версия: $(cat "$APP/server/VERSION")"

step "3/7 Зависимости сервера"
cd "$APP/server"
npm ci --omit=dev --no-audit --no-fund --loglevel=error

# Проверка подключения к MySQL
db_ok() { printf 'SELECT 1;' | npx prisma db execute --url "$1" --stdin >/dev/null 2>&1; }
make_url() { local p; p=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$3"); printf 'mysql://%s:%s@localhost:3306/%s' "$2" "$p" "$1"; }

step "4/7 Настройки и подключение к базе"
ADMIN_PASSWORD=""
if [ "${RESET:-0}" = 1 ] && [ -f "$ENV_FILE" ]; then
  mv "$ENV_FILE" "$ENV_FILE.old.$(date +%Y%m%d%H%M%S)"
  echo "RESET=1: настройки базы будут введены заново"
fi
if [ -f "$ENV_FILE" ]; then
  echo "Использую существующий $ENV_FILE"
  URL=$(sed -n 's/^DATABASE_URL="\(.*\)"$/\1/p' "$ENV_FILE")
  db_ok "$URL" || fail "Не удаётся подключиться к базе с сохранёнными настройками. Запустите заново с RESET=1:
  curl -fsSL https://raw.githubusercontent.com/mahmadali91/sklad/main/deploy/beget.sh | RESET=1 bash"
else
  echo "Нужна база MySQL из панели Beget → «MySQL». Пользователь БД на Beget совпадает с именем базы."
  URL=""
  for try in 1 2 3; do
    DB_NAME="${DB_NAME:-$(ask "Имя базы данных (например, ${USER:-логин}_sklad): ")}"
    DB_PASS="${DB_PASS:-$(asks "Пароль базы данных (при вводе не отображается): ")}"
    DB_USER="${DB_USER:-$DB_NAME}"
    if [ -n "$DB_NAME" ] && [ -n "$DB_PASS" ] && db_ok "$(make_url "$DB_NAME" "$DB_USER" "$DB_PASS")"; then
      URL=$(make_url "$DB_NAME" "$DB_USER" "$DB_PASS"); echo "Подключение к базе $DB_NAME: OK"; break
    fi
    echo "Не удалось подключиться к базе «$DB_NAME» (попытка $try из 3). Проверьте имя и пароль в панели → MySQL."
    unset DB_NAME DB_PASS DB_USER
    [ -t 0 ] || [ -r /dev/tty ] || break
  done
  [ -n "$URL" ] || fail "Нет подключения к базе. Настройки не сохранены — просто запустите команду ещё раз."
  JWT=$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))')
  ADMIN_PASSWORD=$(node -e 'process.stdout.write(require("crypto").randomBytes(6).toString("base64url"))')
  umask 077
  cat > "$ENV_FILE" <<ENV
DATABASE_URL="$URL"
JWT_SECRET="$JWT"
UPLOAD_DIR="$UPLOADS"
NODE_ENV=production
ENV
  umask 022
  echo "Сохранено в $ENV_FILE"
fi
# адрес сайта (ссылки оплаты, карта сайта, уведомления) — свой у каждого сайта
grep -q '^SITE_URL=' "$ENV_FILE" || echo "SITE_URL=https://$DOMAIN" >> "$ENV_FILE"
# основной домен: CANONICAL=lunaramod.ru — остальные домены этой папки переадресуются на него
if [ -n "${CANONICAL:-}" ]; then
  { grep -v '^CANONICAL_HOST=' "$ENV_FILE" || true; echo "CANONICAL_HOST=$CANONICAL"; } > "$ENV_FILE.tmp" && cat "$ENV_FILE.tmp" > "$ENV_FILE" && rm -f "$ENV_FILE.tmp"
  echo "Основной домен: $CANONICAL"
fi
ln -sfn "$ENV_FILE" "$APP/server/.env"

step "5/7 База данных"
npx prisma migrate deploy
ADMIN_PASSWORD="$ADMIN_PASSWORD" node prisma/seed.js   # создаёт admin только при первой установке

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
