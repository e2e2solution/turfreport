import { Router } from 'express';
import db from '../db.js';
import { parseNum } from '../utils/excel.js';
import { appendAnyPayment } from '../utils/reportQuery.js';

const router = Router();
const PERIODS = ['full', 'first_half', 'second_half'];

router.get('/', (req, res) => {
  const { date, coaching_month, status, filter_type } = req.query;
  let sql = 'SELECT * FROM football_coaching WHERE 1=1';
  const params = [];

  if (filter_type === 'payment' && date) {
    sql = appendAnyPayment(sql, params, null, null, date);
  } else if (coaching_month) {
    sql += ' AND coaching_month = ?';
    params.push(coaching_month);
  } else if (date) {
    sql += ` AND (
      advance_date = ? OR balance_date = ? OR coaching_month = ?
    )`;
    params.push(date, date, date.slice(0, 7));
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += ' ORDER BY coaching_month DESC, id DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM football_coaching WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.post('/', (req, res) => {
  const b = req.body;
  if (!b.name || !b.coaching_month || b.total === undefined || b.total === '') {
    return res.status(400).json({ error: 'name, coaching_month, total are required' });
  }
  const period = b.period || 'full';
  if (!PERIODS.includes(period)) {
    return res.status(400).json({ error: 'period must be full, first_half, or second_half' });
  }

  const result = db.prepare(`
    INSERT INTO football_coaching (name, parent_name, phone, coaching_month, period, total,
      advance_gpay, advance_cash, advance_date,
      balance_gpay, balance_cash, balance_date, status, remarks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    b.name.trim(),
    (b.parent_name || '').trim(),
    (b.phone || '').trim(),
    b.coaching_month,
    period,
    parseNum(b.total),
    parseNum(b.advance_gpay),
    parseNum(b.advance_cash),
    b.advance_date || null,
    parseNum(b.balance_gpay),
    parseNum(b.balance_cash),
    b.balance_date || null,
    b.status || 'PENDING',
    (b.remarks || '').trim(),
  );

  res.status(201).json(db.prepare('SELECT * FROM football_coaching WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM football_coaching WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const b = req.body;
  const period = b.period || existing.period;
  if (!PERIODS.includes(period)) {
    return res.status(400).json({ error: 'period must be full, first_half, or second_half' });
  }

  db.prepare(`
    UPDATE football_coaching SET
      name = ?, parent_name = ?, phone = ?, coaching_month = ?, period = ?, total = ?,
      advance_gpay = ?, advance_cash = ?, advance_date = ?,
      balance_gpay = ?, balance_cash = ?, balance_date = ?,
      status = ?, remarks = ?
    WHERE id = ?
  `).run(
    (b.name || existing.name).trim(),
    (b.parent_name ?? existing.parent_name ?? '').trim(),
    (b.phone ?? existing.phone ?? '').trim(),
    b.coaching_month || existing.coaching_month,
    period,
    parseNum(b.total ?? existing.total),
    parseNum(b.advance_gpay ?? existing.advance_gpay),
    parseNum(b.advance_cash ?? existing.advance_cash),
    b.advance_date !== undefined ? (b.advance_date || null) : existing.advance_date,
    parseNum(b.balance_gpay ?? existing.balance_gpay),
    parseNum(b.balance_cash ?? existing.balance_cash),
    b.balance_date !== undefined ? (b.balance_date || null) : existing.balance_date,
    b.status || existing.status,
    (b.remarks ?? existing.remarks ?? '').trim(),
    req.params.id,
  );

  res.json(db.prepare('SELECT * FROM football_coaching WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM football_coaching WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

export default router;
