import { z } from 'zod';

// Схемы входных данных (ЛР11). Сервер не доверяет ничему, что пришло от клиента:
// проверки в React-форме — для удобства, эти — для безопасности.
// Поля, которых нет в схеме (например, role), zod отбрасывает — защита от mass assignment

const email = z.string().trim().toLowerCase().pipe(z.email('Некорректный e-mail').max(254));

// bcrypt учитывает только первые 72 байта пароля, а без верхней границы длинный пароль
// заставит сервер долго считать хэш. Считаем байты, а не символы: кириллица — 2 байта
const password = z
  .string()
  .min(8, 'Пароль — минимум 8 символов')
  .refine((s) => Buffer.byteLength(s) <= 72, 'Пароль слишком длинный (не больше 72 байт)');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Имя — минимум 2 символа').max(100, 'Имя — не больше 100 символов'),
  email,
  password,
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Введите e-mail').max(254),
  password: z.string().min(1, 'Введите пароль').max(72),
});

export const passwordChangeSchema = z.object({
  oldPassword: z.string().min(1, 'Введите текущий пароль').max(72),
  newPassword: password,
});

// Цена в базе — INTEGER (тенге). coerce: строка "3500" из формы тоже подойдёт
export const productSchema = z.object({
  name: z.string().trim().min(2, 'Название — минимум 2 символа').max(200, 'Название — не больше 200 символов'),
  category: z.string().trim().min(1, 'Укажите категорию').max(50, 'Категория — не больше 50 символов'),
  price: z.coerce
    .number('Цена должна быть числом')
    .int('Цена — целое число тенге')
    .positive('Цена должна быть больше 0')
    .max(10_000_000, 'Цена — не больше 10 000 000'),
  unit: z.string().trim().min(1, 'Укажите единицу').max(20, 'Единица — не больше 20 символов').optional(),
  // Фото — только ссылка http(s): javascript:… или data:… в src не пройдут
  image: z
    .string()
    .trim()
    .max(500, 'Ссылка на фото — не больше 500 символов')
    .regex(/^https?:\/\//, 'Ссылка на фото должна начинаться с http:// или https://')
    .nullish(),
});

// Для PATCH: все поля необязательны, но хотя бы одно должно быть.
// Значения по умолчанию (unit = 'кг') здесь не задаём: иначе PATCH { price } молча менял бы unit
export const productUpdateSchema = productSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Нет полей для обновления');

// Заявка из формы на сайте — единственный открытый для всех POST, поэтому проверяем всё
export const orderSchema = z.object({
  // select «Товар» без выбора присылает '' — это «товар не указан», а не 0
  product_id: z.preprocess(
    (v) => (v === '' ? null : v),
    z.coerce.number().int().positive('Некорректный товар').nullish()
  ),
  name: z.string().trim().min(2, 'Имя — минимум 2 символа').max(100, 'Имя — не больше 100 символов'),
  email,
  phone: z.string().trim().max(30, 'Телефон — не больше 30 символов').optional(),
  quantity: z.coerce
    .number('Объём должен быть числом')
    .int('Объём — целое число')
    .min(10, 'Минимальный объём заказа — 10 кг')
    .max(100_000, 'Объём — не больше 100 000'),
  // input type="date" присылает '' (не выбрано) или ГГГГ-ММ-ДД
  date: z.union([z.literal(''), z.iso.date('Дата в формате ГГГГ-ММ-ДД')]).optional(),
  comment: z.string().trim().max(1000, 'Комментарий — не больше 1000 символов').optional(),
});

export const orderStatusSchema = z.object({
  status: z.enum(['new', 'processing', 'done', 'cancelled'], 'Статус: new, processing, done или cancelled'),
});
