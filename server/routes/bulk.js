import { Router } from 'express';
import db from '../db.js';
import { parseNum } from '../utils/excel.js';
import { calcSessionHours, getBulkWithSessions } from '../utils/bulk.js';

const router = Router();
const CATEGORIES = ['turf', 'online', 'gym'];
const SPORTS = ['cricket', 'football', 'badminton'];

router.get('/', (req, res) => {
  const { status, category } = req.query;
  let sql = 'SELECT * FROM bulk_packages WHERE 1=1';
  const params = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }

  sql += ' ORDER BY id DESC';
  const packages = db.prepare(sql).all(...params);

  const withMeta = packages.map((pkg) => {
    const sessions = db.prepare(
      'SELECT hours FROM bulk_sessions WHERE bulk_id = ?'
    ).all(pkg.id);
    const used_hours = sessions.reduce((sum, s) => sum + (s.hours || 0), 0);
    return { ...pkg, session_count: sessions.length, used_hours };
  });

  res.json(withMeta);
});

router.delete('/sessions/:sessionId', (req, res) => {
  const result = db.prepare('DELETE FROM bulk_sessions WHERE id = ?').run(req.params.sessionId);
  if (result.changes === 0) return res.status(404).json({ error: 'Session not found' });
  res.json({ success: true });
});

router.put('/sessions/:sessionId', (req, res) => {
  const session = db.prepare(`
    SELECT s.*, p.status AS pkg_status, p.id AS bulk_id
    FROM bulk_sessions s
    JOIN bulk_packages p ON p.id = s.bulk_id
    WHERE s.id = ?
  `).get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.pkg_status === 'CLOSED') {
    return res.status(400).json({ error: 'Reopen bulk first to edit sessions' });
  }

  const b = req.body;
  const sessionDate = b.session_date || session.session_date;
  const timeSlot = (b.time_slot || session.time_slot).trim();
  const remarks = b.remarks !== undefined ? (b.remarks || '').trim() : session.remarks;

  if (!sessionDate || !timeSlot) {
    return res.status(400).json({ error: 'session_date and time_slot are required' });
  }

  const hours = calcSessionHours(timeSlot);
  if (hours <= 0) {
    return res.status(400).json({ error: 'Invalid time slot' });
  }

  const duplicate = db.prepare(`
    SELECT id FROM bulk_sessions
    WHERE bulk_id = ? AND session_date = ? AND LOWER(TRIM(time_slot)) = LOWER(?)
      AND id != ?
  `).get(session.bulk_id, sessionDate, timeSlot, req.params.sessionId);
  if (duplicate) {
    return res.status(400).json({ error: 'This bulk is already in the report for this date and time' });
  }

  db.prepare(`
    UPDATE bulk_sessions SET session_date = ?, time_slot = ?, hours = ?, remarks = ?
    WHERE id = ?
  `).run(sessionDate, timeSlot, hours, remarks, req.params.sessionId);

  const updated = db.prepare('SELECT * FROM bulk_sessions WHERE id = ?').get(req.params.sessionId);
  res.json(updated);
});

