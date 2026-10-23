import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

// GET /api/categories — категории и количество товаров в каждой
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT category AS name, COUNT(*)::int AS count
         FROM products
        GROUP BY category
        ORDER BY category`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
