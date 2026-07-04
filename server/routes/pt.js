import { Router } from 'express';
import db from '../db.js';
import { parseNum } from '../utils/excel.js';
import {
  addDaysISO,
  calcPtBaseEndDate,
  freezeDaysBetween,
  goalLabel,
  isValidPtGoal,
  isValidPtPlanType,
  planLabel,
  targetSessionsForPlan,
  todayISO,
} from '../utils/pt.js';

const router = Router();

function paymentReceived(row) {
  return (row.advance_gpay || 0) + (row.advance_cash || 0)
    + (row.balance_gpay || 0) + (row.balance_cash || 0);
}

function getFreezeRows(clientId) {
  return db.prepare(`
    SELECT * FROM pt_freezes
    WHERE client_id = ?
    ORDER BY freeze_from DESC, id DESC
  `).all(clientId);
}

function getSessionRows(clientId) {
  return db.prepare(`
    SELECT * FROM pt_sessions
    WHERE client_id = ?
    ORDER BY session_date DESC, id DESC
  `).all(clientId);
}

function getFreezeDaySum(clientId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(days_count), 0) AS freeze_days
    FROM pt_freezes
    WHERE client_id = ?
  `).get(clientId);
  return row?.freeze_days || 0;
}

function getSessionCount(clientId) {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM pt_sessions
    WHERE client_id = ?
  `).get(clientId);
  return row?.count || 0;
}

function applyClientDerived(client, opts = {}) {
  if (!client) return null;
  const completedSessions = opts.completedSessions ?? getSessionCount(client.id);
  const freezeDays = opts.freezeDays ?? getFreezeDaySum(client.id);
  const sessionTarget = targetSessionsForPlan(client.plan_type);
  const currentEndDate = addDaysISO(client.base_end_date, freezeDays);
  const amountPaid = paymentReceived(client);
  const sessionsRemaining = sessionTarget != null
    ? Math.max(0, sessionTarget - completedSessions)
    : null;

  return {
    ...client,
    pt_goal_label: goalLabel(client.pt_goal),
    plan_label: planLabel(client.plan_type),
    completed_sessions: completedSessions,
    session_target: sessionTarget,
    sessions_remaining: sessionsRemaining,
    freeze_days: freezeDays,
    current_end_date: currentEndDate,
    amount_paid: amountPaid,
    amount_due: Math.max(0, (client.total_amount || 0) - amountPaid),
  };
}

function syncClientCompletion(clientId) {
  const client = db.prepare(`
    SELECT c.*, t.name AS trainer_name
    FROM pt_clients c
    JOIN pt_trainers t ON t.id = c.trainer_id
    WHERE c.id = ?
  `).get(clientId);
  if (!client) return null;

  const completedSessions = getSessionCount(client.id);
  const sessionTarget = targetSessionsForPlan(client.plan_type);

  if (sessionTarget && completedSessions >= sessionTarget && client.status !== 'COMPLETED' && !client.manual_reopen) {
    const lastSession = db.prepare(`
      SELECT session_date
      FROM pt_sessions
      WHERE client_id = ?
      ORDER BY session_date DESC, id DESC
      LIMIT 1
    `).get(client.id);
    db.prepare(`
      UPDATE pt_clients
      SET status = 'COMPLETED', completed_at = ?
      WHERE id = ?
    `).run(lastSession?.session_date || todayISO(), client.id);
    client.status = 'COMPLETED';
    client.completed_at = lastSession?.session_date || todayISO();
  } else if (sessionTarget && completedSessions < sessionTarget && client.status === 'COMPLETED') {
    db.prepare(`
      UPDATE pt_clients
      SET status = 'ACTIVE', completed_at = NULL
      WHERE id = ?
    `).run(client.id);
    client.status = 'ACTIVE';
    client.completed_at = null;
  }

  return applyClientDerived(client, { completedSessions });
}

