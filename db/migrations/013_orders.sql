-- 013_orders.sql — заказы из корзины (ЛР13). Скрипт можно запускать повторно: он ничего не сломает.
-- Миграция только добавляет и ослабляет ограничения: код v1.0.0 с новой схемой работает,
-- поэтому откат кода (Instant Rollback на Render) безопасен.
BEGIN;

-- Роль фермера: он продаёт свои товары и видит заказы на них
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin', 'farmer'));

-- Остаток на складе; CHECK — последняя линия защиты от «минус 3 банок мёда»
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock integer NOT NULL DEFAULT 0;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_stock_check;
ALTER TABLE products ADD CONSTRAINT products_stock_check CHECK (stock >= 0);
-- Владелец товара. У товаров из ЛР6 его нет (NULL) — ими управляет администратор
ALTER TABLE products ADD COLUMN IF NOT EXISTS farmer_id integer REFERENCES users(id) ON DELETE SET NULL;

-- Заказ из корзины хранится в той же таблице orders, что и оптовая заявка из ЛР6:
-- у обоих есть покупатель, контакты, статус и дата. Товары и количества заказа из корзины —
-- в order_items, поэтому quantity у него NULL (CHECK quantity >= 10 значение NULL пропускает)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total integer CHECK (total > 0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE orders ALTER COLUMN quantity DROP NOT NULL;

-- Позиции заказа; price — цена НА МОМЕНТ заказа, а не ссылка на текущую цену товара
CREATE TABLE IF NOT EXISTS order_items (
  order_id   integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id integer NOT NULL REFERENCES products(id),
  quantity   integer NOT NULL CHECK (quantity > 0),
  price      integer NOT NULL CHECK (price > 0),
  PRIMARY KEY (order_id, product_id)
);

CREATE INDEX IF NOT EXISTS orders_user_id_idx ON orders (user_id);
CREATE INDEX IF NOT EXISTS order_items_product_id_idx ON order_items (product_id);
CREATE INDEX IF NOT EXISTS products_farmer_id_idx ON products (farmer_id);

COMMIT;
