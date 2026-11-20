// Проверка тела запроса по схеме zod (ЛР11):
// router.post('/', validate(productSchema), handler)
// Ошибка → 400 { error, details: [{ field, message }] } — React показывает details у полей формы
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    return res.status(400).json({
      error: 'Ошибка валидации',
      details: result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })),
    });
  }
  req.body = result.data; // дальше — только очищенные данные, лишние поля отброшены
  next();
};

// /:id должен быть целым положительным числом. Без этой проверки GET /api/products/abc
// доходил до PostgreSQL, и ответ собирался из ошибки базы (22P02) — а в режиме разработки
// в нём был и текст ошибки PostgreSQL
export const idParam = (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Некорректный id' });
  }
  req.params.id = id;
  next();
};
