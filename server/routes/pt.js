import { Router } from 'express';
import {
  count,
  deleteMany,
  deleteOne,
  findMany,
  findOne,
  insertOne,
  nextId,
  updateOne,
} from '../db/collections.js';
import { parseNum } from '../utils/excel.js';
import { syncTrainerToMongo } from '../db/mongo.js';
import ptDraftsRouter from './ptDrafts.js';
import { archivePtCycle } from '../utils/ptCycleArchive.js';
import {
  addDaysISO,
  calcPtBaseEndDate,
  freezeDaysBetween,
  goalLabel,
  isValidPtGoal,
  isValidPtPlanType,
  isPtCycleLocked,
  planLabel,
  ptStatusLabel,
  targetSessionsForPlan,
  todayISO,
} from '../utils/pt.js';

const router = Router();

function paymentReceived(row) {
  return (row.advance_gpay || 0) + (row.advance_cash || 0)
    + (row.balance_gpay || 0) + (row.balance_cash || 0);
}

async function getFreezeRows(clientId) {
  return findMany('pt_freezes', { client_id: Number(clientId) }, {
    sort: { freeze_from: -1, id: -1 },
  });
}

async function getSessionRows(clientId) {
  return findMany('pt_sessions', { client_id: Number(clientId) }, {
    sort: { session_date: -1, id: -1 },
  });
}

async function getFreezeDaySum(clientId) {
  const rows = await findMany('pt_freezes', { client_id: Number(clientId) });
  return rows.reduce((sum, row) => sum + (Number(row.days_count) || 0), 0);
}

async function getSessionCount(clientId) {
  return count('pt_sessions', { client_id: Number(clientId) });
}

async function trainerNameById(trainerId) {
  const trainer = await findOne('pt_trainers', { id: Number(trainerId) });
  return trainer?.name || '';
}

function applyClientDerived(client, opts = {}) {
  if (!client) return null;
  const completedSessions = opts.completedSessions ?? 0;
  const freezeDays = opts.freezeDays ?? 0;
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
    status_label: ptStatusLabel(client.status),
    completed_sessions: completedSessions,
    session_target: sessionTarget,
    sessions_remaining: sessionsRemaining,
    freeze_days: freezeDays,
    current_end_date: currentEndDate,
    amount_paid: amountPaid,
    amount_due: Math.max(0, (client.total_amount || 0) - amountPaid),
  };
}

async function syncClientCompletion(clientId) {
  const client = await findOne('pt_clients', { id: Number(clientId) });
  if (!client) return null;

  const trainer_name = await trainerNameById(client.trainer_id);
  const withTrainer = { ...client, trainer_name };

  const completedSessions = await getSessionCount(client.id);
  const sessionTarget = targetSessionsForPlan(client.plan_type);

  if (sessionTarget && completedSessions >= sessionTarget
    && client.status !== 'READY_FOR_PAYMENT' && !client.manual_reopen) {
    const sessions = await findMany('pt_sessions', { client_id: client.id }, {
      sort: { session_date: -1, id: -1 },
      limit: 1,
    });
    const completedAt = sessions[0]?.session_date || todayISO();
    await updateOne('pt_clients', { id: client.id }, {
      status: 'READY_FOR_PAYMENT',
      completed_at: completedAt,
    });
    withTrainer.status = 'READY_FOR_PAYMENT';
    withTrainer.completed_at = completedAt;
  } else if (sessionTarget && completedSessions < sessionTarget && client.status === 'READY_FOR_PAYMENT') {
    await updateOne('pt_clients', { id: client.id }, {
      status: 'ACTIVE',
      completed_at: null,
    });
    withTrainer.status = 'ACTIVE';
    withTrainer.completed_at = null;
  }

  const freezeDays = await getFreezeDaySum(client.id);
  return applyClientDerived(withTrainer, { completedSessions, freezeDays });
}

