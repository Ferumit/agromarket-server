export function logger(req, res, next) {
  const start = Date.now();

  // Событие 'finish' наступает, когда ответ уже отправлен клиенту
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms} мс)`);
  });

  next(); // передаём запрос следующему звену
}
