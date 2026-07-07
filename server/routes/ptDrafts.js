import { Router } from 'express';
import {
  getMongoError,
  listPtDraftsFromMongo,
  syncPtDraftToMongo,
  syncTrainerToMongo,
} from '../db/mongo.js';
import { applyPtDraftToSqlite } from '../utils/ptDraftApply.js';
import {
  fetchPtDraftsFromCloud,
  pushPtDraftToCloud,
  pushTrainerToCloud,
} from '../utils/cloudSync.js';
import { targetSessionsForPlan } from '../utils/pt.js';
import db from '../db.js';

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

/** Build a canonical published-client doc from a SQLite PT client row. */
function buildClientDoc(client) {
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
    sessions: getClientSessions(client.id),
    freezes: getClientFreezes(client.id),
    published_at: now,
    updated_at: now,
  };
}

/** Push all local PT clients to the cloud so trainers can see them. */
router.post('/publish-clients', async (req, res) => {
  const trainerId = req.query.trainer_id;
  const clients = db.prepare(`
    SELECT c.*, t.name AS trainer_name
    FROM pt_clients c
    JOIN pt_trainers t ON t.id = c.trainer_id
    ${trainerId ? 'WHERE c.trainer_id = ?' : ''}
  `).all(...(trainerId ? [trainerId] : []));

  if (!clients.length) {
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

  for (const client of clients) {
    const current = byClientId.get(String(client.id));
    // Never overwrite trainer changes waiting for approval.
    if (current && REVIEW_STATUSES.includes(current.status)) {
      skipped += 1;
      continue;
    }
    const doc = buildClientDoc(client);
    const r = await persistDraftDoc(doc);
    if (r.ok) published += 1;
    else lastError = r.error || lastError;
  }

  if (published === 0 && lastError) {
    return res.status(503).json({ error: lastError });
  }
  res.json({ published, total: clients.length, skipped });
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
  // Mirror cloud drafts into local Mongo when available.
  if (via === 'cloud') {
    for (const draft of drafts) {
      await syncPtDraftToMongo(draft);
    }
  }
  res.json({ count: drafts.length, source: via, drafts: drafts.map(enrichDraft) });
});

router.post('/drafts/:draftId/confirm', async (req, res) => {
  const { drafts } = await fetchDrafts('all');
  const draft = (drafts || []).find((d) => d.draft_id === req.params.draftId);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  if (!REVIEW_STATUSES.includes(draft.status)) {
    return res.status(400).json({ error: 'Draft is not awaiting approval' });
  }

  try {
    const { clientId, trainerId } = applyPtDraftToSqlite(draft);
    const client = db.prepare(`
      SELECT c.*, t.name AS trainer_name
      FROM pt_clients c JOIN pt_trainers t ON t.id = c.trainer_id
      WHERE c.id = ?
    `).get(clientId);

    // Re-publish as a canonical confirmed client doc.
    const confirmedDoc = buildClientDoc(client);
    await persistDraftDoc(confirmedDoc);

    // Drop the old doc if it used a non-canonical id (new trainer draft).
    if (draft.draft_id !== confirmedDoc.draft_id) {
      await persistDraftDoc({
        ...draft,
        status: 'rejected',
        superseded_by: confirmedDoc.draft_id,
        updated_at: new Date().toISOString(),
      });
    }

    res.json({ ok: true, client_id: clientId, trainer_id: trainerId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/drafts/:draftId/reject', async (req, res) => {
  const { drafts } = await fetchDrafts('all');
  const draft = (drafts || []).find((d) => d.draft_id === req.params.draftId);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });

  const doc = {
    ...draft,
    status: 'rejected',
    reject_reason: (req.body?.reason || '').trim(),
    updated_at: new Date().toISOString(),
  };
  const r = await persistDraftDoc(doc);
  if (!r.ok) return res.status(503).json({ error: r.error || 'Could not reject draft' });
  res.json({ ok: true });
});

router.post('/sync-trainers', async (_req, res) => {
  const trainers = db.prepare('SELECT * FROM pt_trainers ORDER BY name COLLATE NOCASE ASC').all();
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
  return {
    ...draft,
    completed_sessions: completed,
    session_target: target,
    sessions_remaining: target != null ? Math.max(0, target - completed) : null,
    amount_due: Math.max(0, (draft.total_amount || 0) - paid),
    is_update: draft.status === 'update_pending',
  };
}

export default router;
