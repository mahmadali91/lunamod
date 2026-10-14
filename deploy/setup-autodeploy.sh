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
SSH_DIR="$HOME/.ssh"; AK="$SSH_DIR/authorized_keys"
mkdir -p "$SSH_DIR"; chmod 700 "$SSH_DIR"; touch "$AK"; chmod 600 "$AK"

keygen() { [ -f "$1" ] || ssh-keygen -q -t ed25519 -N "" -C "$2" -f "$1" 2>/dev/null || ssh-keygen -q -t rsa -b 4096 -N "" -C "$2" -f "$1"; }
keygen "$SSH_DIR/sklad_local" "sklad-local"
keygen "$SSH_DIR/sklad_github" "sklad-github-actions"

# Скрипт, который выполняется при входе GitHub. Принимает только хэш коммита.
cat > "$HOME/.sklad-deploy.sh" <<WRAP
#!/bin/bash
set -euo pipefail
SHA="\$(printf '%s' "\${SSH_ORIGINAL_COMMAND:-}" | grep -oE '^[0-9a-f]{40}\$' || true)"
REF="\${SHA:-main}"
echo "Автодеплой версии \$REF"
exec ssh -p 222 -i "$SSH_DIR/sklad_local" -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR localhost \\
  "COMMIT=\${SHA} DOMAIN=$DOMAIN bash -c 'curl -fsSL $REPO_RAW/\$REF/deploy/beget.sh | bash'"
WRAP
chmod 700 "$HOME/.sklad-deploy.sh"

add_key() { local pub; pub=$(cat "$1"); grep -qF "$pub" "$AK" || echo "$2$pub" >> "$AK"; }
add_key "$SSH_DIR/sklad_local.pub" ''
add_key "$SSH_DIR/sklad_github.pub" "command=\"$HOME/.sklad-deploy.sh\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty "

echo "Проверяю вход в Docker-окружение по ключу..."
if ssh -p 222 -i "$SSH_DIR/sklad_local" -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR localhost 'test -f ~/'"$DOMAIN"'/sklad.env && echo OK'; then
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
