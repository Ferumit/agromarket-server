import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import { pool } from '../db/pool.js';

// Уникальный e-mail: тесты можно запускать сколько угодно раз без 409
export function uniqueEmail(prefix = 'user') {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}@test.kz`;
}

// Регистрирует нового покупателя и возвращает его токен
export async function getUserToken() {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Тестовый покупатель', email: uniqueEmail(), password: 'qwerty123' });
  return res.body.token;
}

// Входит администратором (данные из .env.test) и возвращает токен
export async function getAdminToken() {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  return res.body.token;
}

// ---------- Заказы (ЛР13) ----------
// Данные создаём SQL-запросами, без TRUNCATE: база одна на все файлы тестов, и стирать
// таблицы целиком нельзя (пропал бы администратор из .env.test). У каждого теста свои
// пользователи и товары, поэтому тесты не мешают друг другу
export const tokenFor = (user) =>
  jwt.sign({ sub: String(user.id), role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

async function createUser(name, role) {
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, '-', $3) RETURNING id, role`,
    [name, uniqueEmail(role), role]
  );
  return user;
}

export async function seedOrders() {
  // пароль не нужен: токен подписываем сами (tokenFor)
  const farmer = await createUser('Ержан', 'farmer');
  const buyer = await createUser('Айгерим', 'user');
  const buyer2 = await createUser('Данияр', 'user');
  const product = async (name, price, stock) => (await pool.query(
    `INSERT INTO products (name, price, category, farmer_id, stock) VALUES ($1, $2, 'Тест', $3, $4) RETURNING id`,
    [name, price, farmer.id, stock]
  )).rows[0];
  const honey = await product('Мёд гречишный', 3500, 10);
  const potato = await product('Картофель молодой', 250, 1);
  return { farmer, buyer, buyer2, honey, potato };
}

export const stockOf = async (id) =>
  (await pool.query('SELECT stock FROM products WHERE id = $1', [id])).rows[0].stock;

export const ordersCountOf = async (user) =>
  Number((await pool.query('SELECT count(*) FROM orders WHERE user_id = $1', [user.id])).rows[0].count);
