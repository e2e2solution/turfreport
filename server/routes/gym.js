import { Router } from 'express';
import db from '../db.js';
import { parseNum } from '../utils/excel.js';
import { calcGymEndDate } from '../utils/dates.js';
import { appendAnyPayment } from '../utils/reportQuery.js';

const router = Router();

router.get('/', (req, res) => {
  const { date, start_date, status, filter_type } = req.query;
  let sql = 'SELECT * FROM gym_entries WHERE 1=1';
  const params = [];

  if (filter_type === 'payment' && date) {
    sql = appendAnyPayment(sql, params, null, null, date);
  } else if (start_date) {
    sql += ' AND start_date = ?';
    params.push(start_date);
  } else if (date) {
    sql += ' AND (advance_date = ? OR balance_date = ? OR start_date = ? OR end_date = ?)';
    params.push(date, date, date, date);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += ' ORDER BY start_date DESC, id DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM gym_entries WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.post('/', (req, res) => {
  try {
    const b = req.body;
    const planMonths = Number(b.plan_months) || 1;
    const startDate = b.start_date;
    const endDate = b.end_date || calcGymEndDate(startDate, planMonths);

    if (!b.name || !startDate || !b.total) {
      return res.status(400).json({ error: 'name, start_date, total are required' });
    }
    if (![1, 3, 6].includes(planMonths)) {
      return res.status(400).json({ error: 'plan_months must be 1, 3, or 6' });
    }

    const result = db.prepare(`
      INSERT INTO gym_entries (name, start_date, end_date, plan_months, total, personal_training_amount,
        advance_gpay, advance_cash, advance_date,
        balance_gpay, balance_cash, balance_date, status, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      b.name.trim(), startDate, endDate, planMonths, parseNum(b.total), parseNum(b.personal_training_amount),
      parseNum(b.advance_gpay), parseNum(b.advance_cash), b.advance_date || null,
      parseNum(b.balance_gpay), parseNum(b.balance_cash), b.balance_date || null,
      b.status || 'PENDING', (b.remarks || '').trim()
    );

    res.status(201).json(db.prepare('SELECT * FROM gym_entries WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    console.error('Gym create error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to save gym entry' });
  }
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM gym_entries WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const b = req.body;
  const planMonths = Number(b.plan_months ?? existing.plan_months) || 1;
  const startDate = b.start_date || existing.start_date;
  const endDate = b.end_date || calcGymEndDate(startDate, planMonths);

  db.prepare(`
    UPDATE gym_entries SET
      name = ?, start_date = ?, end_date = ?, plan_months = ?, total = ?, personal_training_amount = ?,
      advance_gpay = ?, advance_cash = ?, advance_date = ?,
      balance_gpay = ?, balance_cash = ?, balance_date = ?,
      status = ?, remarks = ?
    WHERE id = ?
  `).run(
    (b.name || existing.name).trim(),
    startDate,
    endDate,
    planMonths,
    parseNum(b.total ?? existing.total),
    parseNum(b.personal_training_amount ?? existing.personal_training_amount),
    parseNum(b.advance_gpay ?? existing.advance_gpay),
    parseNum(b.advance_cash ?? existing.advance_cash),
    b.advance_date !== undefined ? (b.advance_date || null) : existing.advance_date,
    parseNum(b.balance_gpay ?? existing.balance_gpay),
    parseNum(b.balance_cash ?? existing.balance_cash),
    b.balance_date !== undefined ? (b.balance_date || null) : existing.balance_date,
    b.status || existing.status,
    (b.remarks ?? existing.remarks ?? '').trim(),
    req.params.id
  );

  res.json(db.prepare('SELECT * FROM gym_entries WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM gym_entries WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

export default router;
