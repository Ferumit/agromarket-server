import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pool } from './db/pool.js';
import { logger } from './middleware/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRouter from './routes/auth.js';
import productsRouter from './routes/products.js';
import ordersRouter from './routes/orders.js';
import categoriesRouter from './routes/categories.js';

// Приложение БЕЗ запуска сервера: его импортируют server.js и тесты (Supertest)
const app = express();

// Версия = первые 7 символов коммита. Render сам кладёт SHA в RENDER_GIT_COMMIT
const VERSION = (process.env.RENDER_GIT_COMMIT || 'local').slice(0, 7);

// На Render запрос проходит два прокси: Cloudflare → балансировщик Render → сервер.
// Каждый дописывает в X-Forwarded-For адрес, с которого к нему пришли, поэтому
// настоящий IP посетителя — второй справа. С 1 req.ip был бы адресом узла
// Cloudflare (их несколько), и лимит попыток входа (429) считал бы по узлам,
// а не по людям. Больше 2 нельзя: левее лежит то, что клиент мог подделать сам
app.set('trust proxy', 2);

// Конвейер middleware: порядок app.use() = порядок звеньев
app.use(helmet()); // защитные HTTP-заголовки — первым middleware

// CORS_ORIGIN может содержать несколько адресов через запятую:
// https://agromarket-ЛОГИН.vercel.app,http://localhost:5173
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins })); // разрешаем только наши frontend-адреса

app.use(express.json({ limit: '10kb' })); // тело запроса -> req.body, не больше 10 КБ

// В тестах лог каждого запроса только мешает читать результат
if (process.env.NODE_ENV !== 'test') {
  app.use(logger);
}

// Маршрут: метод GET + путь '/'
app.get('/', (req, res) => {
  res.send('АгроМаркет API работает');
});

// Health-check: хостинг и smoke-тест спрашивают «ты жив?».
// Отвечаем «да», только если отвечает и база
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'ok', version: VERSION });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'unavailable', version: VERSION });
  }
});

app.get('/api/about', (req, res) => {
  res.json({
    name: 'АгроМаркет',
    version: '1.0',
    author: 'Фамилия Имя Отчество', // ← впишите своё ФИО
  });
});

app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/categories', categoriesRouter);

// Сюда доходят только запросы, которые не обработал ни один маршрут
app.use((req, res) => {
  res.status(404).json({ error: `Маршрут ${req.method} ${req.originalUrl} не найден` });
});

app.use(errorHandler); // ← последний middleware: ошибки из маршрутов

export default app;
