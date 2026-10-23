import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';

// Миграция НЕ удаляет данные: создаёт только то, чего ещё нет.
// Её можно запускать сколько угодно раз — результат один и тот же.
// Колонки — один в один как в db/schema.sql; orders ссылается на products
// и users, поэтому идёт последней
const statements = [
  `CREATE TABLE IF NOT EXISTS users (
     id             SERIAL PRIMARY KEY,
     name           TEXT NOT NULL,
     email          TEXT NOT NULL UNIQUE,
     password_hash  TEXT NOT NULL,
     role           TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
     created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS products (
     id          SERIAL PRIMARY KEY,
     name        TEXT NOT NULL,
     category    TEXT,
     price       INTEGER NOT NULL CHECK (price >= 0),
     unit        TEXT NOT NULL DEFAULT 'кг',
     image       TEXT,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS orders (
     id             SERIAL PRIMARY KEY,
     product_id     INTEGER REFERENCES products(id) ON DELETE SET NULL,
     user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
     name           TEXT NOT NULL,
     email          TEXT NOT NULL,
     phone          TEXT,
     quantity       INTEGER NOT NULL CHECK (quantity >= 10),
     delivery_date  DATE,
     comment        TEXT,
     status         TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'processing', 'done', 'cancelled')),
     created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
];

async function migrate() {
  for (const sql of statements) {
    await pool.query(sql);
  }

  // Администратор: создаём, только если заданы данные и его ещё нет
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('Администратор', $1, $2, 'admin')
       ON CONFLICT (email) DO NOTHING`,
      [ADMIN_EMAIL.toLowerCase(), hash]
    );
  }
  console.log(`Миграция выполнена (инструкций: ${statements.length})`);
}

migrate()
  .catch((err) => {
    console.error('Миграция не удалась:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
