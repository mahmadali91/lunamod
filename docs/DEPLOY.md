# Резервная копия, перенос и установка на свой сервер

Магазин состоит из четырёх частей. Для переезда нужны все четыре:

| Что | Где лежит на Beget | Как сохранить |
|---|---|---|
| **Код программы** | `~/botmi.ru/app` (берётся из GitHub) | архив проекта или `git clone` |
| **База данных MySQL** (товары, продажи, заказы, покупатели, настройки) | панель Beget → MySQL | админка → Настройки → «Резервная копия» → **База данных** |
| **Фото, видео, файлы чата** | `~/botmi.ru/uploads` | админка → Настройки → «Резервная копия» → **Фото и файлы** |
| **Файл настроек** `sklad.env` (пароль базы, ключ входа `JWT_SECRET`) | `~/botmi.ru/sklad.env` | файловый менеджер Beget → скачать |

> ⚠️ В копии базы и в `sklad.env` есть пароли и ключи (Т-Банк, SMS, боты, хэши паролей сотрудников). Храните их в надёжном месте и никому не пересылайте.

---

## 1. Сделать резервную копию

### Через админку (проще всего)
**Настройки → Резервная копия**:
- **База данных** — файл `sklad-db-ГГГГ-ММ-ДД.sql.gz` (SQL: структура + все данные + история обновлений базы);
- **Фото и файлы** — файл `sklad-uploads-ГГГГ-ММ-ДД.tar.gz` (внутри папка `uploads/`).

Кнопки видит только администратор. Ссылка на скачивание одноразовая и живёт 2 минуты.

### Через панель Beget (запасной способ)
- **База**: панель → MySQL → значок phpMyAdmin у базы → вкладка «Экспорт» → формат SQL → «Вперёд».
- **Фото**: панель → Файловый менеджер → папка `botmi.ru` → правой кнопкой на `uploads` → «Архивировать» → скачать архив.
- **Настройки**: там же скачайте файл `sklad.env`.

### Через SSH (для опытных)
```bash
ssh ЛОГИН@ЛОГИН.beget.tech
mysqldump --single-transaction --default-character-set=utf8mb4 -u ИМЯ_БАЗЫ -p ИМЯ_БАЗЫ | gzip > sklad-db.sql.gz
tar czf sklad-uploads.tar.gz -C ~/botmi.ru uploads
```

**Совет:** делайте копию раз в неделю и обязательно перед переездом или большими изменениями.

---

## 2. Установка на новый сайт Beget (с переносом данных)

1. Привяжите домен к Beget. У регистратора укажите DNS `ns1.beget.com` и `ns2.beget.com`.
2. Панель → **Сайты** → создайте сайт `новый-домен.ru` и привяжите к нему домен.
3. Панель → **MySQL** → создайте базу, например `логин_shop`, и запомните пароль.
4. **Загрузите данные в базу**: phpMyAdmin этой базы → «Импорт» → выберите `sklad-db-….sql.gz` (сжатый файл подходит) → «Вперёд».
   *Для чистой установки без данных этот шаг пропустите.*
5. **Установите программу.** Откройте панель → «Терминал» (или войдите по SSH), затем:
   ```bash
   ssh localhost -p 222
   curl -fsSL https://raw.githubusercontent.com/mahmadali91/sklad/main/deploy/beget.sh | DOMAIN=новый-домен.ru bash
   ```
   Скрипт спросит имя и пароль базы из шага 3, поставит Node.js, применит обновления базы и настроит сайт.
   - Если база перенесена из копии, вход в админку — со **старым** логином и паролем.
   - Если база пустая, скрипт покажет пароль нового пользователя `admin`. Сохраните его.
6. **Загрузите фото.** Файловый менеджер → папка `новый-домен.ru` → загрузите `sklad-uploads-….tar.gz` → правой кнопкой → «Разархивировать». Должна получиться папка `новый-домен.ru/uploads`.
   Или по SSH: `tar xzf sklad-uploads-….tar.gz -C ~/новый-домен.ru`
