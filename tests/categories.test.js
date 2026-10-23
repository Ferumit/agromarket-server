import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';

describe('GET /api/categories', () => {
  it('возвращает массив категорий с количеством', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(typeof res.body[0].count).toBe('number');   // ::int — число, а не строка
  });

  it('сумма count по категориям равна числу товаров в каталоге', async () => {
    const categories = await request(app).get('/api/categories');
    const products = await request(app).get('/api/products?limit=100');

    const total = categories.body.reduce((sum, c) => sum + c.count, 0);
    expect(total).toBe(products.body.length);
  });
});
