import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { uniqueEmail, getAdminToken } from './helpers.js';

// ЛР11: схемы zod (validation/schemas.js) + middleware validate и idParam.
// «Нельзя стать админом через поле role» — в auth.test.js (mass assignment, ЛР8)
const fields = (res) => res.body.details.map((d) => d.field);
const honey = { name: 'Мёд', category: 'Мёд', price: 3500 };

describe('Валидация: регистрация', () => {
  it('некорректный e-mail → 400 и поле email в details', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Тест', email: 'не-почта', password: '12345678' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Ошибка валидации');
    expect(res.body.details).toContainEqual({ field: 'email', message: 'Некорректный e-mail' });
  });

  it('пароль из 7 символов и пароль длиннее 72 байт → 400', async () => {
    const short = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Тест', email: uniqueEmail(), password: '1234567' });
    // 40 кириллических букв = 80 байт: по символам прошло бы, по байтам — нет
    const long = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Тест', email: uniqueEmail(), password: 'ж'.repeat(40) });
    expect([short.status, long.status]).toEqual([400, 400]);
    expect(fields(short)).toEqual(['password']);
    expect(fields(long)).toEqual(['password']);
  });
});

describe('Валидация: товары', () => {
  let auth;
  beforeAll(async () => {
    auth = `Bearer ${await getAdminToken()}`;
  });

  it('цена -500 → 400 «Цена должна быть больше 0»', async () => {
    const res = await request(app)
      .post('/api/products').set('Authorization', auth)
      .send({ ...honey, price: -500 });
    expect(res.status).toBe(400);
    expect(res.body.details).toContainEqual({ field: 'price', message: 'Цена должна быть больше 0' });
  });

  it('название из 201 символа и фото javascript: → 400 по обоим полям', async () => {
    const res = await request(app)
      .post('/api/products').set('Authorization', auth)
      .send({ ...honey, name: 'м'.repeat(201), image: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
    expect(fields(res).sort()).toEqual(['image', 'name']);
  });

  it('GET /api/products/abc и /-1 → 400, а не 500 и не ошибка базы', async () => {
    for (const id of ['abc', '-1', '1.5']) {
      const res = await request(app).get(`/api/products/${id}`);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Некорректный id' });
    }
  });

  it('PATCH с пустым телом {} → 400', async () => {
    const res = await request(app)
      .patch('/api/products/1').set('Authorization', auth).send({});
    expect(res.status).toBe(400);
    expect(res.body.details[0].message).toBe('Нет полей для обновления');
  });

  it('PATCH меняет только присланное поле, лишние поля (id) отброшены', async () => {
    const created = await request(app)
      .post('/api/products').set('Authorization', auth).send({ ...honey, unit: 'л' });
    const { id } = created.body;

    const res = await request(app)
      .patch(`/api/products/${id}`).set('Authorization', auth)
      .send({ price: '3900', id: 1 });   // строка из формы → число; id в схеме нет
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, name: 'Мёд', price: 3900, unit: 'л' });

    await request(app).delete(`/api/products/${id}`).set('Authorization', auth);
  });

  it('тело больше 10 КБ → 413', async () => {
    const res = await request(app)
      .post('/api/products').set('Authorization', auth)
      .send({ ...honey, name: 'x'.repeat(200_000) });
    expect(res.status).toBe(413);
  });
});

describe('Валидация: заявки', () => {
  it('объём 5 кг и e-mail без @ → 400 по двум полям', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ name: 'Иван', email: 'ivan', quantity: 5 });
    expect(res.status).toBe(400);
    expect(fields(res).sort()).toEqual(['email', 'quantity']);
  });

  it('форма без выбранного товара (product_id: "") и даты — заявка принимается', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ product_id: '', name: 'Иван', email: 'ivan@mail.kz', quantity: '25', date: '' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ product_id: null, quantity: 25, delivery_date: null });
  });
});
