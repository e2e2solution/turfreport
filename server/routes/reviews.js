import { Router } from 'express';
import { createReview, reviewToSnapshot } from '../utils/reviewStore.js';
import db from '../db.js';
import { syncReviewToMongo } from '../db/mongo.js';
import { pushReviewToCloud } from '../utils/cloudSync.js';

const router = Router();

router.post('/', async (req, res) => {
  const { customer_name, happiness, comment } = req.body || {};
  const score = Number(happiness);
  const text = String(comment || '').trim();

  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return res.status(400).json({ error: 'Pick a happiness level (1–5)' });
  }
  if (!text) {
    return res.status(400).json({ error: 'Customer comment is required' });
  }

  const row = createReview({ customer_name, happiness: score, comment: text });
  const snapshot = reviewToSnapshot(row);

  const mongo = await syncReviewToMongo(snapshot);
  let cloud = { ok: false };
  if (process.env.CLOUD_SYNC_URL) {
    cloud = await pushReviewToCloud(snapshot);
  }

  const synced = mongo.ok || cloud.ok;
  res.json({
    success: true,
    review: snapshot,
    mongo_synced: mongo.ok,
    cloud_synced: cloud.ok,
    message: synced
      ? 'Customer feedback sent to owner.'
      : 'Saved locally only — owner will NOT see it until cloud sync works. Check MongoDB / Render deploy.',
    sync_error: !synced ? (mongo.error || cloud.error) : null,
  });
});

/** Re-push all unread reviews to cloud/Mongo (fix stuck notifications). */
router.post('/sync-pending', async (_req, res) => {
  const rows = db.prepare(`
    SELECT * FROM customer_reviews WHERE read_by_owner = 0 ORDER BY id ASC
  `).all();

  const results = [];
  for (const row of rows) {
    const snapshot = reviewToSnapshot(row);
    const mongo = await syncReviewToMongo(snapshot);
    let cloud = { ok: false };
    if (process.env.CLOUD_SYNC_URL) {
      cloud = await pushReviewToCloud(snapshot);
    }
    results.push({
      review_id: row.id,
      mongo_synced: mongo.ok,
      cloud_synced: cloud.ok,
      error: mongo.ok || cloud.ok ? null : (mongo.error || cloud.error),
    });
  }

  const synced = results.filter((r) => r.mongo_synced || r.cloud_synced).length;
  res.json({
    success: synced > 0 || results.length === 0,
    total: results.length,
    synced,
    results,
    message: results.length === 0
      ? 'No pending reviews to sync.'
      : synced
        ? `${synced} review(s) synced to owner cloud.`
        : 'Sync failed — redeploy Render with latest code, then try again.',
  });
});

export default router;
