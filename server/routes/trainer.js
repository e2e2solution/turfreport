import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';
import {
  calcPtBaseEndDate,
  isValidPtGoal,
  isValidPtPlanType,
  targetSessionsForPlan,
  todayISO,
} from '../utils/pt.js';
import {
  signTrainerToken,
  trainerAuthMiddleware,
  verifyTrainerPassword,
} from '../middleware/trainerAuth.js';
import {
  findTrainerInMongoByName,
  getPtDraftFromMongo,
  listPtDraftsFromMongo,
  syncPtDraftToMongo,
} from '../db/mongo.js';
import { parseNum } from '../utils/excel.js';

const router = Router();

function findTrainerInSqlite(name) {
  return db.prepare(`
    SELECT * FROM pt_trainers
    WHERE lower(trim(name)) = lower(trim(?))
  `).get(name);
}

async function resolveTrainer(name) {
  const local = findTrainerInSqlite(name);
  if (local) return { id: local.id, name: local.name };
  const mongo = await findTrainerInMongoByName(name);
  if (mongo) return { id: mongo.trainer_id, name: mongo.name };
  return null;
}

function sessionCount(draft) {
  return (draft.sessions || []).length;
}

function buildDraftBase(trainer, body = {}) {
  const now = new Date().toISOString();
  const startDate = body.start_date || todayISO();
  const planType = body.plan_type || '22_sessions';
  return {
    draft_id: body.draft_id || randomUUID(),
    trainer_id: trainer.id,
    trainer_name: trainer.name,
    local_client_id: body.local_client_id || null,
    status: 'pending',
    client_name: (body.client_name || '').trim(),
    pt_goal: body.pt_goal || 'strength_and_conditioning',
    plan_type: planType,
    start_date: startDate,
    base_end_date: body.base_end_date || calcPtBaseEndDate(startDate, planType),
    total_amount: parseNum(body.total_amount),
    advance_gpay: parseNum(body.advance_gpay),
    advance_cash: parseNum(body.advance_cash),
    advance_date: body.advance_date || null,
    balance_gpay: parseNum(body.balance_gpay),
    balance_cash: parseNum(body.balance_cash),
    balance_date: body.balance_date || null,
    pt_status: body.pt_status || 'ACTIVE',
    notes: (body.notes || '').trim(),
    sessions: body.sessions || [],
    freezes: body.freezes || [],
    created_at: body.created_at || now,
    updated_at: now,
  };
}

async function saveDraft(draft) {
  draft.updated_at = new Date().toISOString();
  const result = await syncPtDraftToMongo(draft);
  if (!result.ok) throw new Error(result.error || 'Could not save draft to MongoDB');
  return draft;
}

router.post('/login', async (req, res) => {
  const username = req.body?.username?.trim();
  const password = req.body?.password;
  if (!username) return res.status(400).json({ error: 'Trainer name required' });
  if (!verifyTrainerPassword(password)) return res.status(401).json({ error: 'Invalid password' });

  const trainer = await resolveTrainer(username);
  if (!trainer) return res.status(401).json({ error: 'Trainer not found. Ask staff to add you and sync to cloud.' });

  res.json({
    token: signTrainerToken(trainer),
    trainer_id: trainer.id,
    trainer_name: trainer.name,
    role: 'trainer',
  });
});

router.get('/drafts', trainerAuthMiddleware, async (req, res) => {
  const drafts = await listPtDraftsFromMongo({
    status: req.query.status || 'pending',
    trainerId: req.trainer.id,
  });
  if (!drafts) return res.status(503).json({ error: 'MongoDB unavailable' });
  res.json(drafts.map(enrichDraft));
});

router.get('/drafts/:draftId', trainerAuthMiddleware, async (req, res) => {
  const draft = await getPtDraftFromMongo(req.params.draftId);
  if (!draft || draft.trainer_id !== req.trainer.id) {
    return res.status(404).json({ error: 'Draft not found' });
  }
  res.json(enrichDraft(draft));
});

router.post('/drafts', trainerAuthMiddleware, async (req, res) => {
  const b = req.body || {};
  if (!b.client_name?.trim()) return res.status(400).json({ error: 'Client name is required' });
  if (!b.start_date) return res.status(400).json({ error: 'Start date is required' });
  if (!isValidPtGoal(b.pt_goal)) return res.status(400).json({ error: 'Invalid PT goal' });
  if (!isValidPtPlanType(b.plan_type)) return res.status(400).json({ error: 'Invalid PT plan' });

  const draft = buildDraftBase(req.trainer, b);
  await saveDraft(draft);
  res.status(201).json(enrichDraft(draft));
});

