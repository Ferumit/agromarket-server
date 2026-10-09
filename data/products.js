import { readFileSync } from 'node:fs';

// Читаем db.json один раз — при запуске сервера.
// Путь считается от папки, из которой запущен npm run dev
const db = JSON.parse(readFileSync('./data/db.json', 'utf-8'));

export const products = db.products;
