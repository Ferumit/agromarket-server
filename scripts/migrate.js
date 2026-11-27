// scripts/migrate.js — применить SQL-файл к базе из DATABASE_URL (ЛР13)
// Использование: node scripts/migrate.js db/migrations/013_orders.sql
// Продакшен:     node --env-file=.env.neon scripts/migrate.js db/migrations/013_orders.sql
import 'dotenv/config';
import fs from 'node:fs';
import pg from 'pg';

const file = process.argv[2];
if (!file || !process.env.DATABASE_URL) {
  console.error('Нужны файл миграции и переменная DATABASE_URL (в .env)');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
console.log('База:', new URL(process.env.DATABASE_URL).host); // посмотрите, КУДА применяете
await client.connect();
try {
  await client.query(fs.readFileSync(file, 'utf8'));
  console.log('Применено:', file);
} catch (err) {
  console.error('Ошибка миграции:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
