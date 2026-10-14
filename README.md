# Склад и продажи

Простой сервис для учёта товаров, остатков по складам и продаж.

## Возможности

- **Товары**: фото (несколько, выбор главного), характеристики (размер, цвет и любые свои), категории, цены (продажа, старая, закупочная), минимальный остаток.
- **Штрихкоды**: каждому товару автоматически выдаётся уникальный EAN-13 (внутренний префикс `200`). Можно ввести свой штрихкод или добавить несколько (например, заводской). Повторы запрещены.
- **Поиск по штрихкоду и артикулу**: строка поиска в шапке, поиск в списке товаров, в кассе, в приходе. USB-сканер работает как клавиатура: отсканировал → Enter → товар найден.
- **Склады**: любое количество; остатки по каждому складу; приход, инвентаризация (ввод фактического остатка), перемещение между складами, история движений; выгрузка остатков в CSV.
- **Продажи**: касса со сканером, канал продаж, покупатель, способ оплаты, скидка; контроль остатка; возвраты.
- **Каналы продаж и контрагенты** (покупатели / поставщики).
- **Ценники и этикетки 58×40 мм** (размер и ориентацию можно менять): шаблоны «Ценник» и «Штрихкод», нужное количество копий, печать на термопринтер прямо из браузера.
- **Дашборд**: выручка с динамикой к прошлому периоду, прибыль, средний чек, график по дням, доли каналов, топ товаров, товары, которые заканчиваются, последние продажи.
- Пользователи с ролями «Админ» / «Продавец».

## Стек

Node.js 20+ · Express · Prisma (SQLite / PostgreSQL / MySQL) · React · Vite · Tailwind CSS · Recharts · JsBarcode

## Локальный запуск

```bash
npm run install:all
cp server/.env.example server/.env        # и поменяйте JWT_SECRET
cd server && npx prisma migrate deploy && npm run seed   # создаёт admin и печатает пароль
npm run demo                              # (необязательно) демо-данные
cd .. && npm run build && npm start       # http://localhost:3000
```

Режим разработки: `npm run dev:server` и `npm run dev:client` (http://localhost:5173).

**После первого входа смените пароль admin в «Настройках».**

## Переход на PostgreSQL

1. В `server/prisma/schema.prisma` замените `provider = "sqlite"` на `provider = "postgresql"`.
2. В `server/.env`: `DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME?schema=public"`.
3. Удалите папку `server/prisma/migrations` (она под SQLite) и выполните:
   ```bash
   cd server && npx prisma migrate dev --name init && npm run seed
   ```
Для MySQL то же самое с `provider = "mysql"` и `mysql://...`.

## Деплой на сервер (Ubuntu + nginx + pm2)

```bash
git clone <repo> /var/www/sklad && cd /var/www/sklad
npm run install:all && npm run build
cd server && cp .env.example .env && nano .env   # DATABASE_URL, JWT_SECRET, PORT=3000
npx prisma migrate deploy && npm run seed && cd ..
npm i -g pm2 && pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
```

nginx (`/etc/nginx/sites-available/sklad`):

```nginx
server {
    server_name example.com;
    client_max_body_size 20m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

HTTPS: `sudo certbot --nginx -d example.com`.

Фото товаров хранятся в `server/uploads/` — включите эту папку и базу данных в резервное копирование.

## Печать этикеток

Откройте «Ценники и этикетки» (или кнопку «Ценник» в карточке товара, или выберите несколько товаров в списке). В окне печати браузера: принтер — ваш термопринтер, размер бумаги — 58×40 мм, поля — «Нет», масштаб — 100%. Если этикетка печатается повёрнутой, нажмите кнопку поворота (40×58).

## Автоматическая проверка и деплой

При каждом изменении в ветке `main` GitHub Actions (`.github/workflows/deploy.yml`):

1. **Проверяет**: поднимает MySQL, применяет миграции, запускает автотесты API (`server/test`) — вход, справочники, товары и штрихкоды, поиск, приход/продажа/возврат, перемещение, фото, дашборд; собирает фронтенд.
2. **Выкладывает** на Beget — только если все проверки прошли.
3. **Проверяет сайт** после выкладки: `https://botmi.ru/api/health` должен вернуть новую версию и `db: ok`.

Если что-то не так, GitHub присылает письмо, а сайт остаётся на предыдущей версии (при ошибке тестов).

**Одноразовая настройка.** В терминале Beget: `ssh localhost -p 222`, затем
```bash
curl -fsSL https://raw.githubusercontent.com/mahmadali91/sklad/main/deploy/setup-autodeploy.sh | bash
```
и добавьте выведенный ключ в GitHub → Settings → Secrets and variables → Actions → `BEGET_SSH_KEY`.
Ключ ограничен на сервере: им можно только запустить обновление сайта.

Локальный запуск тестов: `cd server && DATABASE_URL=mysql://... ADMIN_PASSWORD=test npm test`.
