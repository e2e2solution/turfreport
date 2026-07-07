import db from '../db.js';
import { parseNum } from './excel.js';
import {
  calcPtBaseEndDate,
  isValidPtGoal,
  isValidPtPlanType,
} from './pt.js';

export function applyPtDraftToSqlite(draft) {
  if (!draft?.trainer_id) throw new Error('Draft missing trainer_id');

  const trainer = db.prepare('SELECT * FROM pt_trainers WHERE id = ?').get(draft.trainer_id);
  if (!trainer) {
    throw new Error(`Trainer #${draft.trainer_id} not found in local DB. Create the trainer first.`);
  }

  if (!draft.client_name?.trim()) throw new Error('Client name is required');
  if (!isValidPtGoal(draft.pt_goal)) throw new Error('Invalid PT goal');
  if (!isValidPtPlanType(draft.plan_type)) throw new Error('Invalid PT plan');
  if (!draft.start_date) throw new Error('Start date is required');

  const baseEndDate = draft.base_end_date || calcPtBaseEndDate(draft.start_date, draft.plan_type);
  const ptStatus = draft.pt_status === 'READY_FOR_PAYMENT' ? 'READY_FOR_PAYMENT' : 'ACTIVE';

  let clientId = draft.local_client_id || null;
  const existing = clientId
    ? db.prepare('SELECT * FROM pt_clients WHERE id = ?').get(clientId)
    : null;

  if (existing) {
    db.prepare(`
      UPDATE pt_clients
      SET client_name = ?, pt_goal = ?, plan_type = ?, start_date = ?, base_end_date = ?,
        total_amount = ?, advance_gpay = ?, advance_cash = ?, advance_date = ?,
        balance_gpay = ?, balance_cash = ?, balance_date = ?, status = ?, notes = ?,
        completed_at = ?, manual_reopen = 0
      WHERE id = ?
    `).run(
      draft.client_name.trim(),
      draft.pt_goal,
      draft.plan_type,
      draft.start_date,
      baseEndDate,
      parseNum(draft.total_amount),
      parseNum(draft.advance_gpay),
      parseNum(draft.advance_cash),
      draft.advance_date || null,
      parseNum(draft.balance_gpay),
      parseNum(draft.balance_cash),
      draft.balance_date || null,
      ptStatus,
      (draft.notes || '').trim(),
      ptStatus === 'READY_FOR_PAYMENT' ? (draft.completed_at || draft.updated_at?.slice(0, 10) || null) : null,
      clientId,
    );
  } else {
    const result = db.prepare(`
      INSERT INTO pt_clients (
        trainer_id, client_name, pt_goal, plan_type, start_date, base_end_date,
        total_amount, advance_gpay, advance_cash, advance_date,
        balance_gpay, balance_cash, balance_date, status, notes, completed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      draft.trainer_id,
      draft.client_name.trim(),
      draft.pt_goal,
      draft.plan_type,
      draft.start_date,
      baseEndDate,
      parseNum(draft.total_amount),
      parseNum(draft.advance_gpay),
      parseNum(draft.advance_cash),
      draft.advance_date || null,
      parseNum(draft.balance_gpay),
      parseNum(draft.balance_cash),
      draft.balance_date || null,
      ptStatus,
      (draft.notes || '').trim(),
      ptStatus === 'READY_FOR_PAYMENT' ? (draft.completed_at || null) : null,
    );
    clientId = result.lastInsertRowid;
  }

  db.prepare('DELETE FROM pt_sessions WHERE client_id = ?').run(clientId);
  for (const session of draft.sessions || []) {
    if (!session?.session_date) continue;
    db.prepare(`
      INSERT OR IGNORE INTO pt_sessions (client_id, session_date, notes)
      VALUES (?, ?, ?)
    `).run(clientId, session.session_date, (session.notes || '').trim());
  }

  db.prepare('DELETE FROM pt_freezes WHERE client_id = ?').run(clientId);
  for (const freeze of draft.freezes || []) {
    if (!freeze?.freeze_from || !freeze?.freeze_to) continue;
    db.prepare(`
      INSERT INTO pt_freezes (client_id, freeze_from, freeze_to, days_count, reason, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      clientId,
      freeze.freeze_from,
      freeze.freeze_to,
      freeze.days_count || 0,
      freeze.reason || 'other',
      (freeze.notes || '').trim(),
    );
  }

  return { clientId, trainerId: draft.trainer_id };
}
