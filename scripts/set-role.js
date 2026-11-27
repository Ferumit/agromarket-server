// scripts/set-role.js — назначить роль зарегистрированному пользователю (ЛР13).
// Фермером становятся не сами: человек регистрируется на сайте, администратор запускает
//   node scripts/set-role.js farmer@mail.kz farmer
//   node --env-file=.env.neon scripts/set-role.js farmer@mail.kz farmer   # продакшен
import 'dotenv/config';
import pg from 'pg';

const [email, role] = process.argv.slice(2);
if (!email || !['user', 'farmer', 'admin'].includes(role) || !process.env.DATABASE_URL) {
  console.error('Использование: node scripts/set-role.js <email> <user|farmer|admin> (нужен DATABASE_URL)');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
console.log('База:', new URL(process.env.DATABASE_URL).host);
await client.connect();
try {
  const { rows } = await client.query(
    'UPDATE users SET role = $1 WHERE email = $2 RETURNING id, name, email, role',
    [role, email.trim().toLowerCase()]
  );
  if (rows.length === 0) {
    console.error('Пользователь не найден:', email);
    process.exitCode = 1;
  } else {
    console.log('Готово:', rows[0]);
  }
} finally {
  await client.end();
}
