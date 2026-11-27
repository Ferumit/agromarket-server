// Заказы из корзины (ЛР13): транзакция, остатки, права, гонка за последний товар
import { describe, test, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { pool } from '../db/pool.js';
import { seedOrders, tokenFor, stockOf, ordersCountOf, getAdminToken } from './helpers.js';

let d; // данные из seedOrders(): farmer, buyer, buyer2, honey (10 шт.), potato (1 шт.)
beforeEach(async () => { d = await seedOrders(); });

const order = (user, body) =>
  request(app).post('/api/orders').set('Authorization', `Bearer ${tokenFor(user)}`).send(body);
const cancel = (user, id) =>
  request(app).post(`/api/orders/${id}/cancel`).set('Authorization', `Bearer ${tokenFor(user)}`);
const address = 'Астана, ул. Женис, 62';

describe('POST /api/orders', () => {
  test('создаёт заказ, считает сумму и уменьшает остаток', async () => {
    const res = await order(d.buyer, { items: [{ productId: d.honey.id, quantity: 2 }], address });
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(7000);
    expect(res.body.status).toBe('new');
    expect(await stockOf(d.honey.id)).toBe(8);
  });

  test('цену из запроса игнорирует — считает по базе', async () => {
    const res = await order(d.buyer, { items: [{ productId: d.honey.id, quantity: 1, price: 1 }], address, total: 1 });
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(3500);
  });

  test('одинаковые позиции складывает', async () => {
    const res = await order(d.buyer, { items: [
      { productId: d.honey.id, quantity: 2 }, { productId: d.honey.id, quantity: 3 }], address });
    expect(res.status).toBe(201);
    expect(res.body.items).toEqual([expect.objectContaining({ productId: d.honey.id, quantity: 5 })]);
  });

  test('не хватает одного товара — 409, и НИЧЕГО не меняется (откат)', async () => {
    const res = await order(d.buyer, { items: [
      { productId: d.honey.id, quantity: 2 }, { productId: d.potato.id, quantity: 5 }], address });
    expect(res.status).toBe(409);
    expect(res.body.details).toEqual([expect.objectContaining({ productId: d.potato.id, available: 1 })]);
    expect(await stockOf(d.honey.id)).toBe(10); // мёд не списан, хотя его хватало
    expect(await ordersCountOf(d.buyer)).toBe(0);
  });

  test('пустая корзина и количество 0 — 400 с details', async () => {
    const empty = await order(d.buyer, { items: [], address });
    expect(empty.status).toBe(400);
    expect(empty.body.details[0]).toMatchObject({ field: 'items', message: 'Корзина пуста' });

    const zero = await order(d.buyer, { items: [{ productId: d.honey.id, quantity: 0 }], address });
    expect(zero.status).toBe(400);
  });

  test('несуществующий товар — 404', async () => {
    const res = await order(d.buyer, { items: [{ productId: 999999, quantity: 1 }], address });
    expect(res.status).toBe(404);
  });

  test('без токена — 401', async () => {
    const res = await request(app).post('/api/orders').send({ items: [{ productId: d.honey.id, quantity: 1 }], address });
    expect(res.status).toBe(401);
  });

  test('гонка: последний картофель покупают двое одновременно — продаётся один раз', async () => {
    // «держим» строку картофеля в отдельной транзакции, чтобы оба заказа гарантированно пришли одновременно
    const blocker = await pool.connect();
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [d.potato.id]);

    const body = { items: [{ productId: d.potato.id, quantity: 1 }], address };
    const pending = Promise.all([order(d.buyer, body), order(d.buyer2, body)]);
    await new Promise((r) => setTimeout(r, 300)); // оба запроса дошли до базы и ждут
    await blocker.query('COMMIT');
    blocker.release();

    const results = await pending;
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await stockOf(d.potato.id)).toBe(0);
  });
});