7. Панель → **SSL** → включите бесплатный сертификат для домена.
8. Проверьте `https://новый-домен.ru/api/health`. Должно вернуться `"db":"ok"`.
9. Пройдите шаги из раздела 5 «После переезда».

**Если репозиторий на GitHub закрытый**, команда `curl … raw.githubusercontent.com …` не сработает. Скачайте код (архив проекта или **Code → Download ZIP** на GitHub), загрузите его в домашнюю папку на Beget и запустите установку из архива:
```bash
unzip -p ~/sklad-main.zip sklad-main/deploy/beget.sh | ARCHIVE=$HOME/sklad-main.zip DOMAIN=новый-домен.ru bash
```
Автообновления после этого работают и с закрытым репозиторием: GitHub сам присылает код на сервер.

**Автообновление из GitHub** для нового сайта:
```bash
curl -fsSL https://raw.githubusercontent.com/mahmadali91/sklad/main/deploy/setup-autodeploy.sh | DOMAIN=новый-домен.ru bash
```
Скрипт выдаст ключ: его добавляют в GitHub → Settings → Secrets. Если нужно, чтобы обновления шли на два сайта (тестовый и рабочий), попросите разработчика настроить второй сайт в `.github/workflows/deploy.yml`.

---

## 2а. Второй сайт на том же Beget (рабочий lunaramod.ru рядом с тестовым botmi.ru)

1. Сайт создан в панели, оба домена привязаны к папке `lunaramod.ru`, SSL включён, база `mahmadgv_luna` создана.
2. Если папка сайта называется не как домен (у нас `~/lunara`), сделайте ярлык с именем домена — его используют все скрипты:
   ```bash
   ln -s ~/lunara ~/lunaramod.ru
   ```
3. В терминале Beget (`ssh localhost -p 222`) — установка из архива, который автодеплой оставил на сервере:
   ```bash
   tar xzf ~/.sklad-release.tar.gz -O deploy/beget.sh | ARCHIVE=$HOME/.sklad-release.tar.gz DOMAIN=lunaramod.ru CANONICAL=lunaramod.ru DB_NAME=mahmadgv_luna bash
   ```
   Скрипт спросит только пароль базы. `CANONICAL` — основной домен: второй домен и `www` переадресуются на него.
4. Перенос данных с botmi.ru (товары, продажи, заказы, покупатели, настройки, фото):
   ```bash
   bash ~/lunaramod.ru/app/deploy/copy-site.sh botmi.ru lunaramod.ru
   ```
5. Автообновление обоих сайтов:
   ```bash
   tar xzf ~/.sklad-release.tar.gz -O deploy/setup-autodeploy.sh | DOMAINS="botmi.ru lunaramod.ru" bash
   ```
   Ключ для GitHub не меняется. В `.github/workflows/deploy.yml` список сайтов — переменная `SITES`.
6. На botmi.ru: Настройки магазина → Поисковики → «Тестовый сайт — закрыть от поисковиков».

## 3. Установка на свой сервер (VPS: Ubuntu 22.04 / 24.04)

### 3.1. Программы
```bash
sudo apt update && sudo apt install -y mariadb-server nginx certbot python3-certbot-nginx curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm i -g pm2
```

### 3.2. База данных
```bash
sudo mysql -e "CREATE DATABASE sklad CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'sklad'@'localhost' IDENTIFIED BY 'ПРИДУМАЙТЕ_ПАРОЛЬ';
GRANT ALL ON sklad.* TO 'sklad'@'localhost'; FLUSH PRIVILEGES;"
# перенос данных (для чистой установки пропустить):
gunzip -c sklad-db-….sql.gz | sudo mysql sklad
```

### 3.3. Код
Вариант А, из GitHub:
```bash
sudo git clone https://github.com/mahmadali91/sklad /var/www/sklad
```
Вариант Б, из архива проекта: загрузите `sklad-project-….zip` на сервер (например, `scp`), затем:
```bash
sudo mkdir -p /var/www/sklad && sudo unzip sklad-project-….zip -d /var/www/sklad
```
```bash
sudo chown -R $USER /var/www/sklad && cd /var/www/sklad/server
npm ci --omit=dev          # сайт (client/dist) уже собран и лежит в архиве
```

