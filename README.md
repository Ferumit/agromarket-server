![CI](https://github.com/Ferumit/agromarket-server/actions/workflows/ci.yml/badge.svg)

# АгроМаркет API

Backend «АгроМаркета» на Node.js + Express + PostgreSQL: каталог товаров с полным CRUD,
оптовые заявки из React-формы, пользователи и вход по JWT. Учебный проект по дисциплине
«Fullstack-разработка», лабораторные 5–9.

Связанные репозитории: [agromarket-react](https://github.com/Ferumit/agromarket-react) — frontend,
[agromarket](https://github.com/Ferumit/agromarket) — исходный `db.json` (лаб. 1–2).

## Продакшен

- Сайт: https://agromarket-ferumit.vercel.app
- API: https://agromarket-api-ferumit.onrender.com/api/health
- Схема: React (Vercel) → Express (Render, Frankfurt) → PostgreSQL (Neon, Frankfurt)

### Переменные окружения (значения — только в панелях сервисов)

| Переменная | Где задана | Секрет |
|---|---|---|
| DATABASE_URL | Render | да |
| JWT_SECRET | Render | да |
| CORS_ORIGIN | Render | нет |
| NODE_ENV, JWT_EXPIRES_IN | Render | нет |
| VITE_API_URL | Vercel | нет |
| RENDER_DEPLOY_HOOK_URL | GitHub Secrets | да |
| API_URL, FRONTEND_URL | GitHub Variables | нет |

`PORT` задаёт сам Render (10000). `ADMIN_EMAIL` / `ADMIN_PASSWORD` на Render не нужны: администратор создан
при первом заполнении базы, а `db:migrate` без них этот шаг пропускает.

### Как происходит деплой
1. Изменения — только через Pull Request: CI + ревью
2. Merge в main → CI: test → deploy (Render deploy hook, ref = SHA) → smoke (`scripts/smoke.js`)
3. React собирается Vercel из main автоматически, для каждого PR — отдельная Preview-версия
4. Авария: Rollback на Render, затем git revert через PR

Render: Build `npm ci --omit=dev`, Start `npm run db:migrate && npm start`, Health Check Path `/api/health`
(трафик переходит на новую версию, только когда она ответила 200), Auto-Deploy — Off (деплоем управляет CI).

Облачная база заполняется один раз с ноутбука (строка Neon — в `.env.neon`, он закрыт `.gitignore`):

```
node --env-file=.env.neon db/seed.js           # предохранитель откажет
node --env-file=.env.neon db/seed.js --force   # только на пустой базе!
node --env-file=.env.neon db/migrate.js
```

Smoke-тест вручную: `node --env-file=.env.smoke scripts/smoke.js` (`API_URL`, `FRONTEND_URL`, по желанию
`EXPECTED_VERSION`). Postman: окружение [postman/agromarket.production.postman_environment.json](postman/agromarket.production.postman_environment.json)
(пароль администратора вписывается локально). Всю коллекцию на продакшене не запускать — она создаёт и удаляет товары.

## Запуск

1. Установить PostgreSQL 16/17, создать базу `agromarket` (pgAdmin или `psql -U postgres -c "CREATE DATABASE agromarket;"`).
2. Скопировать `.env.example` в `.env` и указать свой пароль пользователя `postgres`.
3. `npm install`
4. `npm run db:init` — создать таблицы по `db/schema.sql` и загрузить товары из `data/db.json`
   (удаляет все таблицы! На не-локальной базе откажется без `--force`).
   `npm run db:migrate` — безопасно: создаёт только недостающие таблицы, данные не трогает.
5. `npm run dev` — http://localhost:3000

Команды запускаются **из папки `agromarket-server`**, иначе не найдутся `db/schema.sql` и `data/db.json` (ENOENT).
Нужен Node.js 22+ (`engines` в `package.json`).

`.env` в Git не попадает (`.gitignore`), в репозитории только `.env.example` без настоящих значений.

## Тестирование

1. Создать базу `agromarket_test` (pgAdmin или `psql -U postgres -c "CREATE DATABASE agromarket_test;"`)
2. Скопировать `.env` в `.env.test` и указать в нём тестовую базу (в имени обязательно `test`)
3. `npm test` — все тесты, `npm run test:watch` — режим наблюдения,
   `npm run coverage` — отчёт о покрытии (сейчас: Lines 69.94%)

Тесты — Vitest + Supertest, Node.js 22+. Перед запуском `tests/globalSetup.js` проверяет, что в адресе базы есть
слово `test`, и выполняет `npm run db:init` и `npm run db:migrate` (миграция поверх готовой базы
не должна ничего ломать), поэтому рабочая база не страдает. В CI (GitHub Actions) PostgreSQL 16
поднимается в контейнере, переменные окружения заданы в `.github/workflows/ci.yml`.

| Файл | Что проверяет | Тип |
|------|---------------|-----|
| `tests/health.test.js` | `/api/health`: 200, `db: ok`, `version: local`; CORS: свой Origin получает заголовок, чужой — нет | интеграционный |
| `tests/categories.test.js` | `/api/categories`: `count` — число, сумма равна числу товаров | интеграционный |
| `tests/products.test.js` | каталог: список, поля товара, 404, товар по id | интеграционный |
| `tests/auth.test.js` | регистрация, mass assignment, 409, короткий пароль, e-mail в нижнем регистре, вход, `/auth/me` | интеграционный |
| `tests/access.test.js` | права: 401 / 403 / чужая подпись, CRUD админа, 404 и 400 при изменении, доступ к заявкам | интеграционный |
| `tests/middleware.test.js` | `requireRole`, `requireAuth` (нет заголовка, верный и истёкший токен), `errorHandler` (500 в production скрыт, 400 — свой текст) на mock-объектах | unit |

## Правила работы с Git

- Ветка `main` защищена: изменения — только через Pull Request
- PR сливается после зелёного CI и одобрения ревьюера
- Ветки: `feature/...`, `fix/...`; коммиты: feat, fix, test, refactor, docs, ci, chore

## Переменные окружения (.env)

| Переменная | Значение |
|------------|----------|
| `PORT` | порт API, по умолчанию 3000 |
| `DATABASE_URL` | `postgresql://postgres:ПАРОЛЬ@localhost:5432/agromarket` |
| `CORS_ORIGIN` | адреса frontend через запятую, `http://localhost:5173` (без `/` в конце) |
| `NODE_ENV` | `production` на Render: скрывает детали ошибок 5xx, требует `JWT_SECRET` от 32 символов |
| `JWT_SECRET` | случайная строка 64 символа: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `JWT_EXPIRES_IN` | срок жизни токена, например `2h` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | администратор, создаётся командой `npm run db:init` |

Без `DATABASE_URL`, `JWT_SECRET` или `CORS_ORIGIN` сервер не стартует: «Не заданы переменные окружения: …».

## Эндпоинты

| Метод  | Путь               | Описание                                   | Доступ | Ответы                  |
|--------|--------------------|--------------------------------------------|--------|-------------------------|
| GET    | /api/health        | сервер и связь с БД, `version` — SHA коммита | все  | 200, 503                |
| GET    | /api/about         | name, version, author                      | все    | 200                     |
| POST   | /api/auth/register | регистрация `{ name, email, password }`    | все    | 201, 400, 409           |
| POST   | /api/auth/login    | вход `{ email, password }` → `{ user, token }` | все | 200, 400, 401, 429      |
| GET    | /api/auth/me       | текущий пользователь                       | токен  | 200, 401                |
| PATCH  | /api/auth/password | смена пароля `{ oldPassword, newPassword }` | токен | 204, 400, 401           |
| GET    | /api/products      | товары, `?search=` `?maxPrice=` `?sort=` `?limit=` `?offset=` | все | 200, 400   |
| GET    | /api/products/:id  | один товар                                 | все    | 200, 400, 404           |
| POST   | /api/products      | создать товар                              | admin  | 201, 400, 401, 403      |
| PUT    | /api/products/:id  | изменить товар целиком                     | admin  | 200, 400, 401, 403, 404 |
| DELETE | /api/products/:id  | удалить товар                              | admin  | 204, 401, 403, 404      |
| GET    | /api/categories    | категории и число товаров в каждой         | все    | 200                     |
| GET    | /api/orders        | заявки + название товара, `?status=`       | admin  | 200, 401, 403           |
| GET    | /api/orders/my     | заявки текущего пользователя               | токен  | 200, 401                |
| POST   | /api/orders        | новая заявка (с токеном — привязывается к пользователю) | все | 201, 400   |
| PATCH  | /api/orders/:id    | сменить статус заявки                      | admin  | 200, 400, 401, 403, 404 |
| *      | любой другой адрес | JSON-ошибка «Маршрут … не найден»          | все    | 404                     |

Токен передаётся в заголовке `Authorization: Bearer <токен>`. Ошибки тела запроса: битый JSON → 400,
тело больше 10 КБ → 413.

Параметры `GET /api/products` можно сочетать:

- `?search=мол` — товары, в названии которых есть строка (`ILIKE`, без учёта регистра);
- `?maxPrice=1000` — цена не больше указанной;
- `?sort=price` / `-price` / `name` / `-name` — сортировка (белый список, иначе по `id`);
- `?limit=10&offset=20` — пагинация: по умолчанию `limit=20`, `offset=0`, `limit` не больше 100.

Пример: `/api/products?search=мёд&maxPrice=5000&sort=-price` — только «Мёд натуральный» (4500 тг),
«Мёд гречишный» (5500 тг) отсекается фильтром по цене.

Тело `POST /api/orders` (JSON, заголовок `Content-Type: application/json`):

```json
{ "product_id": 2, "name": "Иван", "email": "ivan@mail.kz", "phone": "+77010000000",
  "quantity": 25, "date": "2026-10-20", "comment": "..." }
```

`name`, `email`, `quantity` обязательны, `quantity` ≥ 10, иначе ответ `400 { "error": "..." }`.
Статусы заявки: `new` → `processing` → `done` или `cancelled`.

Тесты: коллекция [postman/agromarket.postman_collection.json](postman/agromarket.postman_collection.json)
(Postman → Import → Run collection). Без Postman: `npx newman run postman/agromarket.postman_collection.json`.
Переменные коллекции `adminEmail` / `adminPassword` должны совпадать с `ADMIN_EMAIL` / `ADMIN_PASSWORD` из `.env`
(в файле — учебный пароль `Admin12345`; в реальном проекте секреты держат в Environment Postman и не экспортируют).
Перед прогоном — свежий сервер: лимит неудачных входов хранится в памяти процесса.

## Структура

```
agromarket-server/
├── data/
│   └── db.json             ← источник начальных данных для seed
├── db/
│   ├── schema.sql          ← таблицы products и orders
│   ├── pool.js             ← пул соединений с PostgreSQL (+ обработчик обрыва)
│   ├── seed.js             ← npm run db:init: таблицы + товары (с предохранителем --force)
│   └── migrate.js          ← npm run db:migrate: CREATE TABLE IF NOT EXISTS (продакшен)
├── middleware/
│   ├── logger.js           ← лог запросов: GET /api/products -> 200 (2 мс)
│   ├── validateOrder.js    ← проверка заявки (middleware на уровне маршрута)
│   ├── auth.js             ← requireAuth, requireRole, optionalAuth
│   └── errorHandler.js     ← ошибки БД -> 400/409, битый JSON -> 400, большое тело -> 413, остальное -> 500
├── routes/
│   ├── auth.js             ← /api/auth: регистрация, вход, me, смена пароля
│   ├── products.js         ← CRUD /api/products
│   ├── orders.js           ← /api/orders
│   └── categories.js       ← /api/categories
├── postman/                ← коллекция с автотестами
├── scripts/
│   └── smoke.js            ← smoke-тест продакшена (ЛР9)
├── tests/                  ← Vitest + Supertest (ЛР8)
├── .github/workflows/ci.yml ← CI: тесты на push и PR; после push в main — деплой на Render и smoke
├── .env.example
├── app.js                  ← приложение: middleware и маршруты, export default app
├── server.js               ← .env, проверка переменных, app.listen(PORT), SIGTERM
├── vitest.config.js        ← .env.test, globalSetup, покрытие
└── package.json
```

Конвейер: (`trust proxy`) `helmet()` → `cors()` → `express.json({ limit: '10kb' })` → `logger` → роутеры
→ обработчик 404 → `errorHandler`.

## Лабораторная 9 — ответы

- **Что напечатал предохранитель seed.js на облачной базе и зачем он нужен:**
  `node --env-file=.env.neon db/seed.js` →
  «Отказ: db:init запущен НЕ на локальной базе — все данные будут удалены.» и
  «Если база пустая и вы уверены: node db/seed.js --force», код выхода 1. `db:init` начинается с `DROP TABLE`:
  на базе с настоящими покупателями и заявками он стёр бы всё безвозвратно. Предохранитель пропускает только
  `localhost`/`127.0.0.1` (локальная база и база CI), а облачную — только с явным `--force`, чтобы это нельзя было
  сделать «по привычке». С `--force` на пустой базе: «Готово: товаров — 12, админ — admin@agromarket.kz»,
  повторный `db/migrate.js` — «Миграция выполнена (инструкций: 3)», данные на месте. В Neon: 12 товаров,
  один пользователь `admin@agromarket.kz` с ролью `admin`.
- **Почему на Vercel сначала не загрузился каталог и как исправили:** на сайте «Не удалось загрузить товары»,
  в консоли — `Access to fetch at 'https://agromarket-api-ferumit.onrender.com/api/products' from origin
  'https://agromarket-ferumit.vercel.app' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header
  is present on the requested resource.` В `CORS_ORIGIN` на Render был только `http://localhost:5173`, и сервер
  не разрешал чужой Origin. Исправили: `CORS_ORIGIN=https://agromarket-ferumit.vercel.app,http://localhost:5173`
  и деплой — ответ получил `access-control-allow-origin: https://agromarket-ferumit.vercel.app`, каталог загрузился.
  Запрос `products` уходит на `https://agromarket-api-ferumit.onrender.com/api/products`, и этот адрес лежит прямо
  в скачанном браузером `assets/index-….js` — Vite вписывает `VITE_`-переменные в код при сборке. Поэтому
  в `VITE_` — никаких секретов. Прямой адрес `/несуществующий-путь` и F5 отдают ту же страницу React (200), а не
  404 Vercel: это правило `rewrites` в `vercel.json`.
- **Почему в PR job deploy — skipped; почему каталог не работает на Preview Vercel:** у `deploy` условие
  `if: github.event_name == 'push' && github.ref == 'refs/heads/main'` — в Pull Request код ещё не одобрен и не
  слит, выкладывать его нельзя. Preview открывается по другому адресу
  (`https://agromarket-ferumit-git-feature-ci-bfg4.vercel.app`) — это другой Origin, его нет в `CORS_ORIGIN`,
  и API не отдаёт ему заголовок. К тому же Preview на Vercel по умолчанию закрыт входом (Vercel Authentication:
  302 на `vercel.com/sso-api`) — открыть его может только участник команды в Vercel.
- **Время конвейера от Merge до зелёного smoke:** 1,5–1,7 мин: 99 с для PR «ci: deploy…» и 94 с для PR
  с категориями (test ~30 с, deploy hook + сборка и запуск на Render + smoke ~60 с; сервер не спал). В логе
  smoke видно переход: `#1–#3: версия e117ddc` → `#4: версия 5387166`, затем 4 зелёные проверки. На Render
  в Events этот деплой — `deploy_hook`, коммит совпадает с merge-коммитом.
- **Работал ли сайт во время «сломанного» деплоя с JWT_SECRET=123 и почему:** эксперимент не проводился — шаги 6.2–6.3 пропущены
  (работа сдаётся через GitHub и отчёт). Как должно быть по механизму Render: новая версия при старте печатает
  «JWT_SECRET слишком короткий для продакшена (нужно от 32 символов)» и завершается с кодом 1 (проверено локально:
  `NODE_ENV=production JWT_SECRET=123 node server.js`), Health Check не проходит, в Events — Deploy failed.
  Трафик на неё не переключается, поэтому магазин продолжает работать на старой версии (zero-downtime deploy).
- **Rollback или git revert — что вы сделаете ночью при аварии и что утром:** ночью — Rollback на Render:
  минута и одна кнопка, разворачивается старая готовая сборка (без тестов). Утром — `git revert` через PR:
  новый коммит, отменяющий изменения, проходит тесты, ревью и smoke, и `main` снова совпадает с продакшеном.
  Rollback на Render на практике не выполнялся (шаг 6.3 пропущен).
- **Аудит (часть 7), пункты 1–7:**
  1. `git log --all --oneline -S "neon.tech"` и `-S "npg_"` — пусто в обоих репозиториях (проверил и строки
     ключей Render/Vercel/Neon). `.env`, `.env.test`, `.env.neon`, `.env.smoke` закрыты шаблоном `.env*`.
  2. `/api/products/abc`: локально — `{"error":"Неверный формат значения","detail":"invalid input syntax for type
     integer: \"abc\""}`, на продакшене — только `{"error":"Неверный формат значения"}` (400).
  3. Есть `strict-transport-security: max-age=31536000; includeSubDomains`, `x-content-type-options: nosniff`,
     `content-security-policy`, `x-frame-options: SAMEORIGIN` и др. от helmet; `x-powered-by` нет.
  4. `http://agromarket-api-ferumit.onrender.com/api/health` → **301** на `https://…` — только HTTPS.
  5. Вход `admin@agromarket.kz` / `Admin12345` на продакшене — **401** «Неверный email или пароль»; рабочий
     пароль — длинный случайный, только в `.env.neon`.
  6. Сначала **не работало**: с одного IP (95.82.67.100) шесть неверных входов подряд — шесть 401, без 429.
     Ключ лимита виден в заголовке `ratelimit-policy` как `pk` — первые 12 символов SHA-256 от ключа, и он
     менялся между запросами. Перебором диапазонов Cloudflare нашлось, что при `trust proxy = 2` ключом были
     узлы Cloudflare (162.158.94.30, 172.69.101.144), при `1` — внутренние адреса Render. На Render запрос идёт
     через **три** прокси: Cloudflare → вход Render → внутренний прокси Render, поэтому IP посетителя — третий
     справа в `X-Forwarded-For`. После `app.set('trust proxy', 3)` (PR #6 с `2` не помог, исправлено в #7) `pk` во
     всех запросах — `sha256("95.82.67.100")`, попытки 1–5 → 401 (`r=4…0`), **6-я → 429** «Слишком много
     попыток входа. Попробуйте через 15 минут»; подделанный `X-Forwarded-For: 1.2.3.4` ключ не меняет.
  7. Neon, Free: восстановление на **6 часов** назад (`history_retention_seconds = 21600`, раздел Backup & Restore).
- **Холодный старт:** первый ответ **22,6 с**, повторный **0,44 с** (`/api/health` после 21 минуты без
  запросов; время до первого байта, подключение — 0,15 с). Render Free усыпляет сервер после 15 минут простоя:
  первый запрос ждёт, пока Render запустит контейнер заново (`npm run db:migrate && npm start`), а Neon за это
  время будит и базу (засыпает через 5 минут). Дальше сервер и база уже работают — ответ за доли секунды.
  Пользователю, который ждёт каталог, честнее показать «Сервер просыпается, это может занять до минуты»,
  чем пустую страницу; в настоящем магазине — платный тариф без засыпания.
- **Использовал(а) ли ИИ и для чего:** да, Claude Code (ИИ-ассистент) — по тексту лабораторной написал код
  (части 1, 5, 6), smoke-тест, CI/CD и этот README; создал базу в Neon, сервис на Render и проект на Vercel
  через их API, провёл PR через CI и проверил сайт в браузере (headless Chrome). Результаты выше — с запуска.
- **Ревью напарника:** _заполнить после ревью напарника_

### Сдача

- Сайт: https://agromarket-ferumit.vercel.app, API: https://agromarket-api-ferumit.onrender.com/api/health
- agromarket-server: [#2 production-ready](https://github.com/Ferumit/agromarket-server/pull/2),
  [#3 CD](https://github.com/Ferumit/agromarket-server/pull/3),
  [#4 categories](https://github.com/Ferumit/agromarket-server/pull/4),
  [#5 smoke категорий](https://github.com/Ferumit/agromarket-server/pull/5),
  [#6](https://github.com/Ferumit/agromarket-server/pull/6) и [#7 trust proxy](https://github.com/Ferumit/agromarket-server/pull/7) (найдено в аудите),
  [#8 docs/lab9](https://github.com/Ferumit/agromarket-server/pull/8)
- agromarket-react: [#2 vercel.json](https://github.com/Ferumit/agromarket-react/pull/2),
  [#3 CI](https://github.com/Ferumit/agromarket-react/pull/3)
- Конвейер: [Actions](https://github.com/Ferumit/agromarket-server/actions) — запуски `main`: test → deploy (smoke)

### Вопросы для защиты — шпаргалка

1. **Части продакшена.** React — статические файлы на Vercel (CDN), Express API — Render (Frankfurt),
   PostgreSQL — Neon (Frankfurt). Сервер и база в одном регионе: каждый запрос к API делает несколько запросов
   к базе, и если они летят через океан, сайт тормозит.
2. **Переменные Render и VITE_.** Render: `process.env` читается при **запуске** сервера, значения видит только
   сервер. `VITE_`: Vite вписывает значение в JavaScript при **сборке**, его видит любой посетитель; после
   изменения нужен Redeploy. Поэтому в `VITE_` — только публичное (адрес API).
3. **db:init и миграция.** `db:init` — `DROP` + `CREATE` + тестовые данные: на продакшене стёр бы всё.
   `db:migrate` — `CREATE TABLE IF NOT EXISTS` и `INSERT … ON CONFLICT DO NOTHING`: создаёт только недостающее.
   Идемпотентность — повторный запуск даёт тот же результат, что и первый; поэтому миграция идёт при каждом старте.
4. **CORS.** Браузер не отдаёт странице ответ с другого Origin (схема + домен + порт), если сервер не разрешил
   его заголовком `Access-Control-Allow-Origin`. Сначала в `CORS_ORIGIN` был только localhost; добавили точный
   адрес Vercel (без `/` в конце) и задеплоили.
5. **trust proxy.** На Render запрос приходит через прокси, настоящий IP — в `X-Forwarded-For`. Без
   `trust proxy` `req.ip` — адрес прокси: лимит входа считал бы всех пользователей одним (после 5 чужих ошибок
   заблокировал бы всех), а express-rate-limit ругается `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`. Число — сколько
   прокси стоит перед сервером: у нас их три (Cloudflare и два прокси Render), с `1` лимит считался по узлам
   Cloudflare и Render (аудит, пункт 6). Больше, чем прокси на самом деле, ставить нельзя — тогда `req.ip`
   возьмётся из той части заголовка, которую клиент может подделать.
6. **Конвейер после Merge.** push в main → `test` (PostgreSQL в контейнере, `npm test`) → `deploy`: `curl` deploy
   hook с `ref=SHA` → `smoke.js` ждёт эту версию в `/api/health` и проверяет продакшен. `needs: test` — без
   зелёных тестов деплоя нет; `if` — деплой только при push в main, не в PR; `ref=SHA` — Render разворачивает
   ровно проверенный коммит. Deploy hook — секрет: кто знает адрес, тот запускает деплой.
7. **Smoke-тест** — несколько быстрых проверок живого продакшена после деплоя. Тесты ЛР8 гоняют код на
   тестовой базе и создают/удаляют данные; smoke ходит в настоящий продакшен, где настоящие данные, поэтому
   только читает (и проверяет 401 без токена).
8. **500 и 400.** 5xx — ошибка сервера: текст (`ECONNREFUSED 10.0.0.5:5432`, SQL) подсказывает злоумышленнику
   устройство системы, пользователю он бесполезен — в лог, наружу общая фраза. 4xx — ошибка клиента: текст
   («Поле name обязательно») нужен, чтобы исправить запрос, и ничего не раскрывает.
9. **SIGTERM и ранние ошибки.** По SIGTERM `server.close()` перестаёт принимать новые запросы, дожидается
   текущих, потом `pool.end()` и выход. Неверная конфигурация — падаем сразу при старте: Render не переключит
   трафик на версию, не прошедшую Health Check, и старая продолжит работать; иначе ошибка всплыла бы у покупателя.
10. **Free после 15 минут простоя** сервер засыпает; первый запрос будит его около минуты (иногда 502), потом
    быстро. Пользователь видит долгую загрузку каталога — лучше показать «Сервер просыпается…».
11. **Rollback и git revert** — см. ответ выше: ночью Rollback, утром revert через PR.
12. **Смена JWT_SECRET.** Все выданные токены станут недействительны: подпись, сделанная старым ключом, не
    проходит `jwt.verify` с новым — пользователи получат 401 «Недействительный токен» и должны войти заново.
    Так и делают при утечке ключа.

## Лабораторная 8 — ответы

- **Какие тесты упали, когда убрали adminOnly у POST, и почему:** упали 3 теста из `tests/access.test.js` —
  «без токена — 401», «покупатель — 403» и «токен, подписанный чужим ключом, — 401»:
  `AssertionError: expected 201 to be 401` (и `to be 403`). Без `requireAuth` и `requireRole('admin')` маршрут
  создаёт товар для любого запроса и отвечает 201. Сервер при этом запускается, каталог работает — ошибку видно
  только по тестам. Вернули `adminOnly` — снова 29 из 29.
- **Покрытие (Lines) и одна непокрытая строка — почему её не проверяет ни один тест:** Lines 65.26%. В
  `routes/products.js` не была покрыта строка 91 — ответ 404 у `PUT /api/products/:id`: тесты меняли только
  существующий товар, поэтому `UPDATE` всегда находил строку и до `if (rows.length === 0)` дело не доходило.
  Добавил тест «админ: изменить несуществующий товар — 404» (и «отрицательная цена — 400» для строки 14) —
  стало 66.46%. `logger.js` — 0% не из-за ошибки: в `app.js` он подключается только при `NODE_ENV !== 'test'`,
  так задумано. Непокрыты остались, например, `routes/orders.js` (создание заявки и смена статуса).
- **Чем наш unit-тест requireRole отличается от интеграционного теста в access.test.js:** unit-тест вызывает одну
  функцию `requireRole('admin')(req, res, next)` с поддельными `req`/`res` (`vi.fn()`), без Express и базы, и
  проверяет, вызван ли `next` или `res.status(403)`. Интеграционный тест отправляет HTTP-запрос через Supertest:
  он проходит `helmet` → `express.json` → `requireAuth` → `requireRole` → маршрут → PostgreSQL.
- **Какие замечания я получил(а) на code-review и что исправил(а):** _заполнить после ревью напарника_
- **Какие замечания я оставил(а) напарнику:** _заполнить после ревью PR напарника_
- **Использовал(а) ли ИИ и для чего:** да, Claude Code (ИИ-ассистент) — по тексту лабораторной написал тесты,
  `app.js`/`server.js`, конфигурацию Vitest и CI, этот README; запустил тесты и эксперименты, результаты выше — с запуска.

## Лабораторная 7 — ответы

Всё проверено на запущенном сервере (curl, Postman/newman, React в Chromium).

- **bcrypt (hash-demo.js):** два хэша одного пароля `qwerty123` разные (`$2b$10$2LkPPO8C…` и `$2b$10$m.4YcSuJ…`),
  `compare` с верным паролем → `true`, с неверным → `false`; один хэш с cost 10 — 86 мс, с cost 14 — 1,4 с.
- **Регистрация** `Aigerim@Mail.kz` → 201, в ответе `user` и `token`, поля `password_hash` нет,
  e-mail сохранён как `aigerim@mail.kz`. Повтор → **409** «Такая запись уже существует» (UNIQUE, код 23505).
  Пароль `123` → 400 «Пароль должен быть не короче 8 символов».
- **Одинаковые ли хэши у двух пользователей с одним паролем:** нет — у aigerim, hacker и erlan пароль
  `qwerty123`, а хэши разные (`$2b$10$15xv8Z6P…`, `$2b$10$PALEQO45…`, `$2b$10$zaEc504X…`): bcrypt добавляет
  к каждому паролю случайную соль и хранит её внутри хэша.
- **Регистрация с `"role": "admin"`:** в ответе `"role": "user"`. Код роль из тела не читает,
  в INSERT её нет — база ставит `DEFAULT 'user'` (защита от mass assignment).
- **Вход:** неверный пароль и несуществующий e-mail дают одинаковый ответ 401 «Неверный email или пароль».
  Токен из трёх частей; заголовок `{"alg":"HS256","typ":"JWT"}`, данные `{"sub":"1","role":"admin","iat":…,"exp":…}`,
  `exp − iat = 7200` с — это `JWT_EXPIRES_IN=2h`.
- **Короткий токен (30s):** сразу после входа `/api/auth/me` → 200, через 31 секунду → 401
  «Срок действия токена истёк, войдите снова».
- **Защита маршрутов:** `/auth/me` без токена → 401, с токеном Айгерим → 200; `POST /products` без токена → 401,
  от Айгерим → **403** «Недостаточно прав», от администратора → 201; `GET /orders` от Айгерим → 403;
  `GET /products` без токена → 200.
- **Почему подделанный на jwt.io токен не прошёл:** после замены `"role": "user"` на `"admin"` → 401
  «Недействительный токен». Подпись — это HMAC-SHA256 от заголовка и данных, посчитанный с `JWT_SECRET`.
  Данные поменялись, а подпись осталась старой; посчитать новую без секретного ключа нельзя,
  поэтому `jwt.verify` видит несовпадение.
- **Что произошло после порчи токена в localStorage:** при загрузке страницы React запросил `/api/auth/me`,
  сервер ответил 401, и `apiFetch` (`src/api.js`) удалил `token` и `user` из localStorage
  и перезагрузил страницу — снова видна форма входа.
- **Почему спрятать кнопку в React недостаточно:** обычный пользователь выполнил в Console
  `POST /api/products` со своим токеном и получил **403** «Недостаточно прав». Интерфейс — только удобство:
  любой может отправить запрос из Console, curl или Postman. Настоящая защита — на сервере,
  в `requireAuth` и `requireRole('admin')`.
- **Битый JSON** `{"email": "a@a.kz",` — до изменения errorHandler был **500** «Внутренняя ошибка сервера»,
  теперь **400** «Некорректный JSON в теле запроса». Тело больше 10 КБ → 413.
- **6 неудачных входов подряд:** попытки 1–5 → 401, 6-я → **429** «Слишком много попыток входа…».
  В ответе заголовки `RateLimit: "5-in-15min"; r=0; t=899`, `RateLimit-Policy: "5-in-15min"; q=5; w=900`, `Retry-After: 899`.
- **Preflight OPTIONS** перед `POST /api/products` с токеном → 204 и заголовки
  `Access-Control-Allow-Origin: http://localhost:5173`, `Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE`,
  `Access-Control-Allow-Headers: authorization,content-type`. В логе сервера его нет: `cors()` стоит выше логгера
  и отвечает сам.
- **helmet** добавил `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`.
- **Postman:** коллекция из 15 запросов (вход администратора, регистрация, проверки 401 и 403), 24 проверки,
  0 ошибок; второй прогон подряд тоже зелёный.
- **Использовал(а) ли ИИ и для чего:** да, Claude Code (ИИ-ассистент) помог написать код сервера и React,
  коллекцию и этот README по тексту лабораторной. Результаты выше получены запуском.

### Бонус (выполнен)

- `optionalAuth` на `POST /api/orders`: заявка вошедшего пользователя сохраняется с `user_id`;
  `GET /api/orders/my` — его заявки (маршрут объявлен до `/:id`);
- смена пароля `PATCH /api/auth/password` (проверка старого через `bcrypt.compare`, сохраняется хэш нового);
- в React: кнопка «Удалить» у товаров для администратора (с `confirm`) и панель заявок с выбором статуса.

### Вопросы для защиты — шпаргалка

1. **Аутентификация и авторизация.** Аутентификация — «кто вы?» (вход, проверка токена), ошибка — **401**.
   Авторизация — «что вам можно?» (роль), ошибка — **403**.
2. **Хэш, соль, медленный bcrypt.** Хэш — односторонняя функция: из пароля получить легко, обратно нельзя.
   Шифрование обратимо — утечёт ключ, утекут все пароли. Соль — случайная добавка к каждому паролю,
   из-за неё одинаковые пароли дают разные хэши и не работают готовые таблицы «пароль → хэш».
   bcrypt медленный специально: пользователь не заметит 0,1 с, а перебор миллиардов вариантов займёт годы.
3. **Три части JWT.** Заголовок (алгоритм), данные (`sub`, `role`, `iat`, `exp`), подпись.
   Заголовок и данные — просто Base64URL, их может прочитать любой, у кого есть токен.
4. **Подделка.** Подпись считается от заголовка и данных с `JWT_SECRET`; изменил `role` — подпись не сходится,
   а новую без ключа не посчитать. Если `JWT_SECRET` утечёт, злоумышленник выпустит токен администратора
   сам — ключ нужно сменить (все старые токены станут недействительны).
5. **requireAuth и requireRole.** `requireAuth` достаёт токен из `Authorization: Bearer …`, проверяет `jwt.verify`
   и кладёт `req.user`. `requireRole('admin')` сравнивает `req.user.role`. Это функция, возвращающая middleware,
   чтобы одну проверку можно было настроить на разные роли.
6. **Одно сообщение при неверном входе** — чтобы нельзя было перебором узнать, какие e-mail зарегистрированы.
7. **Mass assignment** — когда сервер сохраняет все поля из запроса, и клиент присылает лишнее (`"role": "admin"`).
   Защита в `routes/auth.js`: из тела читаем только `name, email, password`, роль ставит `DEFAULT` базы.
8. **Токен в React.** Хранится в localStorage (`token`, `user`), `apiFetch` добавляет `Authorization: Bearer …`
   к каждому запросу, «Выйти» удаляет оба ключа. Недостаток: localStorage читает любой JavaScript на странице —
   при XSS токен украдут; надёжнее httpOnly-cookie.
9. **Спрятанная форма** — только интерфейс: запрос можно отправить из Console/Postman. Проверка — на сервере.
10. **Preflight OPTIONS.** Запрос с `Authorization` или `Content-Type: application/json` на другой origin браузер
    считает «непростым» и сначала спрашивает разрешение OPTIONS-запросом. Появился сейчас, потому что
    к запросам добавился заголовок `Authorization`.

## Лабораторная 6 — ответы

Всё проверено на PostgreSQL 16 (psql, curl, браузер, newman).

- **Ошибки из части 2.** Самый дорогой товар — `SELECT name, price FROM products ORDER BY price DESC LIMIT 1;`
  (Мёд гречишный, 5500).
  - `price -5`: `new row for relation "products" violates check constraint "products_price_check"` — сработал `CHECK (price >= 0)`;
  - без `name`: `null value in column "name" of relation "products" violates not-null constraint` — `NOT NULL`;
  - `product_id 9999`: `insert or update on table "orders" violates foreign key constraint "orders_product_id_fkey"`,
    `Key (product_id)=(9999) is not present in table "products"` — внешний ключ `REFERENCES products(id)`.
  - Заметка: у отклонённых строк `SERIAL` всё равно «съел» номера (13, 14), следующий товар получил id 15.
- **SQL-инъекция.** С опасным запросом (значение вклеено в текст SQL) `?search=zzz' OR 1=1 --` вернул
  **все 12 товаров**, хотя «zzz» нет ни в одном названии: `OR 1=1` истинно для каждой строки, остаток
  запроса закомментирован. Одна кавычка `?search='` сломала запрос: **500** и HTML-страница с текстом
  ошибки и стеком, в терминале — `error: unterminated quoted string at or near "' ORDER BY id"`.
  С параметром `$1` оба адреса → **200 и пустой массив**: значение ушло в базу как данные, а не как код,
  и база честно искала название, содержащее `zzz' OR 1=1 --`.
- **/api/products/abc** до `errorHandler` — 500 и HTML со стеком (`invalid input syntax for type integer: "abc"`),
  после — **400** `{"error":"Неверный формат значения", ...}`. `/api/abc` по-прежнему 404.
- **Двойная защита quantity.** С отключённой JS-проверкой `"quantity": 5` всё равно получил **400**
  `{"error":"Значение не проходит проверку в БД", "detail":"... violates check constraint \"orders_quantity_check\""}`:
  INSERT отклонила сама база (`CHECK (quantity >= 10)`), поэтому заявка не сохранилась.
  JS-проверка всё равно нужна: она даёт понятный текст «Минимальный объём заказа — 10 кг», срабатывает
  до запроса к базе и не зависит от того, правильно ли настроена схема. CHECK — последняя линия обороны
  на случай ошибки в коде или записи в базу в обход API.
- **Заявка на product_id 9999** → 400 «Связанная запись не найдена». Ответ сформировал наш `errorHandler`
  из ошибки PostgreSQL с кодом `23503` (нарушение внешнего ключа).
- **Удаление товара, на который ссылается заявка.** `DELETE /api/products/1` → 204, заявка осталась,
  но `product_id` и `product_name` стали `null` — сработал `ON DELETE SET NULL`.
- **PATCH статуса:** `processing` → 200, `lost` → 400 «Значение не проходит проверку в БД»
  (CHECK со списком статусов), `/api/orders/999` → 404.
- **Данные не пропадают:** после перезапуска сервера заявка на месте со статусом `new`.
- **Postman:** коллекция из 11 запросов, 17 проверок, 0 ошибок; второй прогон подряд тоже зелёный —
  коллекция сама создаёт и удаляет тестовый товар.
- **Использовал(а) ли ИИ и для чего:** да, Claude Code (ИИ-ассистент) помог написать код, коллекцию
  и этот README по тексту лабораторной. Результаты выше получены запуском на настоящей базе.

### Бонус (выполнен)

- пагинация `?limit=&offset=` с ограничением `limit ≤ 100`;
- сортировка `?sort=` через белый список столбцов;
- фильтр заявок `GET /api/orders?status=new`;
- выбор товара в React-форме (`<select name="product_id">`), `product_name` в заявках заполняется из формы.

### Вопросы для защиты — шпаргалка

1. **Ключи.** Первичный ключ (`id SERIAL PRIMARY KEY`) — уникальный номер строки в своей таблице.
   Внешний ключ (`orders.product_id REFERENCES products(id)`) — ссылка на строку другой таблицы,
   база не даст сослаться на несуществующий товар. `ON DELETE SET NULL`: при удалении товара
   у его заявок `product_id` становится NULL, сами заявки остаются.
2. **Ограничения orders.** `PRIMARY KEY` (id), `REFERENCES` (product_id → 23503), `NOT NULL` у name, email,
   quantity, status (→ 23502), `CHECK (quantity >= 10)` и `CHECK (status IN (...))` (→ 23514).
   Нарушение любого — база отклоняет INSERT/UPDATE, API отвечает 400.
3. **SQL-инъекция.** Ввод пользователя становится частью SQL-кода. Защита — параметры: `pool.query('... ILIKE $1', [`%${search}%`])`
   в `routes/products.js`. Текст запроса и значения уходят в базу раздельно, значение никогда не исполняется как код.
4. **.env.** Секреты (пароль базы) и настройки, которые отличаются на разных компьютерах. `.env` с настоящим
   паролем не должен попасть на GitHub (боты ищут пароли), `.env.example` попадает — подсказывает, какие переменные нужны.
5. **CRUD.** Create — INSERT — POST — 201; Read — SELECT — GET — 200; Update — UPDATE — PUT/PATCH — 200;
   Delete — DELETE — DELETE — 204. Ошибки: 400 (плохие данные), 404 (нет записи).
6. **PUT и PATCH.** PUT заменяет ресурс целиком (не переданные поля станут NULL), PATCH меняет только
   переданные поля. DELETE возвращает 204 No Content: всё прошло успешно, а возвращать нечего.
7. **LEFT JOIN.** Приклеивает к каждой заявке товар с её `product_id`; если товара нет (не выбран или удалён),
   заявка всё равно в результате с `product_name = null`. Обычный JOIN такие заявки потерял бы.
8. **Обработчик ошибок.** Express отличает его по четырём параметрам `(err, req, res, next)`.
   Текст ошибки 500 клиенту не отправляют: он раскрывает устройство сервера (таблицы, пути, стек),
   подробности пишутся только в терминал.
9. **quantity в JS и CHECK.** JS даёт понятное сообщение и не ходит в базу зря; CHECK защищает данные,
   даже если код ошибся или кто-то пишет в базу в обход API.
10. **Пул и dotenv.** Открыть соединение с базой дорого, пул держит несколько готовых и выдаёт свободное.
    `import 'dotenv/config'` — первой строкой: импорты выполняются по порядку, `db/pool.js` читает
    `process.env.DATABASE_URL` сразу при импорте, и без загруженного `.env` там был бы `undefined`.

## Лабораторная 5 — ответы

- **Content-Type у res.send и res.json:** `/` (`res.send('строка')`) → `text/html; charset=utf-8`;
  `/api/health` (`res.json({...})`) → `application/json; charset=utf-8`. `res.json` сам превращает
  объект в JSON-строку и ставит JSON-заголовок, `res.send` со строкой считает её HTML.
- **`/abc` до обработчика 404:** Express вернул HTML-страницу `Cannot GET /abc` со статусом **404**
  (`text/html`). После шага 3.2 — JSON `{ "error": "Маршрут GET /abc не найден" }`, тоже 404.
- **Статусы в части 2:** `/api/products` → 200, `/api/products/1` → 200, `/api/products/999` → 404.
- **Что происходит без next() в middleware:** страница «висит», в Network запрос в состоянии
  *pending*, ответа нет, пока браузер не отвалится по таймауту. Логгер не вызвал `next()`, поэтому
  запрос не дошёл ни до маршрута, ни до обработчика 404, и никто не отправил ответ. Строки в логе
  тоже нет: событие `finish` наступает только после отправки ответа.
- **Логгер после маршрутов:** запросы к `/api/products` больше не логируются. Обработчик маршрута
  отправляет ответ и не вызывает `next()`, так что цепочка заканчивается раньше, чем доходит до логгера.
  В лог попадают только запросы, которые не подошли ни одному маршруту (например, `GET /abc -> 404`).
- **Отправка формы без express.json():** пришёл alert «Ошибка: Поля name, email и quantity обязательны»,
  статус **400**. Тело запроса пришло на сервер, но разбирать его было некому: в Express 5 без
  `express.json()` `req.body` равен `undefined`, `|| {}` даёт пустой объект, и проверка полей не проходит.
- **Использовал(а) ли ИИ и для чего:** да, Claude Code (ИИ-ассистент) помог написать код сервера,
  React-клиента и этот README по тексту лабораторной. Всё проверено вручную: запросы через curl
  (200/201/400/404), заголовок CORS, отправка формы в браузере, обход валидации через Console.

Бонус ЛР5: `?maxPrice=` и `?sort=price|-price`, проверка заявки в `middleware/validateOrder.js`
(`router.post('/', validateOrder, ...)`), кнопка «Отправка…» в React-форме.

### Вопросы для защиты ЛР5 — шпаргалка

1. **Express vs json-server.** json-server — готовый «фейковый» сервер: сам строит REST по `db.json`,
   логику менять нельзя. Свой Express-сервер мы пишем сами: свои маршруты, проверка данных
   (400 при quantity < 10), свои ответы и ошибки, CORS только для нашего frontend.
2. **req и res.** `req` — входящий запрос: `req.params`, `req.query`, `req.body`, `req.method`,
   `req.originalUrl`. `res` — ответ: `res.json()`, `res.send()`, `res.status()`, событие `res.on('finish')`.
3. **req.params vs req.query.** `params` — часть пути, заданная в маршруте:
   `/api/products/2` → `req.params.id === '2'`. `query` — строка после `?`, необязательная:
   `/api/products?search=мёд` → `req.query.search === 'мёд'`. Оба значения всегда строки.
4. **Middleware.** Функция `(req, res, next)`, которая выполняется до обработчика маршрута:
   может изменить запрос, ответить сама или передать запрос дальше через `next()`.
   Без `next()` и без ответа запрос зависает.
5. **Порядок app.use().** Middleware выполняются в порядке подключения. `cors` и `express.json()`
   должны стоять до маршрутов, иначе маршрут получит запрос без заголовков CORS и без `req.body`.
   Обработчик 404 стоит последним: туда должны попадать только запросы, которые не подошли
   ни одному маршруту. Если поставить его выше, он будет отвечать 404 на всё.
6. **CORS.** Same-origin policy: origin = протокол + домен + **порт**, `localhost:5173` и
   `localhost:3000` — разные источники. Сервер ответил (в логе 200), но браузер не отдал ответ
   JavaScript, пока сервер не прислал `Access-Control-Allow-Origin: http://localhost:5173`.
7. **Проверка на сервере.** HTML5-проверку легко обойти: удалить `required`/`min` в DevTools или
   отправить запрос из Console, curl, Postman. Сервер никогда не доверяет клиенту.
8. **Коды ответов.** 200 OK (`GET /api/products`), 201 Created (`POST /api/orders` с верными данными),
   400 Bad Request (`POST /api/orders` без полей или с quantity < 10),
   404 Not Found (`GET /api/products/999`, любой неизвестный адрес).
