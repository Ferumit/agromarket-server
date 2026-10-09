// Коды ошибок PostgreSQL, которые означают «клиент прислал плохие данные»
const PG_CLIENT_ERRORS = {
  '22P02': 'Неверный формат значения', // 'abc' вместо числа
  '23502': 'Не заполнено обязательное поле', // NOT NULL
  '23503': 'Связанная запись не найдена', // FOREIGN KEY
  '23514': 'Значение не проходит проверку в БД', // CHECK
};

// 4 параметра — так Express понимает, что это обработчик ошибок
export function errorHandler(err, req, res, next) {
  // Ошибки express.json(): тело больше лимита или битый JSON
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Слишком большой запрос' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Некорректный JSON в теле запроса' });
  }

  // 23505 — нарушение UNIQUE: такая запись уже есть
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Такая запись уже существует' });
  }

  if (PG_CLIENT_ERRORS[err.code]) {
    return res.status(400).json({
      error: PG_CLIENT_ERRORS[err.code],
      detail: err.message,
    });
  }

  console.error(err); // полную ошибку видит только разработчик в терминале
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
}