### 3.4. Настройки `server/.env`
```bash
cat > /var/www/sklad/server/.env <<'ENV'
DATABASE_URL="mysql://sklad:ПАРОЛЬ_ИЗ_3.2@localhost:3306/sklad"
JWT_SECRET="длинная-случайная-строка"
UPLOAD_DIR="/var/www/sklad-uploads"
NODE_ENV=production
PORT=3000
ENV
chmod 600 /var/www/sklad/server/.env
```
- `JWT_SECRET` можно взять из старого `sklad.env`, тогда сотрудникам не придётся входить заново. Новый ключ можно сгенерировать командой `openssl rand -hex 32`.
- Если в пароле базы есть символы `@ : / ? #`, их нужно заменить на коды (`@` → `%40` и т. п.).

### 3.5. Фото, обновление базы, запуск
```bash
sudo mkdir -p /var/www/sklad-uploads && sudo chown $USER /var/www/sklad-uploads
tar xzf sklad-uploads-….tar.gz -C /var/www/sklad-uploads --strip-components 1   # перенос фото
cd /var/www/sklad/server
npx prisma migrate deploy        # доводит базу до версии кода (безопасно для данных)
node prisma/seed.js              # при пустой базе создаёт admin и печатает пароль
cd .. && pm2 start ecosystem.config.cjs && pm2 save && pm2 startup   # последняя команда подскажет ещё одну — выполните её
```

### 3.6. nginx и HTTPS
`/etc/nginx/sites-available/sklad`:
```nginx
server {
    server_name новый-домен.ru;
    client_max_body_size 60m;             # видео товаров до 50 МБ
    location /uploads/ { alias /var/www/sklad-uploads/; expires 7d; }
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;          # долгие операции: импорт, резервная копия
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/sklad /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d новый-домен.ru
```
Проверка: `curl https://новый-домен.ru/api/health`.

### 3.7. Обновление кода на своём сервере
```bash
cd /var/www/sklad && git pull            # или распакуйте новый архив поверх (.env и фото лежат отдельно и не затираются)
cd server && npm ci --omit=dev && npx prisma migrate deploy && pm2 restart sklad
```
Перед обновлением сделайте резервную копию (раздел 1).

---

## 4. Запуск на своём компьютере (посмотреть или проверить копию)

Нужны Node.js 22 и MySQL или MariaDB (на Windows подойдут, например, XAMPP или MariaDB).
```bash
# база: создайте пустую базу sklad и загрузите копию
gunzip -c sklad-db-….sql.gz | mysql -u root -p sklad
# код: распакуйте архив проекта, затем в папке проекта:
cd server
echo 'DATABASE_URL="mysql://root:ПАРОЛЬ@localhost:3306/sklad"' > .env
echo 'JWT_SECRET="local"' >> .env
npm install && npx prisma migrate deploy && npm start
```
Откройте http://localhost:3000 (магазин) и http://localhost:3000/admin (учёт). Фото: распакуйте `uploads` из архива в папку `server/uploads`.
На Windows вместо `gunzip -c файл | mysql …` распакуйте архив `.gz` (например, 7-Zip) и загрузите `.sql` через phpMyAdmin или HeidiSQL.

> Онлайн-оплата, SMS и уведомления на копии будут работать с теми же ключами, что и на рабочем сайте. Для проверки отключите их в «Настройках магазина» или включите тестовые режимы.

---

## 5. После переезда на новый домен

1. Админка → **Настройки магазина** → «Адрес сайта»: впишите `https://новый-домен.ru`. От него зависят ссылки оплаты, карта сайта, фид и документы.
2. **Т-Банк** → терминал → адрес уведомлений: `https://новый-домен.ru/api/shop/tbank/notify`.
3. **Яндекс Метрика и Вебмастер**: укажите новый сайт и новый код подтверждения. В Яндекс Товарах обновите ссылку на фид `https://новый-домен.ru/feed.yml`.
4. Отправьте тестовое уведомление (Telegram или MAX) и оформите пробный заказ.
5. Покупателям на новом адресе нужно один раз войти заново: вход и корзина хранятся в браузере отдельно для каждого сайта.