async function getClientWithDetails(clientId) {
  const base = await syncClientCompletion(clientId);
  if (!base) return null;
  return {
    ...base,
    sessions: await getSessionRows(clientId),
    freezes: await getFreezeRows(clientId),
  };
}

function applyCycleDerived(cycle) {
  const amountPaid = (cycle.advance_gpay || 0) + (cycle.advance_cash || 0)
    + (cycle.balance_gpay || 0) + (cycle.balance_cash || 0);
  const sessionTarget = targetSessionsForPlan(cycle.plan_type);
  return {
    ...cycle,
    id: `cycle-${cycle.id}`,
    cycle_id: cycle.id,
    client_id: cycle.client_id,
    record_type: 'cycle',
    pt_goal_label: goalLabel(cycle.pt_goal),
    plan_label: planLabel(cycle.plan_type),
    status_label: 'Ready for Payment',
    status: 'READY_FOR_PAYMENT',
    completed_sessions: cycle.session_count || 0,
    session_target: sessionTarget,
    sessions_remaining: sessionTarget != null
      ? Math.max(0, sessionTarget - (cycle.session_count || 0))
      : null,
    amount_paid: amountPaid,
    amount_due: Math.max(0, (cycle.total_amount || 0) - amountPaid),
    cycle_period: `${cycle.start_date} → ${cycle.base_end_date}`,
  };
}

async function listArchivedCycles({ trainerId } = {}) {
  const filter = { status: 'READY_FOR_PAYMENT' };
  if (trainerId) filter.trainer_id = Number(trainerId);

  const cycles = await findMany('pt_cycles', filter, {
    sort: { completed_at: -1, id: -1 },
  });
  const trainers = await findMany('pt_trainers', {});
  const nameById = new Map(trainers.map((t) => [t.id, t.name]));

  return cycles.map((cycle) => applyCycleDerived({
    ...cycle,
    trainer_name: nameById.get(cycle.trainer_id) || '',
  }));
}

async function listClients({ trainerId, status } = {}) {
  const filter = {};
  if (trainerId) filter.trainer_id = Number(trainerId);
  if (status) filter.status = status;

  const rows = await findMany('pt_clients', filter, {
    sort: { status: 1, start_date: -1, id: -1 },
  });
  const trainers = await findMany('pt_trainers', {});
  const nameById = new Map(trainers.map((t) => [t.id, t.name]));

  const clients = [];
  for (const row of rows) {
    const completedSessions = await getSessionCount(row.id);
    const freezeDays = await getFreezeDaySum(row.id);
    clients.push({
      ...applyClientDerived(
        { ...row, trainer_name: nameById.get(row.trainer_id) || '' },
        { completedSessions, freezeDays },
      ),
      record_type: 'client',
    });
  }

  if (status === 'READY_FOR_PAYMENT') {
    const cycles = await listArchivedCycles({ trainerId });
    return [...cycles, ...clients];
  }

  return clients;
}

router.get('/trainers', async (_req, res) => {
  const trainers = await findMany('pt_trainers', {}, { sort: { name: 1 } });
  trainers.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
  const withCounts = await Promise.all(trainers.map(async (t) => ({
    ...t,
    client_count: await count('pt_clients', { trainer_id: t.id }),
  })));
  res.json(withCounts);
});

router.post('/trainers', async (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim()) {
    return res.status(400).json({ error: 'Trainer name is required' });
  }

  const name = b.name.trim();
  const id = await nextId('pt_trainers');
  const trainer = await insertOne('pt_trainers', {
    id,
    trainer_id: id,
    name,
    name_lower: name.toLowerCase(),
    phone: (b.phone || '').trim(),
    specializations: (b.specializations || '').trim(),
  });
  syncTrainerToMongo(trainer).catch(() => {});
  res.status(201).json({ ...trainer, client_count: 0 });
});

