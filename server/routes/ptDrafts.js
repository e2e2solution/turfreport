import { Router } from 'express';
import {
  getMongoError,
  listPtDraftsFromMongo,
  syncPtDraftToMongo,
  syncTrainerToMongo,
} from '../db/mongo.js';
import { findMany, findOne } from '../db/collections.js';
import { applyPtDraftToSqlite } from '../utils/ptDraftApply.js';
import {
  fetchPtDraftsFromCloud,
  pushPtDraftToCloud,
  pushTrainerToCloud,
} from '../utils/cloudSync.js';
import { targetSessionsForPlan } from '../utils/pt.js';

const router = Router();

// Statuses that need staff attention on the dashboard.
const REVIEW_STATUSES = ['pending', 'update_pending'];

/** Persist a draft doc: local Mongo first, then Render cloud fallback. */
async function persistDraftDoc(doc) {
  const mongo = await syncPtDraftToMongo(doc);
  if (mongo.ok) return { ok: true, via: 'mongo' };
  if (process.env.CLOUD_SYNC_URL) {
    const cloud = await pushPtDraftToCloud(doc);
    if (cloud.ok) return { ok: true, via: 'cloud' };
    return { ok: false, error: cloud.error };
  }
  return { ok: false, error: mongo.error };
}

/** Read drafts: local Mongo first, then Render cloud fallback. */
async function fetchDrafts(status) {
  let drafts = await listPtDraftsFromMongo({ status });
  let via = 'mongo';
  if (!drafts && process.env.CLOUD_SYNC_URL) {
    const cloud = await fetchPtDraftsFromCloud({ status });
    if (cloud.ok) {
      drafts = cloud.drafts;
      via = 'cloud';
    }
  }
  return { drafts, via };
}

async function getClientSessions(clientId) {
  return findMany('pt_sessions', { client_id: Number(clientId) }, {
    sort: { session_date: 1 },
    projection: { session_date: 1, notes: 1 },
  });
}

async function getClientFreezes(clientId) {
  return findMany('pt_freezes', { client_id: Number(clientId) }, {
    sort: { freeze_from: 1 },
    projection: { freeze_from: 1, freeze_to: 1, days_count: 1, reason: 1, notes: 1 },
  });
}

async function getClientWithTrainer(clientId) {
  const client = await findOne('pt_clients', { id: Number(clientId) });
  if (!client) return null;
  const trainer = await findOne('pt_trainers', { id: Number(client.trainer_id) });
  return { ...client, trainer_name: trainer?.name || '' };
}

/** Build a canonical published-client doc from a PT client row. */
async function buildClientDoc(client) {
  const now = new Date().toISOString();
  return {
    draft_id: `client-${client.id}`,
    origin: 'staff',
    status: 'confirmed',
    local_client_id: client.id,
    trainer_id: client.trainer_id,
    trainer_name: client.trainer_name,
    client_name: client.client_name,
    pt_goal: client.pt_goal,
    plan_type: client.plan_type,
    start_date: client.start_date,
    base_end_date: client.base_end_date,
    total_amount: client.total_amount || 0,
    advance_gpay: client.advance_gpay || 0,
    advance_cash: client.advance_cash || 0,
    advance_date: client.advance_date || null,
    balance_gpay: client.balance_gpay || 0,
    balance_cash: client.balance_cash || 0,
    balance_date: client.balance_date || null,
    pt_status: client.status || 'ACTIVE',
    completed_at: client.completed_at || null,
    notes: client.notes || '',
    sessions: await getClientSessions(client.id),
    freezes: await getClientFreezes(client.id),
    published_at: now,
    updated_at: now,
  };
}

