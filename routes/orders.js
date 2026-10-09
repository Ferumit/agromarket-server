import { Router } from 'express';
import { pool } from '../db/pool.js';
import { validateOrder } from '../middleware/validateOrder.js';

const router = Router();

// GET /api/orders — заявки вместе с названием товара.
// Бонус: ?status=new — только заявки с нужным статусом, без параметра — все
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT o.*, p.name AS product_name
     FROM orders o
     LEFT JOIN products p ON p.id = o.product_id
     WHERE ($1::text IS NULL OR o.status = $1)
     ORDER BY o.created_at DESC`,
    [req.query.status || null]
  );
  res.json(rows);
});

// POST /api/orders — новая заявка (форма из React).
// Обязательные поля и минимум 10 кг проверяет validateOrder (ЛР5)
router.post('/', validateOrder, async (req, res) => {
  const { product_id, name, email, phone, quantity, date, comment } = req.body;

  // || null превращает пустую строку из формы в NULL: база не примет '' как дату или число
  const { rows } = await pool.query(
    `INSERT INTO orders (product_id, name, email, phone, quantity, delivery_date, comment)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [product_id || null, name, email, phone || null,
      quantity, date || null, comment || null]
  );
  res.status(201).json(rows[0]);
});

// PATCH /api/orders/3   тело: { "status": "processing" }
router.patch('/:id', async (req, res) => {
  const { status } = req.body || {};
  if (!status) {
    return res.status(400).json({ error: 'Поле status обязательно' });
  }

  // Список допустимых статусов проверяет CHECK в базе: 'lost' -> ошибка 23514 -> 400
  const { rows } = await pool.query(
    'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
    [status, req.params.id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Заявка не найдена' });
  }
  res.json(rows[0]);
});

export default router;