router.get('/trainers/:id', async (req, res) => {
  const trainer = await findOne('pt_trainers', { id: Number(req.params.id) });
  if (!trainer) return res.status(404).json({ error: 'Trainer not found' });
  res.json({
    ...trainer,
    client_count: await count('pt_clients', { trainer_id: trainer.id }),
    clients: await listClients({ trainerId: req.params.id }),
  });
});

router.get('/clients', async (req, res) => {
  const { trainer_id: trainerId, status } = req.query;
  res.json(await listClients({ trainerId, status }));
});

router.post('/clients', async (req, res) => {
  const b = req.body || {};
  if (!b.trainer_id) return res.status(400).json({ error: 'trainer_id is required' });
  if (!b.client_name?.trim()) return res.status(400).json({ error: 'Client name is required' });
  if (!b.start_date) return res.status(400).json({ error: 'Start date is required' });
  if (!isValidPtGoal(b.pt_goal)) return res.status(400).json({ error: 'Invalid PT goal' });
  if (!isValidPtPlanType(b.plan_type)) return res.status(400).json({ error: 'Invalid PT plan' });

  const trainer = await findOne('pt_trainers', { id: Number(b.trainer_id) });
  if (!trainer) return res.status(404).json({ error: 'Trainer not found' });

  const baseEndDate = calcPtBaseEndDate(b.start_date, b.plan_type);
  const row = await insertOne('pt_clients', {
    trainer_id: Number(b.trainer_id),
    client_name: b.client_name.trim(),
    pt_goal: b.pt_goal,
    plan_type: b.plan_type,
    start_date: b.start_date,
    base_end_date: baseEndDate,
    total_amount: parseNum(b.total_amount),
    advance_gpay: parseNum(b.advance_gpay),
    advance_cash: parseNum(b.advance_cash),
    advance_date: b.advance_date || null,
    balance_gpay: parseNum(b.balance_gpay),
    balance_cash: parseNum(b.balance_cash),
    balance_date: b.balance_date || null,
    status: 'ACTIVE',
    notes: (b.notes || '').trim(),
  });

  res.status(201).json(await getClientWithDetails(row.id));
});

router.get('/clients/:id', async (req, res) => {
  const client = await getClientWithDetails(req.params.id);
  if (!client) return res.status(404).json({ error: 'PT client not found' });
  res.json(client);
});

router.delete('/clients/:id', async (req, res) => {
  const existing = await findOne('pt_clients', { id: Number(req.params.id) });
  if (!existing) return res.status(404).json({ error: 'PT client not found' });

  await deleteOne('pt_clients', { id: Number(req.params.id) });
  res.json({ ok: true, id: Number(req.params.id) });
});

router.put('/clients/:id/payment', async (req, res) => {
  const existing = await findOne('pt_clients', { id: Number(req.params.id) });
  if (!existing) return res.status(404).json({ error: 'PT client not found' });

  const b = req.body || {};
  await updateOne('pt_clients', { id: Number(req.params.id) }, {
    total_amount: parseNum(b.total_amount ?? existing.total_amount),
    advance_gpay: parseNum(b.advance_gpay ?? existing.advance_gpay),
    advance_cash: parseNum(b.advance_cash ?? existing.advance_cash),
    advance_date: b.advance_date !== undefined ? (b.advance_date || null) : existing.advance_date,
    balance_gpay: parseNum(b.balance_gpay ?? existing.balance_gpay),
    balance_cash: parseNum(b.balance_cash ?? existing.balance_cash),
    balance_date: b.balance_date !== undefined ? (b.balance_date || null) : existing.balance_date,
    notes: (b.notes ?? existing.notes ?? '').trim(),
  });

  res.json(await getClientWithDetails(req.params.id));
});