describe('GET /api/orders/my и /incoming', () => {
  test('покупатель видит только свои заказы', async () => {
    await order(d.buyer, { items: [{ productId: d.honey.id, quantity: 1 }], address });
    await order(d.buyer2, { items: [{ productId: d.honey.id, quantity: 3 }], address });

    const res = await request(app).get('/api/orders/my').set('Authorization', `Bearer ${tokenFor(d.buyer)}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].items[0]).toMatchObject({ name: 'Мёд гречишный', quantity: 1, price: 3500 });
  });

  test('фермер видит заказы на свои товары, покупатель — 403', async () => {
    await order(d.buyer, { items: [{ productId: d.honey.id, quantity: 1 }], address });

    const farmer = await request(app).get('/api/orders/incoming').set('Authorization', `Bearer ${tokenFor(d.farmer)}`);
    expect(farmer.status).toBe(200);
    expect(farmer.body).toHaveLength(1); // товары других фермеров из прошлых тестов сюда не попали
    expect(farmer.body[0]).toMatchObject({ buyerName: 'Айгерим', product: 'Мёд гречишный', quantity: 1 });
    expect(farmer.body[0]).not.toHaveProperty('email'); // контакты покупателя фермеру не нужны

    const buyer = await request(app).get('/api/orders/incoming').set('Authorization', `Bearer ${tokenFor(d.buyer)}`);
    expect(buyer.status).toBe(403);
  });
});

describe('Отмена заказа', () => {
  test('отмена возвращает остаток, повторная — 409', async () => {
    const { body: created } = await order(d.buyer, { items: [{ productId: d.honey.id, quantity: 4 }], address });
    expect(await stockOf(d.honey.id)).toBe(6);

    const res = await cancel(d.buyer, created.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: created.id, status: 'cancelled' });
    expect(await stockOf(d.honey.id)).toBe(10);

    const again = await cancel(d.buyer, created.id);
    expect(again.status).toBe(409);
    expect(await stockOf(d.honey.id)).toBe(10); // второй раз на склад не вернули
  });

  test('чужой заказ — 404, а не 403, и он не отменён', async () => {
    const { body: created } = await order(d.buyer, { items: [{ productId: d.honey.id, quantity: 1 }], address });

    const res = await cancel(d.buyer2, created.id);
    expect(res.status).toBe(404);
    expect(await stockOf(d.honey.id)).toBe(9);
  });

  test('администратор отменяет заказ через PATCH — товар тоже возвращается', async () => {
    const { body: created } = await order(d.buyer, { items: [{ productId: d.potato.id, quantity: 1 }], address });
    const admin = await getAdminToken();
    const patch = (status) => request(app).patch(`/api/orders/${created.id}`)
      .set('Authorization', `Bearer ${admin}`).send({ status });

    expect((await patch('cancelled')).status).toBe(200);
    expect(await stockOf(d.potato.id)).toBe(1);
    expect((await patch('new')).status).toBe(409); // вернуть отменённый в работу нельзя
  });
});

describe('Товары фермера', () => {
  test('фермер меняет остаток своего товара, но не чужого', async () => {
    const own = await request(app).patch(`/api/products/${d.honey.id}`)
      .set('Authorization', `Bearer ${tokenFor(d.farmer)}`).send({ stock: 15 });
    expect(own.status).toBe(200);
    expect(own.body.stock).toBe(15);

    const other = await seedOrders(); // товары другого фермера
    const foreign = await request(app).patch(`/api/products/${other.honey.id}`)
      .set('Authorization', `Bearer ${tokenFor(d.farmer)}`).send({ stock: 0 });
    expect(foreign.status).toBe(403);
    expect(await stockOf(other.honey.id)).toBe(10);
  });

  test('товар с заказами удалить нельзя — 409', async () => {
    await order(d.buyer, { items: [{ productId: d.honey.id, quantity: 1 }], address });
    const res = await request(app).delete(`/api/products/${d.honey.id}`)
      .set('Authorization', `Bearer ${tokenFor(d.farmer)}`);
    expect(res.status).toBe(409);
  });
});
