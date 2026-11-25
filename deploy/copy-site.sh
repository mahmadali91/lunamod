#!/bin/bash
# Перенос всех данных одного сайта на другой на этом же хостинге: база + фото/видео/файлы чата.
# Запускать в Docker-окружении Beget (после `ssh localhost -p 222`), когда оба сайта уже установлены:
#   bash ~/lunaramod.ru/app/deploy/copy-site.sh botmi.ru lunaramod.ru
# Сайт «куда» полностью заменяется копией сайта «откуда» (товары, продажи, заказы, покупатели, настройки).
set -euo pipefail
FROM="${1:-}"; TO="${2:-}"
fail() { printf '\n\033[1;31mОШИБКА: %s\033[0m\n' "$*"; exit 1; }
[ -n "$FROM" ] && [ -n "$TO" ] || fail "Укажите: откуда куда, например: botmi.ru lunaramod.ru"
[ "$FROM" != "$TO" ] || fail "Сайты совпадают"
for d in "$FROM" "$TO"; do [ -f "$HOME/$d/sklad.env" ] || fail "Сайт $d не установлен (нет $HOME/$d/sklad.env)"; done
url() { sed -n 's/^DATABASE_URL="\(.*\)"$/\1/p' "$HOME/$1/sklad.env"; }
FROM_URL=$(url "$FROM"); TO_URL=$(url "$TO")
[ -n "$FROM_URL" ] && [ -n "$TO_URL" ] || fail "Не нашёл DATABASE_URL в sklad.env"
[ "$FROM_URL" != "$TO_URL" ] || fail "У сайтов одна и та же база — копировать не нужно"
export PATH="$HOME/$TO/.node/bin:$PATH"

printf '\n\033[1;33mВсе данные сайта %s будут ЗАМЕНЕНЫ копией %s. Продолжить? Введите «да»: \033[0m' "$TO" "$FROM"
read -r ok </dev/tty
[ "$ok" = "да" ] || fail "Отменено"

printf '\n\033[1;34m==> 1/3 База данных\033[0m\n'
cd "$HOME/$TO/app/server"
node scripts/copy-db.js "$FROM_URL" "$TO_URL" "https://$TO"

printf '\n\033[1;34m==> 2/3 Фото, видео и файлы\033[0m\n'
mkdir -p "$HOME/$TO/uploads"
cp -a "$HOME/$FROM/uploads/." "$HOME/$TO/uploads/"
echo "Файлов: $(find "$HOME/$TO/uploads" -type f | wc -l)"

printf '\n\033[1;34m==> 3/3 Перезапуск %s\033[0m\n' "$TO"
mkdir -p "$HOME/$TO/app/server/tmp" && touch "$HOME/$TO/app/server/tmp/restart.txt"
sleep 3
curl -s "http://$TO/api/health" || true
printf '\n\033[1;32mГотово!\033[0m Данные %s перенесены на https://%s\n' "$FROM" "$TO"
echo "Вход в админку — с теми же логинами и паролями, что на $FROM."
