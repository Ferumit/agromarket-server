import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth.js';
import { idParam, validate } from '../middleware/validate.js';
import { cartOrderSchema, orderSchema, orderStatusSchema } from '../validation/schemas.js';

const router = Router();
const adminOnly = [requireAuth, requireRole('admin')]; // заявки — персональные данные клиентов

// В таблице orders два вида записей: оптовая заявка из формы (ЛР6: product_id, quantity ≥ 10)
// и заказ из корзины (ЛР13: total, address, позиции в order_items). Позиции отдаём полем items:
// [{ productId, name, quantity, price }], у оптовой заявки — []
const ITEMS = `COALESCE((
    SELECT json_agg(json_build_object('productId', i.product_id, 'name', ip.name,
                    'quantity', i.quantity, 'price', i.price) ORDER BY ip.name)
      FROM order_items i
      JOIN products ip ON ip.id = i.product_id
     WHERE i.order_id = o.id), '[]') AS items`;

// Вернуть на склад товары заказа (отмена). Сначала блокируем строки товаров по возрастанию id —
// в том же порядке, что и оформление заказа, иначе две транзакции могут ждать друг друга вечно
async function returnStock(client, orderId) {
  await client.query(
    `SELECT p.id FROM products p JOIN order_items i ON i.product_id = p.id
      WHERE i.order_id = $1 ORDER BY p.id FOR UPDATE OF p`,
    [orderId]
  );
  await client.query(
    `UPDATE products p SET stock = p.stock + i.quantity
       FROM order_items i
      WHERE i.order_id = $1 AND p.id = i.product_id`,
    [orderId]
  );
}

// Транзакция в ОДНОМ соединении: BEGIN, запросы, COMMIT. pool.query так не умеет — каждый его
// вызов может уйти в другое соединение. work возвращает ответ { status, body }: 2xx — COMMIT,
// иначе ROLLBACK. Отвечаем клиенту только ПОСЛЕ COMMIT: если он не прошёл, «201» не уйдёт
async function inTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query(result.status < 300 ? 'COMMIT' : 'ROLLBACK');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err; // Express 5 сам передаст ошибку в errorHandler
  } finally {
    client.release(); // вернуть соединение в пул — иначе через 5 заказов API «зависнет» (max: 5)
  }
}

// GET /api/orders — все заявки и заказы вместе с товарами (только admin).
// Бонус ЛР6: ?status=new — только заявки с нужным статусом, без параметра — все
router.get('/', adminOnly, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT o.*, p.name AS product_name, ${ITEMS}
     FROM orders o
     LEFT JOIN products p ON p.id = o.product_id
     WHERE ($1::text IS NULL OR o.status = $1)
     ORDER BY o.created_at DESC, o.id DESC`,
    [req.query.status || null]
  );
  res.json(rows);
});

// GET /api/orders/my — заявки и заказы текущего пользователя.
// Объявлен ДО маршрутов с /:id, иначе 'my' приняли бы за id
router.get('/my', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT o.*, p.name AS product_name, ${ITEMS}
     FROM orders o
     LEFT JOIN products p ON p.id = o.product_id
     WHERE o.user_id = $1
     ORDER BY o.created_at DESC, o.id DESC`,
    [req.user.id]
  );
  res.json(rows);
});

