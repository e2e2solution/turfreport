import { Router } from 'express';
import db from '../db.js';
import { parseNum } from '../utils/excel.js';
import { appendAnyPayment } from '../utils/reportQuery.js';

const router = Router();

router.get('/', (req, res) => {
  const { date, match_date, status, filter_type } = req.query;
  let sql = 'SELECT * FROM online_bookings WHERE 1=1';
  const params = [];

  if (filter_type === 'payment' && date) {
    sql = appendAnyPayment(sql, params, null, null, date);
  } else if (match_date) {
    sql += ' AND match_date = ?';
    params.push(match_date);
  } else if (date) {
    sql += ` AND (
      advance_date = ? OR balance_date = ? OR match_date = ?
    )`;
    params.push(date, date, date);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += ' ORDER BY match_date DESC, id DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM online_bookings WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.post('/', (req, res) => {
  const b = req.body;
  if (!b.name || !b.sport || !b.match_date || !b.total || !b.time_slot) {
    return res.status(400).json({ error: 'name, sport, match_date, total, time_slot are required' });
  }

  const result = db.prepare(`
    INSERT INTO online_bookings (name, sport, match_date, total, time_slot,
      advance_gpay, advance_cash, advance_date,
      balance_gpay, balance_cash, balance_date, status, remarks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    b.name.trim(), b.sport, b.match_date, parseNum(b.total), b.time_slot.trim(),
    parseNum(b.advance_gpay), parseNum(b.advance_cash), b.advance_date || null,
    parseNum(b.balance_gpay), parseNum(b.balance_cash), b.balance_date || null,
    b.status || 'PENDING', (b.remarks || '').trim()
  );

  res.status(201).json(db.prepare('SELECT * FROM online_bookings WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM online_bookings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const b = req.body;
  db.prepare(`
    UPDATE online_bookings SET
      name = ?, sport = ?, match_date = ?, total = ?, time_slot = ?,
      advance_gpay = ?, advance_cash = ?, advance_date = ?,
      balance_gpay = ?, balance_cash = ?, balance_date = ?,
      status = ?, remarks = ?
    WHERE id = ?
  `).run(
    (b.name || existing.name).trim(),
    b.sport || existing.sport,
    b.match_date || existing.match_date,
    parseNum(b.total ?? existing.total),
    (b.time_slot || existing.time_slot).trim(),
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

  res.json(db.prepare('SELECT * FROM online_bookings WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM online_bookings WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

export default router;
