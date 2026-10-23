import pg from 'pg';

// Тип DATE (код 1082) отдаём строкой 'YYYY-MM-DD'.
// Иначе pg превратит дату в объект Date, и из-за часового пояса она «уедет» на день.
pg.types.setTypeParser(1082, (value) => value);

// Пул — несколько готовых соединений с БД, которые переиспользуются между запросами
export const pool = new pg.Pool({
  // Локально и в CI — localhost; на Render — строка от Neon.
  // SSL включается параметром ?sslmode=require в самой строке
  connectionString: process.env.DATABASE_URL,
  max: 5,                          // бесплатным тарифам много соединений не нужно
  idleTimeoutMillis: 30_000,       // закрывать простаивающие соединения через 30 с
  connectionTimeoutMillis: 10_000, // спящая база просыпается — подождём
});

// Облачная база может сама разорвать соединение. Без этого обработчика
// такая ошибка завершает процесс, и сайт «падает»
pool.on('error', (err) => {
  console.error('PostgreSQL: соединение потеряно —', err.message);
});
