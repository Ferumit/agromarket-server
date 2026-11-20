import { rateLimit } from 'express-rate-limit';

// Ограничители частоты запросов (ЛР7, ЛР11). Счётчики хранятся в памяти процесса:
// перезапуск сервера (или новый деплой на Render) их обнуляет

// Вход: не больше 5 НЕУДАЧНЫХ попыток за 15 минут с одного IP. Успешные входы не считаются,
// поэтому тот, кто помнит пароль, не упрётся в лимит, а перебор упрётся через 5 попыток
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  message: { error: 'Слишком много попыток входа. Попробуйте через 15 минут' },
  standardHeaders: 'draft-8', // заголовки RateLimit и RateLimit-Policy, при 429 — Retry-After
  legacyHeaders: false,       // старые X-RateLimit-* не нужны
});

// Регистрация: не больше 10 запросов за 15 минут с одного IP (ЛР11) — против
// массового создания аккаунтов. Тесты сервера регистрируют десятки пользователей,
// поэтому при NODE_ENV=test этот лимит не действует
export const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: 'Слишком много регистраций. Попробуйте через 15 минут' },
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});