/** Apply a draft to Mongo PT collections and re-publish as confirmed. */
async function confirmDraftToSqlite(draft) {
  const { clientId, trainerId } = await applyPtDraftToSqlite(draft);
  const client = await getClientWithTrainer(clientId);

  const confirmedDoc = await buildClientDoc(client);
  await persistDraftDoc(confirmedDoc);

  if (draft.draft_id !== confirmedDoc.draft_id) {
    await persistDraftDoc({
      ...draft,
      status: 'rejected',
      superseded_by: confirmedDoc.draft_id,
      updated_at: new Date().toISOString(),
    });
  }

  return { clientId, trainerId, client };
}

function isTrainerCompletedDraft(draft) {
  return draft.pt_status === 'READY_FOR_PAYMENT';
}

async function splitAndApplyDrafts(drafts) {
  const autoApplied = [];
  const pending = [];
  const errors = [];

  for (const draft of drafts || []) {
    if (isTrainerCompletedDraft(draft)) {
      try {
        await confirmDraftToSqlite(draft);
        autoApplied.push(draft);
      } catch (err) {
        errors.push({ draft_id: draft.draft_id, client_name: draft.client_name, error: err.message });
        pending.push(draft);
      }
    } else {
      pending.push(draft);
    }
  }

  return { autoApplied, pending, errors };
}

/** Push all local PT clients to the cloud so trainers can see them. */
router.post('/publish-clients', async (req, res) => {
  const trainerId = req.query.trainer_id;
  const filter = trainerId ? { trainer_id: Number(trainerId) } : {};
  const clients = await findMany('pt_clients', filter);
  const trainers = await findMany('pt_trainers', {});
  const nameById = new Map(trainers.map((t) => [t.id, t.name]));
  const withNames = clients.map((c) => ({
    ...c,
    trainer_name: nameById.get(c.trainer_id) || '',
  }));

  if (!withNames.length) {
    return res.json({ published: 0, total: 0, skipped: 0 });
  }

  // Existing docs so we don't clobber pending trainer edits.
  const { drafts: existing } = await fetchDrafts('all');
  const byClientId = new Map();
  for (const d of existing || []) {
    if (d.local_client_id != null) byClientId.set(String(d.local_client_id), d);
  }

  let published = 0;
  let skipped = 0;
  let lastError = '';

  for (const client of withNames) {
    const current = byClientId.get(String(client.id));
    // Never overwrite trainer changes waiting for approval.
    if (current && REVIEW_STATUSES.includes(current.status)) {
      skipped += 1;
      continue;
    }
    const doc = await buildClientDoc(client);
    const r = await persistDraftDoc(doc);
    if (r.ok) published += 1;
    else lastError = r.error || lastError;
  }

  if (published === 0 && lastError) {
    return res.status(503).json({ error: lastError });
  }
  res.json({ published, total: withNames.length, skipped });
});

/** Drafts + updates needing staff review. */
router.get('/drafts', async (_req, res) => {
  const { drafts } = await fetchDrafts(REVIEW_STATUSES);
  if (!drafts) {
    return res.status(503).json({
      error: getMongoError() || 'MongoDB unavailable. Set MONGODB_URI or CLOUD_SYNC_URL.',
    });
  }
  res.json(drafts.map(enrichDraft));
});

router.post('/drafts/collect', async (_req, res) => {
  const { drafts, via } = await fetchDrafts(REVIEW_STATUSES);
  if (!drafts) {
    return res.status(503).json({ error: getMongoError() || 'Could not collect drafts' });
  }
  if (via === 'cloud') {
    for (const draft of drafts) {
      await syncPtDraftToMongo(draft);
    }
  }

  const { autoApplied, pending, errors } = await splitAndApplyDrafts(drafts);

  res.json({
    count: pending.length,
    auto_applied: autoApplied.length,
    auto_applied_clients: autoApplied.map((d) => d.client_name),
    errors,
    source: via,
    drafts: pending.map(enrichDraft),
  });
});