function getClientWithDetails(clientId) {
  const base = syncClientCompletion(clientId);
  if (!base) return null;
  return {
    ...base,
    sessions: getSessionRows(clientId),
    freezes: getFreezeRows(clientId),
  };
}

function listClients({ trainerId, status } = {}) {
  let sql = `
    SELECT c.*, t.name AS trainer_name
    FROM pt_clients c
    JOIN pt_trainers t ON t.id = c.trainer_id
    WHERE 1=1
  `;
  const params = [];

  if (trainerId) {
    sql += ' AND c.trainer_id = ?';
    params.push(trainerId);
  }
  if (status) {
    sql += ' AND c.status = ?';
    params.push(status);
  }

  sql += ' ORDER BY c.status ASC, c.start_date DESC, c.id DESC';
  const rows = db.prepare(sql).all(...params);
  return rows.map((row) => applyClientDerived(row));
}

router.get('/trainers', (_req, res) => {
  const trainers = db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM pt_clients c WHERE c.trainer_id = t.id) AS client_count
    FROM pt_trainers t
    ORDER BY t.name COLLATE NOCASE ASC
  `).all();
  res.json(trainers);
});

router.post('/trainers', (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim()) {
    return res.status(400).json({ error: 'Trainer name is required' });
  }

  const result = db.prepare(`
    INSERT INTO pt_trainers (name, phone, specializations)
    VALUES (?, ?, ?)
  `).run(
    b.name.trim(),
    (b.phone || '').trim(),
    (b.specializations || '').trim(),
  );

  const trainer = db.prepare('SELECT * FROM pt_trainers WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ...trainer, client_count: 0 });
});

router.get('/trainers/:id', (req, res) => {
  const trainer = db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM pt_clients c WHERE c.trainer_id = t.id) AS client_count
    FROM pt_trainers t
    WHERE t.id = ?
  `).get(req.params.id);
  if (!trainer) return res.status(404).json({ error: 'Trainer not found' });
  res.json({
    ...trainer,
    clients: listClients({ trainerId: req.params.id }),
  });
});

router.get('/clients', (req, res) => {
  const { trainer_id: trainerId, status } = req.query;
  res.json(listClients({ trainerId, status }));
});

router.post('/clients', (req, res) => {
  const b = req.body || {};
  if (!b.trainer_id) return res.status(400).json({ error: 'trainer_id is required' });
  if (!b.client_name?.trim()) return res.status(400).json({ error: 'Client name is required' });
  if (!b.start_date) return res.status(400).json({ error: 'Start date is required' });
  if (!isValidPtGoal(b.pt_goal)) return res.status(400).json({ error: 'Invalid PT goal' });
  if (!isValidPtPlanType(b.plan_type)) return res.status(400).json({ error: 'Invalid PT plan' });

  const trainer = db.prepare('SELECT * FROM pt_trainers WHERE id = ?').get(b.trainer_id);
  if (!trainer) return res.status(404).json({ error: 'Trainer not found' });

  const baseEndDate = calcPtBaseEndDate(b.start_date, b.plan_type);
  const result = db.prepare(`
    INSERT INTO pt_clients (
      trainer_id, client_name, pt_goal, plan_type, start_date, base_end_date,
      total_amount, advance_gpay, advance_cash, advance_date,
      balance_gpay, balance_cash, balance_date, status, notes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
  `).run(
    b.trainer_id,
    b.client_name.trim(),
    b.pt_goal,
    b.plan_type,
    b.start_date,
    baseEndDate,
    parseNum(b.total_amount),
    parseNum(b.advance_gpay),
    parseNum(b.advance_cash),
    b.advance_date || null,
    parseNum(b.balance_gpay),
    parseNum(b.balance_cash),
    b.balance_date || null,
    (b.notes || '').trim(),
  );

  res.status(201).json(getClientWithDetails(result.lastInsertRowid));
});

