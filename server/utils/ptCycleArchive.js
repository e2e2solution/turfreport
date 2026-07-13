import db from '../db.js';
import { todayISO } from './pt.js';

function getClientSessions(clientId) {
  return db.prepare(`
    SELECT session_date, notes FROM pt_sessions
    WHERE client_id = ? ORDER BY session_date ASC
  `).all(clientId);
}

function getClientFreezes(clientId) {
  return db.prepare(`
    SELECT freeze_from, freeze_to, days_count, reason, notes FROM pt_freezes
    WHERE client_id = ? ORDER BY freeze_from ASC
  `).all(clientId);
}

/** Save the current PT cycle (sessions + payment info) before restart wipes it. */
export function archivePtCycle(clientId, snapshot = null) {
  if (snapshot?.sessions?.length) {
    const client = db.prepare(`
      SELECT c.*, t.name AS trainer_name
      FROM pt_clients c
      JOIN pt_trainers t ON t.id = c.trainer_id
      WHERE c.id = ?
    `).get(clientId);
    if (!client) return null;

    const result = db.prepare(`
      INSERT INTO pt_cycles (
        client_id, trainer_id, client_name, plan_type, pt_goal,
        start_date, base_end_date, total_amount,
        advance_gpay, advance_cash, advance_date,
        balance_gpay, balance_cash, balance_date,
        completed_at, notes, session_count, sessions_json, freezes_json, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'READY_FOR_PAYMENT')
    `).run(
      client.id,
      client.trainer_id,
      client.client_name,
      client.plan_type,
      client.pt_goal,
      snapshot.start_date || client.start_date,
      snapshot.base_end_date || client.base_end_date,
      snapshot.total_amount ?? client.total_amount ?? 0,
      snapshot.advance_gpay ?? client.advance_gpay ?? 0,
      snapshot.advance_cash ?? client.advance_cash ?? 0,
      snapshot.advance_date ?? client.advance_date ?? null,
      snapshot.balance_gpay ?? client.balance_gpay ?? 0,
      snapshot.balance_cash ?? client.balance_cash ?? 0,
      snapshot.balance_date ?? client.balance_date ?? null,
      snapshot.completed_at || client.completed_at || todayISO(),
      (snapshot.notes ?? client.notes ?? '').trim(),
      snapshot.sessions.length,
      JSON.stringify(snapshot.sessions),
      JSON.stringify(snapshot.freezes || []),
    );
    return result.lastInsertRowid;
  }

  const client = db.prepare(`
    SELECT c.*, t.name AS trainer_name
    FROM pt_clients c
    JOIN pt_trainers t ON t.id = c.trainer_id
    WHERE c.id = ?
  `).get(clientId);
  if (!client) return null;

  const sessions = getClientSessions(clientId);
  const freezes = getClientFreezes(clientId);
  if (!sessions.length && client.status !== 'READY_FOR_PAYMENT') return null;

  const result = db.prepare(`
    INSERT INTO pt_cycles (
      client_id, trainer_id, client_name, plan_type, pt_goal,
      start_date, base_end_date, total_amount,
      advance_gpay, advance_cash, advance_date,
      balance_gpay, balance_cash, balance_date,
      completed_at, notes, session_count, sessions_json, freezes_json, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'READY_FOR_PAYMENT')
  `).run(
    client.id,
    client.trainer_id,
    client.client_name,
    client.plan_type,
    client.pt_goal,
    client.start_date,
    client.base_end_date,
    client.total_amount || 0,
    client.advance_gpay || 0,
    client.advance_cash || 0,
    client.advance_date || null,
    client.balance_gpay || 0,
    client.balance_cash || 0,
    client.balance_date || null,
    client.completed_at || todayISO(),
    (client.notes || '').trim(),
    sessions.length,
    JSON.stringify(sessions),
    JSON.stringify(freezes),
  );

  return result.lastInsertRowid;
}

export function isRestartDraft(draft, existing) {
  if (!existing) return false;
  if (draft.pt_status !== 'ACTIVE') return false;
  if ((draft.sessions || []).length > 0) return false;

  const sessionCount = db.prepare(`
    SELECT COUNT(*) AS count FROM pt_sessions WHERE client_id = ?
  `).get(existing.id)?.count || 0;

  if (sessionCount === 0 && existing.status !== 'READY_FOR_PAYMENT') return false;
  return draft.start_date !== existing.start_date || existing.status === 'READY_FOR_PAYMENT';
}
