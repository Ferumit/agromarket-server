import 'dotenv/config';
import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';

const schema = readFileSync('./db/schema.sql', 'utf-8');
const { products } = JSON.parse(readFileSync('./data/db.json', 'utf-8'));

await pool.query(schema); // 1. создаём таблицы

for (const p of products) { // 2. переносим товары из db.json (id раздаст SERIAL)
  await pool.query(
    `INSERT INTO products (name, category, price, unit, image)
     VALUES ($1, $2, $3, $4, $5)`,
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

console.log(
  `Готово: товаров — ${products.length}, админ — ${process.env.ADMIN_EMAIL}`
);
await pool.end(); // 4. закрываем соединения, иначе скрипт не завершится
