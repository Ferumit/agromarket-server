import { describe, it, expect, vi, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { errorHandler } from '../middleware/errorHandler.js';

// «Поддельный» объект ответа: запоминает, какие методы и с чем вызывали
function mockRes() {
  const res = {};
  res.status = vi.fn(() => res);   // возвращает res, чтобы работало res.status(403).json(...)
  res.json = vi.fn(() => res);
  return res;
}

describe('requireRole', () => {
  it('пропускает нужную роль', () => {
    const req = { user: { id: 1, role: 'admin' } };
    const res = mockRes();
    const next = vi.fn();

    requireRole('admin')(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('другой роли отвечает 403 и не вызывает next', () => {
    const req = { user: { id: 2, role: 'user' } };
    const res = mockRes();
    const next = vi.fn();

    requireRole('admin')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireAuth', () => {
  it('без заголовка Authorization — 401', () => {
    const res = mockRes();
    const next = vi.fn();

    requireAuth({ headers: {} }, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('с верным токеном заполняет req.user', () => {
    const token = jwt.sign({ sub: '7', role: 'user' }, process.env.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const next = vi.fn();

    requireAuth(req, mockRes(), next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual({ id: 7, role: 'user' });
  });

  it('истёкший токен — 401 и сообщение «истёк»', () => {
    const token = jwt.sign(
      { sub: '7', role: 'user', exp: Math.floor(Date.now() / 1000) - 60 },
      process.env.JWT_SECRET
    );
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].error).toMatch(/истёк/);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('errorHandler', () => {
  afterEach(() => vi.unstubAllEnvs());   // вернуть NODE_ENV после каждого теста

  it('в продакшене скрывает текст ошибки 500', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(console, 'error').mockImplementation(() => {});   // не засорять вывод тестов
    const res = mockRes();
    const err = new Error('connect ECONNREFUSED 10.0.0.5:5432');

    errorHandler(err, { method: 'GET', originalUrl: '/x' }, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].error).toBe('Внутренняя ошибка сервера');
    console.error.mockRestore();
  });

  it('ошибку 400 отдаёт клиенту со своим текстом даже в продакшене', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = mockRes();
    const err = new Error('Поле name обязательно');
    err.status = 400;

    errorHandler(err, { method: 'POST', originalUrl: '/x' }, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toBe('Поле name обязательно');
  });
});
