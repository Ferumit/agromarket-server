import jwt from 'jsonwebtoken';

// Пропускает дальше только запросы с действительным токеном
export function requireAuth(req, res, next) {
  // Заголовок выглядит так: Authorization: Bearer eyJhbGciOi...
  const header = req.headers.authorization || '';
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Требуется вход в систему' });
  }

  try {
    // verify проверяет подпись и срок действия; при ошибке — исключение
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: Number(payload.sub), role: payload.role };
    next();
  } catch (err) {
    const error = err.name === 'TokenExpiredError'
      ? 'Срок действия токена истёк, войдите снова'
      : 'Недействительный токен';
    return res.status(401).json({ error });
  }
}

// Пропускает дальше только пользователей с нужной ролью.
// Используется ПОСЛЕ requireAuth: requireRole('admin')
export function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    next();
  };
}

// Бонус: «вход по желанию». Есть действительный токен — заполняем req.user,
// нет токена или он не прошёл проверку — запрос идёт дальше как анонимный
export function optionalAuth(req, res, next) {
  const [type, token] = (req.headers.authorization || '').split(' ');
  if (type === 'Bearer' && token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.user = { id: Number(payload.sub), role: payload.role };
    } catch {
      // недействительный токен на открытом маршруте просто игнорируем
    }
  }
  next();
}
