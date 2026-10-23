import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';

describe('GET /api/health', () => {
  it('отвечает 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('сообщает, что база доступна, и показывает версию', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body.db).toBe('ok');
    expect(res.body.version).toBe('local');   // локально и в CI нет RENDER_GIT_COMMIT
  });

  it('CORS: разрешённый адрес получает заголовок', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('CORS: чужой адрес заголовка не получает', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