// GET /api/orders/incoming — фермер видит позиции заказов на СВОИ товары (ЛР13).
// Из данных покупателя — только имя и адрес: их хватает, чтобы собрать и отправить заказ.
// E-mail, телефон и остальные товары заказа (у других фермеров) ему не нужны
router.get('/incoming', requireAuth, requireRole('farmer'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT o.id AS "orderId", o.status, o.created_at, o.address,
            o.name AS "buyerName", p.name AS product, i.quantity, i.price
       FROM order_items i
       JOIN products p ON p.id = i.product_id
       JOIN orders o ON o.id = i.order_id
      WHERE p.farmer_id = $1
      ORDER BY o.created_at DESC, o.id DESC, p.name`,
    [req.user.id]
  );
  res.json(rows);
});

// POST /api/orders с { items, address } — заказ из корзины (ЛР13).
// Тело без items — оптовая заявка из формы (ЛР6): next('route') передаёт её следующему маршруту.
// Так старый React (v1.0.0) работает с новым API, пока Vercel не выложил новую версию
const isCartOrder = (req, res, next) => (Array.isArray(req.body?.items) ? next() : next('route'));

router.post('/', isCartOrder, requireAuth, validate(cartOrderSchema), async (req, res) => {
  // одинаковые товары складываем: [{id 1, 2 шт}, {id 1, 3 шт}] → {id 1: 5 шт}
  const wanted = new Map();
  for (const { productId, quantity } of req.body.items) {
    wanted.set(productId, (wanted.get(productId) || 0) + quantity);
  }
  const ids = [...wanted.keys()];

  const { status: code, body } = await inTransaction(async (client) => {
    // FOR UPDATE блокирует строки этих товаров до COMMIT: второй заказ на тот же товар подождёт.
    // ORDER BY id — все транзакции блокируют строки в одном порядке, взаимной блокировки не будет
    const { rows: products } = await client.query(
      'SELECT id, name, price, stock FROM products WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE',
      [ids]
    );
    if (products.length !== ids.length) {
      return { status: 404, body: { error: 'Товар не найден' } };
    }

    const shortage = products
      .filter((p) => p.stock < wanted.get(p.id))
      .map((p) => ({ productId: p.id, name: p.name, available: p.stock }));
    if (shortage.length > 0) {
      return { status: 409, body: { error: 'Недостаточно товара', details: shortage } };
    }

    // цену берём из базы, а не из запроса: клиенту верить нельзя (ЛР11)
    const total = products.reduce((sum, p) => sum + p.price * wanted.get(p.id), 0);
    // имя и e-mail покупателя тоже копируем в заказ: как и цена, они — на момент заказа
    const { rows: [order] } = await client.query(
      `INSERT INTO orders (user_id, name, email, total, address)
       SELECT id, name, email, $2, $3 FROM users WHERE id = $1
       RETURNING id, status, total, address, created_at`,
      [req.user.id, total, req.body.address]
    );
    if (!order) { // токен действителен, а пользователя уже удалили
      return { status: 401, body: { error: 'Пользователь не найден, войдите снова' } };
    }

    for (const p of products) {
      const quantity = wanted.get(p.id);
      await client.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
        [order.id, p.id, quantity, p.price]
      );
      await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [quantity, p.id]);
    }

    const items = products.map((p) => ({ productId: p.id, name: p.name, quantity: wanted.get(p.id), price: p.price }));
    return { status: 201, body: { ...order, items } };
  });
  res.status(code).json(body);
});

// POST /api/orders — оптовая заявка (форма из React), доступна всем.
// optionalAuth: если клиент вошёл, заявка привязывается к нему (user_id).
// Поля проверяет схема orderSchema (ЛР11; в ЛР5 — validateOrder): обязательные name, email,
// quantity ≥ 10, длина строк ограничена — это единственный POST, открытый всем
router.post('/', optionalAuth, validate(orderSchema), async (req, res) => {
  const { product_id, name, email, phone, quantity, date, comment } = req.body;

  // || null превращает пустую строку из формы в NULL: база не примет '' как дату или число
  const { rows } = await pool.query(
    `INSERT INTO orders (product_id, user_id, name, email, phone, quantity, delivery_date, comment)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [product_id || null, req.user?.id ?? null, name, email, phone || null,
      quantity, date || null, comment || null]
  );
  res.status(201).json(rows[0]);
});

// POST /api/orders/5/cancel — покупатель отменяет свой новый заказ (ЛР13), одна транзакция
router.post('/:id/cancel', requireAuth, idParam, async (req, res) => {
  const { status: code, body } = await inTransaction(async (client) => {
    const { rows: [order] } = await client.query(
      'SELECT id, user_id, status FROM orders WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    // Чужой заказ — 404, а не 403: не говорим постороннему, что такой заказ существует (IDOR, ЛР11)
    if (!order || order.user_id !== req.user.id) {
      return { status: 404, body: { error: 'Заказ не найден' } };
    }
    if (order.status !== 'new') {
      return { status: 409, body: { error: 'Заказ уже нельзя отменить' } };
    }
    await returnStock(client, order.id);
    await client.query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [order.id]);
    return { status: 200, body: { id: order.id, status: 'cancelled' } };
  });
  res.status(code).json(body);
});

// PATCH /api/orders/3   тело: { "status": "processing" }  (только admin).
// Отмена заказа из корзины возвращает товар на склад — в той же транзакции
router.patch('/:id', adminOnly, idParam, validate(orderStatusSchema), async (req, res) => {
  const { status } = req.body;

  const { status: code, body } = await inTransaction(async (client) => {
    const { rows: [order] } = await client.query(
      'SELECT id, status FROM orders WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (!order) {
      return { status: 404, body: { error: 'Заявка не найдена' } };
    }
    const { rows: [{ has_items: hasItems }] } = await client.query(
      'SELECT EXISTS (SELECT 1 FROM order_items WHERE order_id = $1) AS has_items',
      [order.id]
    );
    // Товар отменённого заказа уже вернулся на склад и мог быть продан снова
    if (hasItems && order.status === 'cancelled' && status !== 'cancelled') {
      return { status: 409, body: { error: 'Отменённый заказ нельзя вернуть в работу — оформите новый' } };
    }
    if (hasItems && status === 'cancelled' && order.status !== 'cancelled') {
      await returnStock(client, order.id);
    }
    // Список статусов проверяет схема, второй рубеж — CHECK в базе
    const { rows } = await client.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [status, order.id]
    );
    return { status: 200, body: rows[0] };
  });
  res.status(code).json(body);
});

export default router;
