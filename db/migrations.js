import { readdirSync, readFileSync } from 'node:fs';

// Все миграции из db/migrations по порядку номеров (013_…, 014_…).
// Каждый файл повторяемый (IF NOT EXISTS) и сам открывает транзакцию BEGIN … COMMIT,
// поэтому их можно применять при каждом запуске: уже применённые ничего не меняют
const dir = new URL('./migrations/', import.meta.url);

export async function applyMigrations(db) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    await db.query(readFileSync(new URL(file, dir), 'utf8'));
  }
  return files;
}