router.get('/:id', (req, res) => {
  const data = getBulkWithSessions(req.params.id);
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

router.post('/', (req, res) => {
  const b = req.body;
  if (!b.name || !b.category) {
    return res.status(400).json({ error: 'name and category are required' });
  }
  if (!CATEGORIES.includes(b.category)) {
    return res.status(400).json({ error: 'category must be turf, online, or gym' });
  }
  if (b.category !== 'gym' && b.sport && !SPORTS.includes(b.sport)) {
    return res.status(400).json({ error: 'invalid sport' });
  }

  const result = db.prepare(`
    INSERT INTO bulk_packages (category, name, sport, total_hours, total_amount, plan_months, remarks, status)
    VALUES (?, ?, ?, ?, ?, ?, 'bulk', 'PENDING')
  `).run(
    b.category,
    b.name.trim(),
    b.category === 'gym' ? null : (b.sport || 'cricket'),
    parseNum(b.total_hours),
    parseNum(b.total_amount),
    b.category === 'gym' ? (Number(b.plan_months) || null) : null,
  );

  res.status(201).json(getBulkWithSessions(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM bulk_packages WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const b = req.body;
  const closing = b.close === true || b.status === 'CLOSED';

  db.prepare(`
    UPDATE bulk_packages SET
      name = ?, sport = ?, total_hours = ?, total_amount = ?, plan_months = ?,
      advance_gpay = ?, advance_cash = ?, advance_date = ?,
      balance_gpay = ?, balance_cash = ?, balance_date = ?,
      status = ?, remarks = ?
    WHERE id = ?
  `).run(
    (b.name || existing.name).trim(),
    b.sport !== undefined ? b.sport : existing.sport,
    parseNum(b.total_hours ?? existing.total_hours),
    parseNum(b.total_amount ?? existing.total_amount),
    b.plan_months !== undefined ? b.plan_months : existing.plan_months,
    parseNum(b.advance_gpay ?? existing.advance_gpay),
    parseNum(b.advance_cash ?? existing.advance_cash),
    b.advance_date !== undefined ? (b.advance_date || null) : existing.advance_date,
    parseNum(b.balance_gpay ?? existing.balance_gpay),
    parseNum(b.balance_cash ?? existing.balance_cash),
    b.balance_date !== undefined ? (b.balance_date || null) : existing.balance_date,
    closing ? 'CLOSED' : (b.status || existing.status),
    (b.remarks ?? existing.remarks ?? 'bulk').trim(),
    req.params.id,
  );

  res.json(getBulkWithSessions(req.params.id));
});

router.post('/:id/reopen', (req, res) => {
  const existing = db.prepare('SELECT * FROM bulk_packages WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (existing.status !== 'CLOSED') {
    return res.status(400).json({ error: 'Only closed bulk packages can be reopened' });
  }

  db.prepare(`UPDATE bulk_packages SET status = 'PENDING' WHERE id = ?`).run(req.params.id);
  res.json(getBulkWithSessions(req.params.id));
});

router.post('/:id/close', (req, res) => {
  const existing = db.prepare('SELECT * FROM bulk_packages WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const b = req.body || {};
  const hasExistingPayment = (existing.advance_gpay || 0) + (existing.advance_cash || 0)
    + (existing.balance_gpay || 0) + (existing.balance_cash || 0) > 0;

  if (!hasExistingPayment) {
    if (b.total_amount === undefined || b.total_amount === '') {
      return res.status(400).json({ error: 'Payment details required before closing' });
    }
  }

  db.prepare(`
    UPDATE bulk_packages SET
      total_amount = ?, advance_gpay = ?, advance_cash = ?, advance_date = ?,
      balance_gpay = ?, balance_cash = ?, balance_date = ?,
      status = 'CLOSED', remarks = ?
    WHERE id = ?
  `).run(
    parseNum(b.total_amount ?? existing.total_amount),
    parseNum(b.advance_gpay ?? existing.advance_gpay),
    parseNum(b.advance_cash ?? existing.advance_cash),
    b.advance_date !== undefined ? (b.advance_date || null) : existing.advance_date,
    parseNum(b.balance_gpay ?? existing.balance_gpay),
    parseNum(b.balance_cash ?? existing.balance_cash),
    b.balance_date !== undefined ? (b.balance_date || null) : existing.balance_date,
    (b.remarks ?? existing.remarks ?? 'bulk').trim(),
    req.params.id,
  );

  res.json(getBulkWithSessions(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM bulk_packages WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

router.post('/:id/sessions', (req, res) => {
  const pkg = db.prepare('SELECT * FROM bulk_packages WHERE id = ?').get(req.params.id);
  if (!pkg) return res.status(404).json({ error: 'Bulk package not found' });
  if (pkg.status === 'CLOSED') {
    return res.status(400).json({ error: 'Bulk is closed. Reopen it first to add more sessions.' });
  }

  const b = req.body;
  if (!b.session_date || !b.time_slot) {
    return res.status(400).json({ error: 'session_date and time_slot are required' });
  }

  const hours = calcSessionHours(b.time_slot);
  if (hours <= 0) {
    return res.status(400).json({ error: 'Invalid time slot' });
  }

  const timeSlot = b.time_slot.trim();
  const duplicate = db.prepare(`
    SELECT id FROM bulk_sessions
    WHERE bulk_id = ? AND session_date = ? AND LOWER(TRIM(time_slot)) = LOWER(?)
  `).get(req.params.id, b.session_date, timeSlot);
  if (duplicate) {
    return res.status(400).json({ error: 'This bulk is already in the report for this date and time' });
  }

  const result = db.prepare(`
    INSERT INTO bulk_sessions (bulk_id, session_date, time_slot, hours, remarks)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    req.params.id,
    b.session_date,
    timeSlot,
    hours,
    (b.remarks || '').trim(),
  );

  const session = db.prepare('SELECT * FROM bulk_sessions WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(session);
});

export default router;