/** Auto-apply trainer-completed (ready for payment) drafts without staff approval. */
router.post('/drafts/sync-ready', async (_req, res) => {
  const { drafts, via } = await fetchDrafts(REVIEW_STATUSES);
  if (!drafts) {
    return res.status(503).json({ error: getMongoError() || 'Could not sync ready drafts' });
  }

  const readyDrafts = drafts.filter(isTrainerCompletedDraft);
  if (!readyDrafts.length) {
    return res.json({ auto_applied: 0, auto_applied_clients: [], errors: [], source: via });
  }

  if (via === 'cloud') {
    for (const draft of readyDrafts) {
      await syncPtDraftToMongo(draft);
    }
  }

  const { autoApplied, errors } = await splitAndApplyDrafts(readyDrafts);

  res.json({
    auto_applied: autoApplied.length,
    auto_applied_clients: autoApplied.map((d) => d.client_name),
    errors,
    source: via,
  });
});

router.post('/drafts/:draftId/confirm', async (req, res) => {
  const { drafts } = await fetchDrafts('all');
  const draft = (drafts || []).find((d) => d.draft_id === req.params.draftId);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  if (!REVIEW_STATUSES.includes(draft.status)) {
    return res.status(400).json({ error: 'Draft is not awaiting approval' });
  }
  if (isTrainerCompletedDraft(draft)) {
    return res.status(400).json({ error: 'Trainer completed this PT — use auto-sync instead' });
  }

  try {
    const { clientId, trainerId } = await confirmDraftToSqlite(draft);
    res.json({ ok: true, client_id: clientId, trainer_id: trainerId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/drafts/:draftId/reject', async (req, res) => {
  const { drafts } = await fetchDrafts('all');
  const draft = (drafts || []).find((d) => d.draft_id === req.params.draftId);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });

  // If the draft edits an existing local client, revert the Mongo doc back to
  // the canonical client state so the trainer's rejected changes are discarded
  // and they see the original client again (instead of it disappearing).
  const localClient = draft.local_client_id
    ? await getClientWithTrainer(draft.local_client_id)
    : null;

  const doc = localClient
    ? await buildClientDoc(localClient)
    : {
        ...draft,
        status: 'rejected',
        reject_reason: (req.body?.reason || '').trim(),
        updated_at: new Date().toISOString(),
      };

  const r = await persistDraftDoc(doc);
  if (!r.ok) return res.status(503).json({ error: r.error || 'Could not reject draft' });
  res.json({ ok: true, reverted: Boolean(localClient) });
});

router.post('/sync-trainers', async (_req, res) => {
  const trainers = await findMany('pt_trainers', {});
  trainers.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
  if (!trainers.length) {
    return res.json({ synced: 0, total: 0, results: [], via: 'none' });
  }

  const results = [];
  let via = 'mongo';
  let lastError = '';

  for (const trainer of trainers) {
    let r = await syncTrainerToMongo(trainer);
    if (!r.ok && process.env.CLOUD_SYNC_URL) {
      via = 'cloud';
      r = await pushTrainerToCloud(trainer);
    }
    if (!r.ok) lastError = r.error || lastError;
    results.push({ id: trainer.id, name: trainer.name, ok: r.ok });
  }

  const synced = results.filter((r) => r.ok).length;
  if (synced === 0) {
    return res.status(503).json({
      error: lastError || getMongoError() || 'MongoDB unavailable and cloud sync not configured',
    });
  }
  res.json({ synced, total: trainers.length, results, via });
});

function enrichDraft(draft) {
  const target = targetSessionsForPlan(draft.plan_type);
  const completed = (draft.sessions || []).length;
  const paid = (draft.advance_gpay || 0) + (draft.advance_cash || 0)
    + (draft.balance_gpay || 0) + (draft.balance_cash || 0);
  const autoReady = isTrainerCompletedDraft(draft);
  return {
    ...draft,
    completed_sessions: completed,
    session_target: target,
    sessions_remaining: target != null ? Math.max(0, target - completed) : null,
    amount_due: Math.max(0, (draft.total_amount || 0) - paid),
    is_update: draft.status === 'update_pending',
    is_auto_ready: autoReady,
    needs_approval: !autoReady,
  };
}

export default router;
