import 'dotenv/config';
import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';
import { applyMigrations } from './migrations.js';

// --- Предохранитель: db:init УДАЛЯЕТ ВСЕ ТАБЛИЦЫ ---
// Разрешаем без вопросов только локальную базу (и базу CI — она тоже localhost)
const target = process.env.DATABASE_URL || process.env.PGHOST || '';
const isLocal = /localhost|127\.0\.0\.1/.test(target);
if (!isLocal && !process.argv.includes('--force')) {
  console.error('Отказ: db:init запущен НЕ на локальной базе — все данные будут удалены.');
  console.error('Если база пустая и вы уверены: node db/seed.js --force');
  process.exit(1);
}

const schema = readFileSync('./db/schema.sql', 'utf-8');
const { products } = JSON.parse(readFileSync('./data/db.json', 'utf-8'));

await pool.query(schema); // 1. создаём таблицы схемы v1.0.0
await applyMigrations(pool); // …и доводим их до текущей версии миграциями (ЛР13)

for (const p of products) { // 2. переносим товары из db.json (id раздаст SERIAL), на складе — по 20
  await pool.query(
    `INSERT INTO products (name, category, price, unit, image, stock)
     VALUES ($1, $2, $3, $4, $5, 20)`,
    [p.name, p.category ?? null, Math.round(Number(p.price)), p.unit ?? 'кг', p.image ?? null]
  );
}

// 3. Администратор: email и пароль берём из .env, в базу кладём только хэш
const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
await pool.query(
  `INSERT INTO users (name, email, password_hash, role)
   VALUES ($1, $2, $3, 'admin')`,
  ['Администратор', process.env.ADMIN_EMAIL, hash]
);

// 4. Фермер (ЛР13), если задан в .env: ему принадлежит первая половина товаров
const { FARMER_EMAIL, FARMER_PASSWORD } = process.env;
if (FARMER_EMAIL && FARMER_PASSWORD) {
  const { rows: [farmer] } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ('Фермер Ержан', $1, $2, 'farmer') RETURNING id`,
    [FARMER_EMAIL.toLowerCase(), await bcrypt.hash(FARMER_PASSWORD, 10)]
  );
  await pool.query('UPDATE products SET farmer_id = $1 WHERE id <= $2', [farmer.id, Math.ceil(products.length / 2)]);
}

console.log(
  `Готово: товаров — ${products.length}, админ — ${process.env.ADMIN_EMAIL}` +
  (FARMER_EMAIL && FARMER_PASSWORD ? `, фермер — ${FARMER_EMAIL}` : '')
);
await pool.end(); // 5. закрываем соединения, иначе скрипт не завершится
