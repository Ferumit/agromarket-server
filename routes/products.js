import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { idParam, validate } from '../middleware/validate.js';
import { productSchema, productUpdateSchema } from '../validation/schemas.js';

const router = Router();
// Товары меняют администратор и фермеры (ЛР13); цепочка из двух middleware
const managers = [requireAuth, requireRole('admin', 'farmer')];

// Фермер меняет только свои товары, администратор — любые.
// Товар публичный, поэтому на чужой честно отвечаем 403, а не прячем его за 404
async function ownProduct(req, res, next) {
  const { rows } = await pool.query('SELECT farmer_id FROM products WHERE id = $1', [req.params.id]);
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Товар не найден' });
  }
  if (req.user.role === 'farmer' && rows[0].farmer_id !== req.user.id) {
    return res.status(403).json({ error: 'Можно менять только свои товары' });
  }
  next();
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

// GET /api/products/2  (idParam: /abc или /-1 → 400 ещё до базы)
router.get('/:id', idParam, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM products WHERE id = $1',
    [req.params.id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Товар не найден' });
  }
  res.json(rows[0]);
});

// POST /api/products — новый товар (admin или farmer).
// Порядок: сначала кто ты (401/403), потом что прислал (400) — чужим не рассказываем о схеме.
// Владельца берём из токена, а не из тела: farmer_id в схеме нет (mass assignment)
router.post('/', managers, validate(productSchema), async (req, res) => {
  const { name, category, price, unit, image, stock } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO products (name, category, price, unit, image, stock, farmer_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [name, category, price, unit ?? 'кг', image ?? null, stock ?? 0,
      req.user.role === 'farmer' ? req.user.id : null]
  );
  res.status(201).json(rows[0]); // вернули созданный товар вместе с новым id
});

// PUT /api/products/5 — заменить товар целиком (admin или фермер-владелец)
router.put('/:id', managers, idParam, validate(productSchema), ownProduct, async (req, res) => {
  const { name, category, price, unit, image, stock } = req.body;
  const { rows } = await pool.query(
    `UPDATE products
     SET name = $1, category = $2, price = $3, unit = $4, image = $5, stock = COALESCE($6, stock)
     WHERE id = $7
     RETURNING *`,
    [name, category, price, unit ?? 'кг', image ?? null, stock ?? null, req.params.id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Товар не найден' });
  }
  res.json(rows[0]);
});

// PATCH /api/products/5 — изменить только присланные поля (ЛР11; admin или фермер-владелец):
// { "price": 3900 }, { "stock": 15 }
router.patch('/:id', managers, idParam, validate(productUpdateSchema), ownProduct, async (req, res) => {
  // Имена столбцов — ключи, которые пропустила схема (белый список полей),
  // значения передаются параметрами $1, $2 … — SQL-инъекции здесь нет
  const fields = Object.keys(req.body);
  const set = fields.map((field, i) => `${field} = $${i + 1}`).join(', ');
  const { rows } = await pool.query(
    `UPDATE products SET ${set} WHERE id = $${fields.length + 1} RETURNING *`,
    [...Object.values(req.body), req.params.id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Товар не найден' });
  }
  res.json(rows[0]);
});

// DELETE /api/products/5 (admin или фермер-владелец)
router.delete('/:id', managers, idParam, ownProduct, async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
  } catch (err) {
    // 23503: на товар ссылаются позиции заказов (order_items). Удалить его — значит испортить
    // историю заказов, поэтому база не даёт. Такой товар можно снять с продажи: stock = 0
    if (err.code === '23503') {
      return res.status(409).json({ error: 'По товару есть заказы — удалить нельзя. Поставьте остаток 0' });
    }
    throw err;
  }
  res.status(204).end(); // успешно, но тела ответа нет
});

export default router;