router.put('/drafts/:draftId', trainerAuthMiddleware, async (req, res) => {
  const existing = await getPtDraftFromMongo(req.params.draftId);
  if (!existing || existing.trainer_id !== req.trainer.id) {
    return res.status(404).json({ error: 'Draft not found' });
  }
  if (existing.status !== 'pending') {
    return res.status(400).json({ error: 'Only pending drafts can be edited' });
  }

  const b = req.body || {};
  if (b.pt_goal && !isValidPtGoal(b.pt_goal)) return res.status(400).json({ error: 'Invalid PT goal' });
  if (b.plan_type && !isValidPtPlanType(b.plan_type)) return res.status(400).json({ error: 'Invalid PT plan' });

  const startDate = b.start_date ?? existing.start_date;
  const planType = b.plan_type ?? existing.plan_type;
  const draft = {
    ...existing,
    client_name: b.client_name !== undefined ? b.client_name.trim() : existing.client_name,
    pt_goal: b.pt_goal ?? existing.pt_goal,
    plan_type: planType,
    start_date: startDate,
    base_end_date: b.base_end_date ?? calcPtBaseEndDate(startDate, planType),
    total_amount: b.total_amount !== undefined ? parseNum(b.total_amount) : existing.total_amount,
    advance_gpay: b.advance_gpay !== undefined ? parseNum(b.advance_gpay) : existing.advance_gpay,
    advance_cash: b.advance_cash !== undefined ? parseNum(b.advance_cash) : existing.advance_cash,
    advance_date: b.advance_date !== undefined ? (b.advance_date || null) : existing.advance_date,
    balance_gpay: b.balance_gpay !== undefined ? parseNum(b.balance_gpay) : existing.balance_gpay,
    balance_cash: b.balance_cash !== undefined ? parseNum(b.balance_cash) : existing.balance_cash,
    balance_date: b.balance_date !== undefined ? (b.balance_date || null) : existing.balance_date,
    notes: b.notes !== undefined ? (b.notes || '').trim() : existing.notes,
  };
  await saveDraft(draft);
  res.json(enrichDraft(draft));
});

router.post('/drafts/:draftId/sessions/toggle', trainerAuthMiddleware, async (req, res) => {
  const existing = await getPtDraftFromMongo(req.params.draftId);
  if (!existing || existing.trainer_id !== req.trainer.id) {
    return res.status(404).json({ error: 'Draft not found' });
  }
  if (existing.status !== 'pending' || existing.pt_status === 'READY_FOR_PAYMENT') {
    return res.status(400).json({ error: 'Sessions locked for this draft' });
  }

  const { session_date: sessionDate, checked } = req.body || {};
  if (!sessionDate) return res.status(400).json({ error: 'session_date is required' });

  let sessions = [...(existing.sessions || [])];
  const target = targetSessionsForPlan(existing.plan_type);

  if (checked) {
    if (sessions.some((s) => s.session_date === sessionDate)) {
      return res.status(400).json({ error: 'Session already marked' });
    }
    if (target && sessions.length >= target) {
      return res.status(400).json({ error: `All ${target} sessions are already marked` });
    }
    sessions.push({ session_date: sessionDate, notes: '' });
    sessions.sort((a, b) => a.session_date.localeCompare(b.session_date));
  } else {
    sessions = sessions.filter((s) => s.session_date !== sessionDate);
  }

  const draft = { ...existing, sessions };
  if (target && sessions.length >= target) {
    draft.pt_status = 'READY_FOR_PAYMENT';
    draft.completed_at = sessionDate;
  }
  await saveDraft(draft);
  res.json(enrichDraft(draft));
});

router.post('/drafts/:draftId/ready', trainerAuthMiddleware, async (req, res) => {
  const existing = await getPtDraftFromMongo(req.params.draftId);
  if (!existing || existing.trainer_id !== req.trainer.id) {
    return res.status(404).json({ error: 'Draft not found' });
  }
  const draft = {
    ...existing,
    pt_status: 'READY_FOR_PAYMENT',
    completed_at: todayISO(),
  };
  await saveDraft(draft);
  res.json(enrichDraft(draft));
});

router.post('/drafts/:draftId/restart', trainerAuthMiddleware, async (req, res) => {
  const existing = await getPtDraftFromMongo(req.params.draftId);
  if (!existing || existing.trainer_id !== req.trainer.id) {
    return res.status(404).json({ error: 'Draft not found' });
  }
  const startDate = req.body?.start_date;
  if (!startDate) return res.status(400).json({ error: 'start_date is required' });

  const draft = {
    ...existing,
    start_date: startDate,
    base_end_date: calcPtBaseEndDate(startDate, existing.plan_type),
    pt_status: 'ACTIVE',
    completed_at: null,
    sessions: [],
    freezes: [],
  };
  await saveDraft(draft);
  res.json(enrichDraft(draft));
});

router.delete('/drafts/:draftId', trainerAuthMiddleware, async (req, res) => {
  const existing = await getPtDraftFromMongo(req.params.draftId);
  if (!existing || existing.trainer_id !== req.trainer.id) {
    return res.status(404).json({ error: 'Draft not found' });
  }
  if (existing.status !== 'pending') {
    return res.status(400).json({ error: 'Only pending drafts can be deleted' });
  }
  const draft = { ...existing, status: 'rejected', updated_at: new Date().toISOString() };
  await saveDraft(draft);
  res.json({ ok: true });
});

function enrichDraft(draft) {
  const target = targetSessionsForPlan(draft.plan_type);
  const completed = sessionCount(draft);
  return {
    ...draft,
    completed_sessions: completed,
    session_target: target,
    sessions_remaining: target != null ? Math.max(0, target - completed) : null,
    current_end_date: draft.base_end_date,
  };
}

export default router;
