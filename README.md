# АгроМаркет API

Backend «АгроМаркета» на Node.js + Express + PostgreSQL: каталог товаров с полным CRUD
и оптовые заявки из React-формы. Учебный проект по дисциплине «Fullstack-разработка», лабораторные 5–6.

Связанные репозитории: [agromarket-react](https://github.com/Ferumit/agromarket-react) — frontend,
[agromarket](https://github.com/Ferumit/agromarket) — исходный `db.json` (лаб. 1–2).

## Запуск

1. Установить PostgreSQL 16/17, создать базу `agromarket` (pgAdmin или `psql -U postgres -c "CREATE DATABASE agromarket;"`).
2. Скопировать `.env.example` в `.env` и указать свой пароль пользователя `postgres`.
3. `npm install`
4. `npm run db:init` — создать таблицы по `db/schema.sql` и загрузить товары из `data/db.json`.
5. `npm run dev` — http://localhost:3000

Команды запускаются **из папки `agromarket-server`**, иначе не найдутся `db/schema.sql` и `data/db.json` (ENOENT).
Нужен Node.js 18.11+ (режим `node --watch`).

`.env` в Git не попадает (`.gitignore`), в репозитории только `.env.example` без настоящего пароля.

## Эндпоинты

| Метод  | Путь              | Описание                                         | Ответы        |
|--------|-------------------|--------------------------------------------------|---------------|
| GET    | /api/health       | сервер и связь с БД                              | 200           |
| GET    | /api/about        | name, version, author                            | 200           |
| GET    | /api/products     | товары, `?search=` `?maxPrice=` `?sort=` `?limit=` `?offset=` | 200, 400 |
| GET    | /api/products/:id | один товар                                       | 200, 400, 404 |
| POST   | /api/products     | создать товар                                    | 201, 400      |
| PUT    | /api/products/:id | изменить товар целиком                           | 200, 400, 404 |
| DELETE | /api/products/:id | удалить товар                                    | 204, 404      |
| GET    | /api/orders       | заявки + название товара, `?status=`             | 200           |
| POST   | /api/orders       | новая заявка                                     | 201, 400      |
| PATCH  | /api/orders/:id   | сменить статус заявки                            | 200, 400, 404 |
| *      | любой другой адрес | JSON-ошибка «Маршрут … не найден»               | 404           |

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

## Структура

```
agromarket-server/
├── data/
│   └── db.json             ← источник начальных данных для seed
├── db/
│   ├── schema.sql          ← таблицы products и orders
│   ├── pool.js             ← пул соединений с PostgreSQL
│   └── seed.js             ← npm run db:init: таблицы + товары
├── middleware/
│   ├── logger.js           ← лог запросов: GET /api/products -> 200 (2 мс)
│   ├── validateOrder.js    ← проверка заявки (middleware на уровне маршрута)
│   └── errorHandler.js     ← ошибки БД -> 400, остальное -> 500
├── routes/
│   ├── products.js         ← CRUD /api/products
│   └── orders.js           ← /api/orders
├── postman/                ← коллекция с автотестами
├── .env.example
├── server.js               ← только сборка приложения
└── package.json
```

Конвейер: `cors()` → `express.json()` → `logger` → роутеры → обработчик 404 → `errorHandler`.

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