router.post('/clients/:id/complete', async (req, res) => {
  const existing = await findOne('pt_clients', { id: Number(req.params.id) });
  if (!existing) return res.status(404).json({ error: 'PT client not found' });

  await updateOne('pt_clients', { id: Number(req.params.id) }, {
    status: 'READY_FOR_PAYMENT',
    completed_at: todayISO(),
    manual_reopen: 0,
  });

  res.json(await getClientWithDetails(req.params.id));
});

router.post('/clients/:id/reopen', async (req, res) => {
  const existing = await findOne('pt_clients', { id: Number(req.params.id) });
  if (!existing) return res.status(404).json({ error: 'PT client not found' });
  if (existing.status !== 'READY_FOR_PAYMENT') {
    return res.status(400).json({ error: 'PT is not ready for payment' });
  }

  await updateOne('pt_clients', { id: Number(req.params.id) }, {
    status: 'ACTIVE',
    completed_at: null,
    manual_reopen: 1,
  });

  res.json(await getClientWithDetails(req.params.id));
});

router.post('/clients/:id/restart', async (req, res) => {
  const existing = await findOne('pt_clients', { id: Number(req.params.id) });
  if (!existing) return res.status(404).json({ error: 'PT client not found' });
  if (existing.status !== 'READY_FOR_PAYMENT') {
    return res.status(400).json({ error: 'PT must be ready for payment before restart' });
  }

  const startDate = req.body?.start_date;
  if (!startDate) return res.status(400).json({ error: 'start_date is required' });

  await archivePtCycle(req.params.id);

  const baseEndDate = calcPtBaseEndDate(startDate, existing.plan_type);

  await deleteMany('pt_sessions', { client_id: Number(req.params.id) });
  await deleteMany('pt_freezes', { client_id: Number(req.params.id) });
  await updateOne('pt_clients', { id: Number(req.params.id) }, {
    start_date: startDate,
    base_end_date: baseEndDate,
    status: 'ACTIVE',
    completed_at: null,
    manual_reopen: 0,
  });

  res.json(await getClientWithDetails(req.params.id));
});

router.post('/clients/:id/sessions', async (req, res) => {
  const existing = await findOne('pt_clients', { id: Number(req.params.id) });
  if (!existing) return res.status(404).json({ error: 'PT client not found' });
  if (isPtCycleLocked(existing.status)) {
    return res.status(400).json({ error: 'PT is ready for payment — restart or undo to edit sessions' });
  }

  const b = req.body || {};
  if (!b.session_date) return res.status(400).json({ error: 'session_date is required' });

  const freezeDays = await getFreezeDaySum(existing.id);
  const endDate = addDaysISO(existing.base_end_date, freezeDays);
  if (b.session_date < existing.start_date || b.session_date > endDate) {
    return res.status(400).json({ error: 'Session date must be within the PT period' });
  }

  const duplicate = await findOne('pt_sessions', {
    client_id: Number(req.params.id),
    session_date: b.session_date,
  });
  if (duplicate) {
    return res.status(400).json({ error: 'Session already marked for this date' });
  }

  const sessionTarget = targetSessionsForPlan(existing.plan_type);
  if (sessionTarget) {
    const sessionCount = await getSessionCount(existing.id);
    if (sessionCount >= sessionTarget) {
      return res.status(400).json({ error: `All ${sessionTarget} sessions are already marked` });
    }
  }

  await insertOne('pt_sessions', {
    client_id: Number(req.params.id),
    session_date: b.session_date,
    notes: (b.notes || '').trim(),
  });

  res.status(201).json(await getClientWithDetails(req.params.id));
});

router.delete('/sessions/:sessionId', async (req, res) => {
  const session = await findOne('pt_sessions', { id: Number(req.params.sessionId) });
  if (!session) return res.status(404).json({ error: 'PT session not found' });
  await deleteOne('pt_sessions', { id: Number(req.params.sessionId) });
  res.json(await getClientWithDetails(session.client_id));
});

