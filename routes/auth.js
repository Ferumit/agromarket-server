import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { loginLimiter, registerLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, passwordChangeSchema, registerSchema } from '../validation/schemas.js';

const router = Router();

// Выпускает токен: внутри id и роль, подпись — нашим секретным ключом
function createToken(user) {
  return jwt.sign(
    { sub: String(user.id), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '2h' }
  );
}

// POST /api/auth/register  { name, email, password }
// Лимит — первым: запросы сверх лимита даже не проверяются. Затем схема: в req.body
// остаются только name, email (обрезан, в нижнем регистре) и password
router.post('/register', registerLimiter, validate(registerSchema), async (req, res) => {
  const { name, email, password } = req.body;
  const passwordHash = await bcrypt.hash(password, 10);

  // role схема отбросила, а база поставит DEFAULT 'user'
  // (иначе любой прислал бы "role": "admin" — mass assignment)
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, name, email, role, created_at`,
    [name, email, passwordHash]
  );
  const user = rows[0];

  // Сразу после регистрации пользователь считается вошедшим
  res.status(201).json({ user, token: createToken(user) });
});

// POST /api/auth/login  { email, password }
// Защита от подбора пароля — loginLimiter (middleware/rateLimit.js)
router.post('/login', loginLimiter, validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];

  // Пользователь найден И пароль совпал с хэшем.
  // Одно сообщение на обе ошибки: нельзя перебором узнать, какие e-mail зарегистрированы
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  // Убираем хэш из объекта перед отправкой клиенту
  const { password_hash, ...safeUser } = user;
  res.json({ user: safeUser, token: createToken(safeUser) });
});

// GET /api/auth/me — нужен токен
router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
    [req.user.id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  res.json(rows[0]);
});

// Бонус: PATCH /api/auth/password  { oldPassword, newPassword } — нужен токен
router.patch('/password', requireAuth, validate(passwordChangeSchema), async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const { rows } = await pool.query(
    'SELECT password_hash FROM users WHERE id = $1',
    [req.user.id]
  );
  const ok = rows[0] && (await bcrypt.compare(oldPassword, rows[0].password_hash));
  if (!ok) {
    return res.status(401).json({ error: 'Неверный текущий пароль' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.user.id]);
  res.status(204).end();
});

export default router;
