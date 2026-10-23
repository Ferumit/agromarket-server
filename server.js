import 'dotenv/config'; // ← ПЕРВОЙ строкой: читает .env в process.env
import app from './app.js';
import { pool } from './db/pool.js';

// Без этих переменных запускаться бессмысленно — падаем сразу и с понятным текстом
const required = ['DATABASE_URL', 'JWT_SECRET', 'CORS_ORIGIN'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error('Не заданы переменные окружения:', missing.join(', '));
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET слишком короткий для продакшена (нужно от 32 символов)');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`АгроМаркет API: порт ${PORT}, режим ${process.env.NODE_ENV || 'development'}`);
});

// При деплое хостинг останавливает старую версию сигналом SIGTERM.
// Даём текущим запросам завершиться и аккуратно закрываем соединения с базой
process.on('SIGTERM', () => {
  console.log('SIGTERM: завершаем работу...');
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
});