router.get('/clients/:id', (req, res) => {
  const client = getClientWithDetails(req.params.id);
  if (!client) return res.status(404).json({ error: 'PT client not found' });
  res.json(client);
});

router.put('/clients/:id/payment', (req, res) => {
  const existing = db.prepare('SELECT * FROM pt_clients WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'PT client not found' });

  const b = req.body || {};
  db.prepare(`
    UPDATE pt_clients
    SET total_amount = ?, advance_gpay = ?, advance_cash = ?, advance_date = ?,
      balance_gpay = ?, balance_cash = ?, balance_date = ?, notes = ?
    WHERE id = ?
  `).run(
    parseNum(b.total_amount ?? existing.total_amount),
    parseNum(b.advance_gpay ?? existing.advance_gpay),
    parseNum(b.advance_cash ?? existing.advance_cash),
    b.advance_date !== undefined ? (b.advance_date || null) : existing.advance_date,
    parseNum(b.balance_gpay ?? existing.balance_gpay),
    parseNum(b.balance_cash ?? existing.balance_cash),
    b.balance_date !== undefined ? (b.balance_date || null) : existing.balance_date,
    (b.notes ?? existing.notes ?? '').trim(),
    req.params.id,
  );

  res.json(getClientWithDetails(req.params.id));
});

router.post('/clients/:id/complete', (req, res) => {
  const existing = db.prepare('SELECT * FROM pt_clients WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'PT client not found' });

  db.prepare(`
    UPDATE pt_clients
    SET status = 'COMPLETED', completed_at = ?, manual_reopen = 0
    WHERE id = ?
  `).run(todayISO(), req.params.id);

  res.json(getClientWithDetails(req.params.id));
});

router.post('/clients/:id/reopen', (req, res) => {
  const existing = db.prepare('SELECT * FROM pt_clients WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'PT client not found' });
  if (existing.status !== 'COMPLETED') {
    return res.status(400).json({ error: 'PT is not completed' });
  }

  db.prepare(`
    UPDATE pt_clients
    SET status = 'ACTIVE', completed_at = NULL, manual_reopen = 1
    WHERE id = ?
  `).run(req.params.id);

  res.json(getClientWithDetails(req.params.id));
});

router.post('/clients/:id/sessions', (req, res) => {
  const existing = db.prepare('SELECT * FROM pt_clients WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'PT client not found' });
  if (existing.status === 'COMPLETED') {
    return res.status(400).json({ error: 'PT is already completed' });
  }

  const b = req.body || {};
  if (!b.session_date) return res.status(400).json({ error: 'session_date is required' });

  const freezeDays = getFreezeDaySum(existing.id);
  const endDate = addDaysISO(existing.base_end_date, freezeDays);
  if (b.session_date < existing.start_date || b.session_date > endDate) {
    return res.status(400).json({ error: 'Session date must be within the PT period' });
  }

  const duplicate = db.prepare(`
    SELECT id FROM pt_sessions
    WHERE client_id = ? AND session_date = ?
  `).get(req.params.id, b.session_date);
  if (duplicate) {
    return res.status(400).json({ error: 'Session already marked for this date' });
  }

  const sessionTarget = targetSessionsForPlan(existing.plan_type);
  if (sessionTarget) {
    const count = getSessionCount(existing.id);
    if (count >= sessionTarget) {
      return res.status(400).json({ error: `All ${sessionTarget} sessions are already marked` });
    }
  }

  db.prepare(`
    INSERT INTO pt_sessions (client_id, session_date, notes)
    VALUES (?, ?, ?)
  `).run(
    req.params.id,
    b.session_date,
    (b.notes || '').trim(),
  );

  res.status(201).json(getClientWithDetails(req.params.id));
});

router.delete('/sessions/:sessionId', (req, res) => {
  const session = db.prepare('SELECT * FROM pt_sessions WHERE id = ?').get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'PT session not found' });
  db.prepare('DELETE FROM pt_sessions WHERE id = ?').run(req.params.sessionId);
  res.json(getClientWithDetails(session.client_id));
});

router.post('/clients/:id/freezes', (req, res) => {
  const existing = db.prepare('SELECT * FROM pt_clients WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'PT client not found' });
  if (existing.status === 'COMPLETED') {
    return res.status(400).json({ error: 'Completed PT cannot be frozen' });
  }

  const b = req.body || {};
  if (!b.freeze_from || !b.freeze_to) {
    return res.status(400).json({ error: 'freeze_from and freeze_to are required' });
  }
  if (!b.reason?.trim()) {
    return res.status(400).json({ error: 'Freeze reason is required' });
  }

  const daysCount = freezeDaysBetween(b.freeze_from, b.freeze_to);
  if (daysCount <= 0) {
    return res.status(400).json({ error: 'Freeze end must be on or after freeze start' });
  }

  const overlap = db.prepare(`
    SELECT id
    FROM pt_freezes
    WHERE client_id = ?
      AND NOT (freeze_to < ? OR freeze_from > ?)
  `).get(req.params.id, b.freeze_from, b.freeze_to);
  if (overlap) {
    return res.status(400).json({ error: 'This freeze overlaps an existing freeze period' });
  }

  db.prepare(`
    INSERT INTO pt_freezes (client_id, freeze_from, freeze_to, days_count, reason, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    req.params.id,
    b.freeze_from,
    b.freeze_to,
    daysCount,
    b.reason.trim(),
    (b.notes || '').trim(),
  );

  res.status(201).json(getClientWithDetails(req.params.id));
});

router.delete('/freezes/:freezeId', (req, res) => {
  const freeze = db.prepare('SELECT * FROM pt_freezes WHERE id = ?').get(req.params.freezeId);
  if (!freeze) return res.status(404).json({ error: 'PT freeze not found' });
  db.prepare('DELETE FROM pt_freezes WHERE id = ?').run(req.params.freezeId);
  res.json(getClientWithDetails(freeze.client_id));
});

router.get('/report', (req, res) => {
  const date = req.query.date || todayISO();
  const trainerId = req.query.trainer_id;
  const status = req.query.status;

  const clients = listClients({ trainerId, status });
  const sessions = db.prepare(`
    SELECT s.*, c.client_name, c.pt_goal, c.plan_type, t.name AS trainer_name
    FROM pt_sessions s
    JOIN pt_clients c ON c.id = s.client_id
    JOIN pt_trainers t ON t.id = c.trainer_id
    WHERE s.session_date = ?
      ${trainerId ? 'AND c.trainer_id = ?' : ''}
      ${status ? 'AND c.status = ?' : ''}
    ORDER BY t.name COLLATE NOCASE ASC, c.client_name COLLATE NOCASE ASC
  `).all(
    ...[date, trainerId, status].filter((v) => v !== undefined && v !== null && v !== '')
  ).map((row) => ({
    ...row,
    pt_goal_label: goalLabel(row.pt_goal),
    plan_label: planLabel(row.plan_type),
  }));

  const frozenRows = db.prepare(`
    SELECT DISTINCT c.id
    FROM pt_clients c
    JOIN pt_freezes f ON f.client_id = c.id
    WHERE ? BETWEEN f.freeze_from AND f.freeze_to
      ${trainerId ? 'AND c.trainer_id = ?' : ''}
      ${status ? 'AND c.status = ?' : ''}
  `).all(
    ...[date, trainerId, status].filter((v) => v !== undefined && v !== null && v !== '')
  );

  const summary = {
    date,
    total_clients: clients.length,
    active_clients: clients.filter((c) => c.status === 'ACTIVE').length,
    completed_clients: clients.filter((c) => c.status === 'COMPLETED').length,
    frozen_clients: frozenRows.length,
    sessions_completed_today: sessions.length,
  };

  res.json({ summary, sessions, clients });
});

export default router;
