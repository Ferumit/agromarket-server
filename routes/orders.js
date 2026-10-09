import { Router } from 'express';
import { validateOrder } from '../middleware/validateOrder.js';

const router = Router();

// Пока храним заявки в памяти: при перезапуске сервера они пропадут.
// В следующей лабораторной переедем в базу данных.
const orders = [];
let nextId = 1;

// GET /api/orders — список заявок (чтобы проверять результат)
router.get('/', (req, res) => {
  res.json(orders);
});

// POST /api/orders — новая заявка.
// Проверка полей (обязательные поля, минимум 10 кг -> 400) вынесена в validateOrder
router.post('/', validateOrder, (req, res) => {
  const { name, email, phone, quantity, date, comment } = req.body;

  const order = {
    id: nextId++,
    name, email, phone, date, comment,
    quantity: Number(quantity),
    createdAt: new Date().toISOString(),
  };
  orders.push(order);

  res.status(201).json(order);
});

export default router;
