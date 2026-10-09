# АгроМаркет API

Собственный backend для «АгроМаркета» на Node.js + Express: отдаёт каталог товаров
и принимает оптовые заявки из React-формы. Лабораторная работа №5.

Связанные репозитории: [agromarket-react](https://github.com/Ferumit/agromarket-react) — frontend,
[agromarket](https://github.com/Ferumit/agromarket) — исходный `db.json` (лаб. 1–2).

## Запуск

```bash
npm install
npm run dev        # http://localhost:3000
```

Сервер нужно запускать **из папки `agromarket-server`**, иначе `data/db.json` не найдётся (ENOENT).
Нужен Node.js 18.11+ (режим `node --watch`).

## Эндпоинты

| Метод | Путь                | Описание                                   | Ответы   |
|-------|---------------------|--------------------------------------------|----------|
| GET   | /                   | текстовая проверка                         | 200      |
| GET   | /api/health         | проверка сервера                           | 200      |
| GET   | /api/about          | name, version, author                      | 200      |
| GET   | /api/products       | товары, `?search=`, `?maxPrice=`, `?sort=` | 200      |
| GET   | /api/products/:id   | один товар                                 | 200, 404 |
| GET   | /api/orders         | список заявок                              | 200      |
| POST  | /api/orders         | новая заявка                               | 201, 400 |
| *     | любой другой адрес  | JSON-ошибка «Маршрут … не найден»          | 404      |

Параметры `GET /api/products` можно сочетать:

- `?search=мол` — товары, в названии которых есть строка (без учёта регистра);
- `?maxPrice=1000` — цена не больше указанной;
- `?sort=price` / `?sort=-price` — по возрастанию / убыванию цены.

Пример: `/api/products?search=мёд&maxPrice=5000&sort=-price` — только «Мёд натуральный» (4500 тг),
«Мёд гречишный» (5500 тг) отсекается фильтром по цене.

Тело `POST /api/orders` (JSON, заголовок `Content-Type: application/json`):

```json
{ "name": "Иван", "email": "ivan@mail.kz", "phone": "+77010000000",
  "quantity": 25, "date": "2026-10-20", "comment": "..." }
```

`name`, `email`, `quantity` обязательны, `quantity` ≥ 10, иначе ответ `400 { "error": "..." }`.
Заявки хранятся в памяти и пропадают при перезапуске сервера.

## Структура

```
agromarket-server/
├── data/
│   ├── db.json             ← товары
│   └── products.js         ← загрузка данных
├── middleware/
│   ├── logger.js           ← лог запросов: GET /api/products -> 200 (2 мс)
│   └── validateOrder.js    ← проверка заявки (middleware на уровне маршрута)
├── routes/
│   ├── products.js         ← всё про /api/products
│   └── orders.js           ← всё про /api/orders
├── server.js               ← только сборка приложения
├── package.json
└── .gitignore
```

Конвейер: `cors()` → `express.json()` → `logger` → роутеры → обработчик 404.

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

### Бонус (выполнен)

- `?maxPrice=` и `?sort=price|-price` в `GET /api/products`, сортируется копия массива;
- проверка заявки вынесена в `middleware/validateOrder.js`: `router.post('/', validateOrder, ...)`;
- в React-форме кнопка блокируется и показывает «Отправка…», пока идёт запрос.

## Вопросы для защиты — шпаргалка

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
