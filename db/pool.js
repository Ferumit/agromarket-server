import pg from 'pg';

// Тип DATE (код 1082) отдаём строкой 'YYYY-MM-DD'.
// Иначе pg превратит дату в объект Date, и из-за часового пояса она «уедет» на день.
pg.types.setTypeParser(1082, (value) => value);

// Пул — несколько готовых соединений с БД, которые переиспользуются между запросами
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
