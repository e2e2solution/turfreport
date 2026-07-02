import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  verifyOwnerPin, signOwnerToken, ownerAuthMiddleware,
} from '../middleware/ownerAuth.js';
import { syncReportToMongo, isMongoReady, getMongoError } from '../db/mongo.js';
import { buildOwnerReportSnapshot } from '../utils/ownerReport.js';
import { saveOwnerReport } from '../utils/ownerStore.js';
import {
  listOwnerReportsAsync, getOwnerReportAsync, countOwnerReportsAsync,
} from '../utils/ownerStoreAsync.js';
import { pushReportToCloud } from '../utils/cloudSync.js';

const router = Router();

router.post('/login', (req, res) => {
  const pin = req.body?.pin;
  if (!pin || !String(pin).trim()) return res.status(400).json({ error: 'PIN required' });
  if (!verifyOwnerPin(pin)) return res.status(401).json({ error: 'Invalid PIN' });
  res.json({ token: signOwnerToken(), role: 'owner' });
});

/** Staff PC → cloud MongoDB when local Atlas connection fails (set CLOUD_SYNC_URL + OWNER_SYNC_KEY). */
router.post('/sync', async (req, res) => {
  const key = req.headers['x-sync-key'];
  if (!process.env.OWNER_SYNC_KEY || key !== process.env.OWNER_SYNC_KEY) {
    return res.status(401).json({ error: 'Invalid sync key' });
  }
  const snapshot = req.body;
  if (!snapshot?.payment_date) return res.status(400).json({ error: 'Invalid report snapshot' });

  const mongo = await syncReportToMongo(snapshot);
  if (!mongo.ok) {
    return res.status(503).json({ error: mongo.error || 'MongoDB unavailable' });
  }
  res.json({ success: true, mongo_synced: true, payment_date: snapshot.payment_date });
});

router.post('/push', authMiddleware, async (req, res) => {
  const { date } = req.body;
  if (!date) return res.status(400).json({ error: 'date (payment date) is required' });

  const snapshot = buildOwnerReportSnapshot(date);
  saveOwnerReport(snapshot);

  let mongo = { ok: false };
  let cloud = { ok: false };

  // Prefer cloud sync when staff PC cannot reach MongoDB directly
  if (process.env.CLOUD_SYNC_URL) {
    cloud = await pushReportToCloud(snapshot);
  }
  if (!cloud.ok) {
    mongo = await syncReportToMongo(snapshot);
  }

  const synced = mongo.ok || cloud.ok;
  let mongoNote = 'Saved locally (MongoDB optional — update server/.env password to enable cloud)';
  if (mongo.ok) mongoNote = 'Saved to MongoDB cloud — owner can view from anywhere';
  else if (cloud.ok) mongoNote = `Saved to cloud (${process.env.CLOUD_SYNC_URL}) — owner can view from anywhere`;
  else if (process.env.NODE_ENV === 'production' && !synced) {
    return res.status(503).json({
      error: 'Could not save to cloud database',
      mongo_note: mongo.error || getMongoError(),
      cloud_note: cloud.error,
    });
  }

  res.json({
    success: true,
    message: synced
      ? `Report saved for ${date}. Owner can open the mobile app from anywhere.`
      : `Report saved locally for ${date}. Cloud sync failed — owner needs same Wi‑Fi or fix MongoDB.`,
    mongo_synced: mongo.ok,
    cloud_synced: cloud.ok,
    mongo_note: mongoNote,
    report: snapshot,
  });
});

router.get('/reports', ownerAuthMiddleware, async (req, res) => {
  const max = Math.min(Number(req.query.limit) || 60, 120);
  const reports = await listOwnerReportsAsync(max);
  res.json(reports);
});

router.get('/reports/:date', ownerAuthMiddleware, async (req, res) => {
  const report = await getOwnerReportAsync(req.params.date);
  if (!report) return res.status(404).json({ error: 'No report for this date' });
  res.json(report);
});

router.get('/status', ownerAuthMiddleware, async (_req, res) => {
  res.json({
    reports_count: await countOwnerReportsAsync(),
    mongo_synced: isMongoReady(),
    mongo_error: isMongoReady() ? null : getMongoError(),
    cloud_url: process.env.CLOUD_SYNC_URL || null,
  });
});

export default router;