router.post('/clients/:id/freezes', async (req, res) => {
  const existing = await findOne('pt_clients', { id: Number(req.params.id) });
  if (!existing) return res.status(404).json({ error: 'PT client not found' });
  if (isPtCycleLocked(existing.status)) {
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

  const overlap = await findOne('pt_freezes', {
    client_id: Number(req.params.id),
    freeze_to: { $gte: b.freeze_from },
    freeze_from: { $lte: b.freeze_to },
  });
  if (overlap) {
    return res.status(400).json({ error: 'This freeze overlaps an existing freeze period' });
  }

  await insertOne('pt_freezes', {
    client_id: Number(req.params.id),
    freeze_from: b.freeze_from,
    freeze_to: b.freeze_to,
    days_count: daysCount,
    reason: b.reason.trim(),
    notes: (b.notes || '').trim(),
  });

  res.status(201).json(await getClientWithDetails(req.params.id));
});

router.delete('/freezes/:freezeId', async (req, res) => {
  const freeze = await findOne('pt_freezes', { id: Number(req.params.freezeId) });
  if (!freeze) return res.status(404).json({ error: 'PT freeze not found' });
  await deleteOne('pt_freezes', { id: Number(req.params.freezeId) });
  res.json(await getClientWithDetails(freeze.client_id));
});

router.get('/report', async (req, res) => {
  const date = req.query.date || todayISO();
  const trainerId = req.query.trainer_id;
  const status = req.query.status;

  const clients = await listClients({ trainerId, status });

  const sessionFilter = { session_date: date };
  const sessionsRaw = await findMany('pt_sessions', sessionFilter, {
    sort: { id: 1 },
  });
  const clientIds = [...new Set(sessionsRaw.map((s) => s.client_id))];
  const sessionClients = clientIds.length
    ? await findMany('pt_clients', { id: { $in: clientIds } })
    : [];
  const clientById = new Map(sessionClients.map((c) => [c.id, c]));
  const trainers = await findMany('pt_trainers', {});
  const trainerById = new Map(trainers.map((t) => [t.id, t]));

  const sessions = sessionsRaw
    .map((s) => {
      const c = clientById.get(s.client_id);
      if (!c) return null;
      if (trainerId && Number(c.trainer_id) !== Number(trainerId)) return null;
      if (status && c.status !== status) return null;
      const trainer = trainerById.get(c.trainer_id);
      return {
        ...s,
        client_name: c.client_name,
        pt_goal: c.pt_goal,
        plan_type: c.plan_type,
        trainer_name: trainer?.name || '',
        pt_goal_label: goalLabel(c.pt_goal),
        plan_label: planLabel(c.plan_type),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const tn = String(a.trainer_name).localeCompare(String(b.trainer_name), undefined, { sensitivity: 'base' });
      if (tn !== 0) return tn;
      return String(a.client_name).localeCompare(String(b.client_name), undefined, { sensitivity: 'base' });
    });

  const freezeFilter = {
    freeze_from: { $lte: date },
    freeze_to: { $gte: date },
  };
  const freezesOnDate = await findMany('pt_freezes', freezeFilter);
  const frozenClientIds = [...new Set(freezesOnDate.map((f) => f.client_id))];
  let frozenRows = frozenClientIds.length
    ? await findMany('pt_clients', { id: { $in: frozenClientIds } })
    : [];
  if (trainerId) {
    frozenRows = frozenRows.filter((c) => Number(c.trainer_id) === Number(trainerId));
  }
  if (status) {
    frozenRows = frozenRows.filter((c) => c.status === status);
  }

  const summary = {
    date,
    total_clients: clients.length,
    active_clients: clients.filter((c) => c.status === 'ACTIVE').length,
    ready_for_payment_clients: clients.filter((c) => c.status === 'READY_FOR_PAYMENT').length,
    frozen_clients: frozenRows.length,
    sessions_completed_today: sessions.length,
  };

  res.json({ summary, sessions, clients });
});

router.use(ptDraftsRouter);

export default router;
