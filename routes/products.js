import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

// Возвращает текст ошибки или null, если всё в порядке
function validateProduct(body) {
  const { name, price } = body;
  if (!name || !String(name).trim()) return 'Поле name обязательно';
  const n = Number(price);
  if (price === undefined || price === '' || !Number.isInteger(n) || n < 0) {
    return 'Поле price должно быть целым числом ≥ 0';
  }
  return null;
}

// Бонус: сортировка. Имя столбца нельзя передать через $1 — параметрами передаются
// только значения, поэтому в SQL попадает только строка из этого «белого списка»
const SORTS = {
  price: 'price ASC',
  '-price': 'price DESC',
  name: 'name ASC',
  '-name': 'name DESC',
};

// GET /api/products?search=мол&maxPrice=1000&sort=-price&limit=10&offset=0
router.get('/', async (req, res) => {
  const search = req.query.search || '';
  const maxPrice = req.query.maxPrice || null; // NULL — без ограничения цены
  const orderBy = SORTS[req.query.sort] || 'id';

  // Бонус: пагинация. По умолчанию 20 товаров, не больше 100 за раз
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);

  const { rows } = await pool.query(
    `SELECT * FROM products
     WHERE name ILIKE $1 AND ($2::int IS NULL OR price <= $2)
     ORDER BY ${orderBy}
     LIMIT $3 OFFSET $4`,
    [`%${search}%`, maxPrice, limit, offset]
  );
  res.json(rows);
});

// GET /api/products/2
router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM products WHERE id = $1',
    [req.params.id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Товар не найден' });
  }
  res.json(rows[0]);
});

// POST /api/products — новый товар
router.post('/', async (req, res) => {
  const body = req.body || {};
  const error = validateProduct(body);
  if (error) return res.status(400).json({ error });

  const { name, category, price, unit, image } = body;
  const { rows } = await pool.query(
    `INSERT INTO products (name, category, price, unit, image)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [name, category ?? null, Number(price), unit ?? 'кг', image ?? null]
  );
  res.status(201).json(rows[0]); // вернули созданный товар вместе с новым id
});

// PUT /api/products/5 — заменить товар целиком
router.put('/:id', async (req, res) => {
  const body = req.body || {};
  const error = validateProduct(body);
  if (error) return res.status(400).json({ error });

  const { name, category, price, unit, image } = body;
  const { rows } = await pool.query(
    `UPDATE products
     SET name = $1, category = $2, price = $3, unit = $4, image = $5
     WHERE id = $6
     RETURNING *`,
    [name, category ?? null, Number(price), unit ?? 'кг', image ?? null, req.params.id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Товар не найден' });
  }
  res.json(rows[0]);
});

// DELETE /api/products/5
router.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query(
    'DELETE FROM products WHERE id = $1',
    [req.params.id]
  );
  if (rowCount === 0) {
    return res.status(404).json({ error: 'Товар не найден' });
  }
  res.status(204).end(); // успешно, но тела ответа нет
});

export default router;
