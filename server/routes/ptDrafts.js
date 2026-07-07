import { Router } from 'express';
import {
  getPtDraftFromMongo,
  isMongoReady,
  getMongoError,
  listPtDraftsFromMongo,
  syncPtDraftToMongo,
  syncTrainerToMongo,
  updatePtDraftStatusInMongo,
} from '../db/mongo.js';
import { applyPtDraftToSqlite } from '../utils/ptDraftApply.js';
import { fetchPtDraftsFromCloud } from '../utils/cloudSync.js';
import db from '../db.js';

const router = Router();

router.get('/drafts', async (req, res) => {
  const status = req.query.status || 'pending';
  let drafts = await listPtDraftsFromMongo({ status });
  if (!drafts && process.env.CLOUD_SYNC_URL) {
    const cloud = await fetchPtDraftsFromCloud({ status });
    if (cloud.ok) drafts = cloud.drafts;
  }
  if (!drafts) {
    return res.status(503).json({
      error: getMongoError() || 'MongoDB unavailable. Set MONGODB_URI or CLOUD_SYNC_URL.',
    });
  }
  res.json(drafts);
});

router.post('/drafts/collect', async (req, res) => {
  let drafts = await listPtDraftsFromMongo({ status: 'pending' });
  let source = 'mongo';

  if (!drafts?.length && process.env.CLOUD_SYNC_URL) {
    const cloud = await fetchPtDraftsFromCloud({ status: 'pending' });
    if (cloud.ok) {
      drafts = cloud.drafts;
      source = 'cloud';
      for (const draft of drafts) {
        await syncPtDraftToMongo(draft);
      }
    }
  }

  if (!drafts) {
    return res.status(503).json({ error: getMongoError() || 'Could not collect drafts' });
  }

  res.json({ count: drafts.length, source, drafts });
});

router.post('/drafts/:draftId/confirm', async (req, res) => {
  let draft = await getPtDraftFromMongo(req.params.draftId);
  if (!draft && process.env.CLOUD_SYNC_URL) {
    const cloud = await fetchPtDraftsFromCloud({ status: 'pending' });
    if (cloud.ok) {
      draft = cloud.drafts.find((d) => d.draft_id === req.params.draftId);
      if (draft) await syncPtDraftToMongo(draft);
    }
  }
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  if (draft.status !== 'pending') return res.status(400).json({ error: 'Draft is not pending' });

  try {
    const { clientId, trainerId } = applyPtDraftToSqlite(draft);
    await updatePtDraftStatusInMongo(draft.draft_id, 'confirmed', {
      local_client_id: clientId,
      confirmed_at: new Date().toISOString(),
    });
    res.json({ ok: true, client_id: clientId, trainer_id: trainerId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/drafts/:draftId/reject', async (req, res) => {
  const result = await updatePtDraftStatusInMongo(req.params.draftId, 'rejected', {
    rejected_at: new Date().toISOString(),
    reject_reason: (req.body?.reason || '').trim(),
  });
  if (!result.ok) return res.status(503).json({ error: result.error || 'Could not reject draft' });
  res.json({ ok: true });
});

router.post('/sync-trainers', async (_req, res) => {
  const trainers = db.prepare('SELECT * FROM pt_trainers ORDER BY name COLLATE NOCASE ASC').all();
  if (!isMongoReady()) {
    return res.status(503).json({ error: getMongoError() || 'MongoDB unavailable' });
  }
  const results = [];
  for (const trainer of trainers) {
    const r = await syncTrainerToMongo(trainer);
    results.push({ id: trainer.id, name: trainer.name, ok: r.ok });
  }
  res.json({ synced: results.filter((r) => r.ok).length, total: trainers.length, results });
});

export default router;
