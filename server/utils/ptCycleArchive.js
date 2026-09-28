import { count, findMany, findOne, insertOne } from '../db/collections.js';
import { todayISO } from './pt.js';

async function getClientSessions(clientId) {
  const rows = await findMany('pt_sessions', { client_id: Number(clientId) }, {
    sort: { session_date: 1 },
  });
  return rows.map(({ session_date, notes }) => ({ session_date, notes }));
}

async function getClientFreezes(clientId) {
  const rows = await findMany('pt_freezes', { client_id: Number(clientId) }, {
    sort: { freeze_from: 1 },
  });
  return rows.map(({ freeze_from, freeze_to, days_count, reason, notes }) => ({
    freeze_from,
    freeze_to,
    days_count,
    reason,
    notes,
  }));
}

function cycleDocFromClient(client, {
  start_date,
  base_end_date,
  total_amount,
  advance_gpay,
  advance_cash,
  advance_date,
  balance_gpay,
  balance_cash,
  balance_date,
  completed_at,
  notes,
  sessions,
  freezes,
}) {
  return {
    client_id: client.id,
    trainer_id: client.trainer_id,
    client_name: client.client_name,
    plan_type: client.plan_type,
    pt_goal: client.pt_goal,
    start_date,
    base_end_date,
    total_amount,
    advance_gpay,
    advance_cash,
    advance_date,
    balance_gpay,
    balance_cash,
    balance_date,
    completed_at,
    notes,
    session_count: sessions.length,
    sessions_json: JSON.stringify(sessions),
    freezes_json: JSON.stringify(freezes),
    status: 'READY_FOR_PAYMENT',
  };
}

/** Save the current PT cycle (sessions + payment info) before restart wipes it. */
export async function archivePtCycle(clientId, snapshot = null) {
  const client = await findOne('pt_clients', { id: Number(clientId) });
  if (!client) return null;

  if (snapshot?.sessions?.length) {
    const row = await insertOne('pt_cycles', cycleDocFromClient(client, {
      start_date: snapshot.start_date || client.start_date,
      base_end_date: snapshot.base_end_date || client.base_end_date,
      total_amount: snapshot.total_amount ?? client.total_amount ?? 0,
      advance_gpay: snapshot.advance_gpay ?? client.advance_gpay ?? 0,
      advance_cash: snapshot.advance_cash ?? client.advance_cash ?? 0,
      advance_date: snapshot.advance_date ?? client.advance_date ?? null,
      balance_gpay: snapshot.balance_gpay ?? client.balance_gpay ?? 0,
      balance_cash: snapshot.balance_cash ?? client.balance_cash ?? 0,
      balance_date: snapshot.balance_date ?? client.balance_date ?? null,
      completed_at: snapshot.completed_at || client.completed_at || todayISO(),
      notes: (snapshot.notes ?? client.notes ?? '').trim(),
      sessions: snapshot.sessions,
      freezes: snapshot.freezes || [],
    }));
    return row.id;
  }

  const sessions = await getClientSessions(clientId);
  const freezes = await getClientFreezes(clientId);
  if (!sessions.length && client.status !== 'READY_FOR_PAYMENT') return null;

  const row = await insertOne('pt_cycles', cycleDocFromClient(client, {
    start_date: client.start_date,
    base_end_date: client.base_end_date,
    total_amount: client.total_amount || 0,
    advance_gpay: client.advance_gpay || 0,
    advance_cash: client.advance_cash || 0,
    advance_date: client.advance_date || null,
    balance_gpay: client.balance_gpay || 0,
    balance_cash: client.balance_cash || 0,
    balance_date: client.balance_date || null,
    completed_at: client.completed_at || todayISO(),
    notes: (client.notes || '').trim(),
    sessions,
    freezes,
  }));

  return row.id;
}

export async function isRestartDraft(draft, existing) {
  if (!existing) return false;
  if (draft.pt_status !== 'ACTIVE') return false;
  if ((draft.sessions || []).length > 0) return false;

  const sessionCount = await count('pt_sessions', { client_id: existing.id });

  if (sessionCount === 0 && existing.status !== 'READY_FOR_PAYMENT') return false;
  return draft.start_date !== existing.start_date || existing.status === 'READY_FOR_PAYMENT';
}
