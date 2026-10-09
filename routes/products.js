import { Router } from 'express';
import { products } from '../data/products.js';

const router = Router();

// Пути — ОТНОСИТЕЛЬНО точки подключения роутера:
//   '/'    ->  /api/products
//   '/:id' ->  /api/products/:id
router.get('/', (req, res) => {
  const search = (req.query.search || '').toLowerCase();

  // Пустая строка входит в любую строку, поэтому без ?search= вернутся все товары
  let result = products.filter((p) => p.name.toLowerCase().includes(search));

  // Бонус: ?maxPrice=1000 — работает вместе с search
  const maxPrice = Number(req.query.maxPrice);
  if (req.query.maxPrice && !Number.isNaN(maxPrice)) {
    result = result.filter((p) => p.price <= maxPrice);
  }

  // Бонус: ?sort=price — по возрастанию цены, ?sort=-price — по убыванию.
  // .sort() меняет исходный массив, поэтому сортируем копию
  if (req.query.sort === 'price') {
    result = [...result].sort((a, b) => a.price - b.price);
  } else if (req.query.sort === '-price') {
    result = [...result].sort((a, b) => b.price - a.price);
  }

  res.json(result);
});

// Один товар по id:  /api/products/2
router.get('/:id', (req, res) => {
  const product = products.find((p) => String(p.id) === req.params.id);

  if (!product) {
    return res.status(404).json({ error: 'Товар не найден' });
  }
  res.json(product);
});

export default router;
