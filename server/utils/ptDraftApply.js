import {
  deleteMany,
  findOne,
  insertOne,
  updateOne,
} from '../db/collections.js';
import { parseNum } from './excel.js';
import {
  calcPtBaseEndDate,
  isValidPtGoal,
  isValidPtPlanType,
} from './pt.js';
import { archivePtCycle, isRestartDraft } from './ptCycleArchive.js';

/** Apply a PT draft to Mongo pt_clients / sessions / freezes. Name kept for route compatibility. */
export async function applyPtDraftToSqlite(draft) {
  if (!draft?.trainer_id) throw new Error('Draft missing trainer_id');

  const trainer = await findOne('pt_trainers', { id: Number(draft.trainer_id) });
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
    ? await findOne('pt_clients', { id: Number(clientId) })
    : null;

  if (existing && await isRestartDraft(draft, existing)) {
    await archivePtCycle(clientId, draft.previous_cycle || null);
  }

  const clientFields = {
    client_name: draft.client_name.trim(),
    pt_goal: draft.pt_goal,
    plan_type: draft.plan_type,
    start_date: draft.start_date,
    base_end_date: baseEndDate,
    total_amount: parseNum(draft.total_amount),
    advance_gpay: parseNum(draft.advance_gpay),
    advance_cash: parseNum(draft.advance_cash),
    advance_date: draft.advance_date || null,
    balance_gpay: parseNum(draft.balance_gpay),
    balance_cash: parseNum(draft.balance_cash),
    balance_date: draft.balance_date || null,
    status: ptStatus,
    notes: (draft.notes || '').trim(),
    completed_at: ptStatus === 'READY_FOR_PAYMENT'
      ? (draft.completed_at || draft.updated_at?.slice(0, 10) || null)
      : null,
    manual_reopen: 0,
  };

  if (existing) {
    await updateOne('pt_clients', { id: Number(clientId) }, clientFields);
  } else {
    const row = await insertOne('pt_clients', {
      trainer_id: draft.trainer_id,
      ...clientFields,
      completed_at: ptStatus === 'READY_FOR_PAYMENT' ? (draft.completed_at || null) : null,
    });
    clientId = row.id;
  }

  await deleteMany('pt_sessions', { client_id: Number(clientId) });
  const seenSessionDates = new Set();
  for (const session of draft.sessions || []) {
    if (!session?.session_date) continue;
    if (seenSessionDates.has(session.session_date)) continue;
    seenSessionDates.add(session.session_date);
    await insertOne('pt_sessions', {
      client_id: Number(clientId),
      session_date: session.session_date,
      notes: (session.notes || '').trim(),
    });
  }

  await deleteMany('pt_freezes', { client_id: Number(clientId) });
  for (const freeze of draft.freezes || []) {
    if (!freeze?.freeze_from || !freeze?.freeze_to) continue;
    await insertOne('pt_freezes', {
      client_id: Number(clientId),
      freeze_from: freeze.freeze_from,
      freeze_to: freeze.freeze_to,
      days_count: freeze.days_count || 0,
      reason: freeze.reason || 'other',
      notes: (freeze.notes || '').trim(),
    });
  }

  return { clientId, trainerId: draft.trainer_id };
}
