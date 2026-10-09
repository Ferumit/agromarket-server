import 'dotenv/config';
import { readFileSync } from 'node:fs';
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

console.log(`Готово: таблицы созданы, товаров добавлено — ${products.length}`);
await pool.end(); // 3. закрываем соединения, иначе скрипт не завершится
