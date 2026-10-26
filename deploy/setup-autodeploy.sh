#!/bin/bash
# Одноразовая настройка автодеплоя из GitHub на хостинг Beget.
# Запускать в Docker-окружении хостинга (после `ssh localhost -p 222`):
#   curl -fsSL https://raw.githubusercontent.com/mahmadali91/sklad/main/deploy/setup-autodeploy.sh | bash
#
# Создаёт два ключа:
#  - sklad_local  — для перехода в Docker-окружение (хранится только на сервере);
#  - sklad_github — для GitHub. Этим ключом можно ТОЛЬКО запустить обновление сайта:
#    любая команда при входе с ним подменяется на ~/.sklad-deploy.sh.
set -euo pipefail
REPO_RAW="https://raw.githubusercontent.com/mahmadali91/sklad"
DOMAIN="${DOMAIN:-botmi.ru}"
# все сайты, которые обновляются автоматически (первый — по умолчанию): DOMAINS="botmi.ru lunaramod.ru"
DOMAINS="${DOMAINS:-$DOMAIN}"
SSH_DIR="$HOME/.ssh"; AK="$SSH_DIR/authorized_keys"
mkdir -p "$SSH_DIR"; chmod 700 "$SSH_DIR"; touch "$AK"; chmod 600 "$AK"

keygen() { [ -f "$1" ] || ssh-keygen -q -t ed25519 -N "" -C "$2" -f "$1" 2>/dev/null || ssh-keygen -q -t rsa -b 4096 -N "" -C "$2" -f "$1"; }
keygen "$SSH_DIR/sklad_local" "sklad-local"
keygen "$SSH_DIR/sklad_github" "sklad-github-actions"

# Скрипт, который выполняется при входе GitHub. Принимает только «хэш [домен]», домен — из списка DOMAINS.
# Код приходит архивом в этом же соединении (так работает и закрытый репозиторий: сервер в GitHub не ходит).
# Если архива нет — по-старому скачивает с GitHub (только для открытого репозитория).
cat > "$HOME/.sklad-deploy.sh" <<WRAP
#!/bin/bash
set -euo pipefail
ALLOWED="$DOMAINS"
ARGS="\${SSH_ORIGINAL_COMMAND:-}"
printf '%s' "\$ARGS" | grep -qE '^([0-9a-f]{40}( [a-z0-9.-]+)?)?\$' || { echo "Неверная команда автодеплоя"; exit 1; }
SHA="\$(printf '%s' "\$ARGS" | grep -oE '^[0-9a-f]{40}' || true)"
SITE="\$(printf '%s' "\$ARGS" | sed -nE 's/^[0-9a-f]{40} +([a-z0-9.-]+)\$/\\1/p')"
SITE="\${SITE:-\${ALLOWED%% *}}"
case " \$ALLOWED " in *" \$SITE "*) ;; *) echo "Сайт \$SITE не в списке автодеплоя"; exit 1 ;; esac
REF="\${SHA:-main}"
REL="\$HOME/.sklad-release.tar.gz"
rm -f "\$REL"
[ -n "\$SHA" ] && head -c 300000000 > "\$REL" || true
SSHL="ssh -p 222 -i $SSH_DIR/sklad_local -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR localhost"
if [ ! -f "\$HOME/\$SITE/sklad.env" ]; then echo "Сайт \$SITE ещё не установлен — пропущено"; exit 0; fi
if [ -s "\$REL" ]; then
  echo "Автодеплой \$SITE версии \$REF (архив \$(du -h "\$REL" | cut -f1))"
  exec \$SSHL "COMMIT=\$SHA DOMAIN=\$SITE ARCHIVE=\\\$HOME/.sklad-release.tar.gz bash -c 'tar xzf \\\$ARCHIVE -O deploy/beget.sh | bash'"
fi
echo "Автодеплой \$SITE версии \$REF (из GitHub)"
exec \$SSHL "COMMIT=\${SHA} DOMAIN=\$SITE bash -c 'curl -fsSL $REPO_RAW/\$REF/deploy/beget.sh | bash'"
WRAP
chmod 700 "$HOME/.sklad-deploy.sh"

add_key() { local pub; pub=$(cat "$1"); grep -qF "$pub" "$AK" || echo "$2$pub" >> "$AK"; }
add_key "$SSH_DIR/sklad_local.pub" ''
add_key "$SSH_DIR/sklad_github.pub" "command=\"$HOME/.sklad-deploy.sh\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty "

echo "Проверяю вход в Docker-окружение по ключу..."
if ssh -n -p 222 -i "$SSH_DIR/sklad_local" -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR localhost 'test -f ~/'"${DOMAINS%% *}"'/sklad.env && echo OK'; then
  echo "Ключ работает."
else
  echo "ВНИМАНИЕ: вход по ключу не сработал. Пришлите этот вывод разработчику."
fi

cat <<MSG

==================================================================
Последний шаг — в GitHub (делается один раз):
 1. Откройте https://github.com/mahmadali91/sklad/settings/secrets/actions/new
 2. Name:   BEGET_SSH_KEY
 3. Secret: скопируйте ВСЁ между линиями ниже, включая строки BEGIN и END
 4. Нажмите «Add secret». Никому больше этот текст не отправляйте.
------------------------------------------------------------------
MSG
cat "$SSH_DIR/sklad_github"
echo "------------------------------------------------------------------"
