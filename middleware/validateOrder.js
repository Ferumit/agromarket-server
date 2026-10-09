// Middleware на уровне маршрута: проверяет тело заявки до обработчика.
// Подключается так: router.post('/', validateOrder, (req, res) => { ... })
export function validateOrder(req, res, next) {
  // || {} — защита: если тело не пришло, req.body будет undefined
  const { name, email, quantity } = req.body || {};

  if (!name || !email || !quantity) {
    return res.status(400).json({ error: 'Поля name, email и quantity обязательны' });
  }

  // NaN тоже отсекаем: Number('abc') < 10 даёт false, и такая заявка прошла бы
  const qty = Number(quantity);
  if (Number.isNaN(qty) || qty < 10) {
    return res.status(400).json({ error: 'Минимальный объём заказа — 10 кг' });
  }

  next(); // данные в порядке — передаём запрос обработчику маршрута
}
