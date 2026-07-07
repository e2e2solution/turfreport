import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  verifyOwnerPin, signOwnerToken, ownerAuthMiddleware,
} from '../middleware/ownerAuth.js';
import { syncReportToMongo, isMongoReady, getMongoError, syncCafeToMongo, listCafeMonthsFromMongo, getCafeReportFromMongo, syncReviewToMongo, getLatestUnreadReviewFromMongo, markReviewReadInMongo, listReviewsFromMongo, syncPtDraftToMongo, listPtDraftsFromMongo } from '../db/mongo.js';
import { buildOwnerReportSnapshot } from '../utils/ownerReport.js';
import { saveOwnerReport } from '../utils/ownerStore.js';
import {
  listOwnerReportsAsync, getOwnerReportAsync, countOwnerReportsAsync,
} from '../utils/ownerStoreAsync.js';
import { pushReportToCloud } from '../utils/cloudSync.js';
import { getCafeReportFromSqlite, listCafeMonthsFromSqlite } from '../utils/cafeStore.js';
import { getLatestUnreadReview, markReviewRead, reviewToSnapshot, listAllReviews } from '../utils/reviewStore.js';
import { legacyReportToReview, isLegacyReviewReport } from '../utils/reviewLegacy.js';

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

  const isReview = snapshot?.report_type === 'review'
    || (snapshot?.review_id && snapshot?.comment);

  if (isReview) {
    const mongo = await syncReviewToMongo({
      ...snapshot,
      read_by_owner: Boolean(snapshot.read_by_owner),
    });
    if (!mongo.ok) {
      return res.status(503).json({ error: mongo.error || 'MongoDB unavailable' });
    }
    return res.json({ success: true, mongo_synced: true, review_id: snapshot.review_id, type: 'review' });
  }

  const isCafe = snapshot?.report_type === 'cafe'
    || snapshot?.month_key
    || String(snapshot?.payment_date || '').startsWith('cafe-');

  if (isCafe && !snapshot?.month_key && snapshot?.payment_date) {
    snapshot.month_key = String(snapshot.payment_date).replace(/^cafe-/, '');
  }

  if (isCafe) {
    const mongo = await syncCafeToMongo(snapshot);
    if (!mongo.ok) {
      const fallback = await syncReportToMongo(snapshot);
      if (!fallback.ok) {
        return res.status(503).json({ error: mongo.error || fallback.error || 'MongoDB unavailable' });
      }
      return res.json({
        success: true,
        mongo_synced: true,
        month_key: snapshot.month_key,
        type: 'cafe',
        via: 'daily_reports',
      });
    }
    return res.json({ success: true, mongo_synced: true, month_key: snapshot.month_key, type: 'cafe' });
  }

  if (!snapshot?.payment_date) return res.status(400).json({ error: 'Invalid report snapshot' });

  const mongo = await syncReportToMongo(snapshot);
  if (!mongo.ok) {
    return res.status(503).json({ error: mongo.error || 'MongoDB unavailable' });
  }
  res.json({ success: true, mongo_synced: true, payment_date: snapshot.payment_date });
});

router.post('/sync-cafe', async (req, res) => {
  const key = req.headers['x-sync-key'];
  if (!process.env.OWNER_SYNC_KEY || key !== process.env.OWNER_SYNC_KEY) {
    return res.status(401).json({ error: 'Invalid sync key' });
  }
  const snapshot = req.body;
  if (!snapshot?.month_key) return res.status(400).json({ error: 'Invalid cafe snapshot' });

  const mongo = await syncCafeToMongo(snapshot);
  if (!mongo.ok) {
    return res.status(503).json({ error: mongo.error || 'MongoDB unavailable' });
  }
  res.json({ success: true, mongo_synced: true, month_key: snapshot.month_key });
});

router.post('/sync-review', async (req, res) => {
  const key = req.headers['x-sync-key'];
  if (!process.env.OWNER_SYNC_KEY || key !== process.env.OWNER_SYNC_KEY) {
    return res.status(401).json({ error: 'Invalid sync key' });
  }
  const review = req.body;
  if (!review?.review_id || !review?.comment) {
    return res.status(400).json({ error: 'Invalid review payload' });
  }

  const mongo = await syncReviewToMongo({
    ...review,
    read_by_owner: Boolean(review.read_by_owner),
  });
  if (!mongo.ok) {
    return res.status(503).json({ error: mongo.error || 'MongoDB unavailable' });
  }
  res.json({ success: true, mongo_synced: true, review_id: review.review_id });
});

router.post('/sync-pt-draft', async (req, res) => {
  const key = req.headers['x-sync-key'];
  if (!process.env.OWNER_SYNC_KEY || key !== process.env.OWNER_SYNC_KEY) {
    return res.status(401).json({ error: 'Invalid sync key' });
  }
  const draft = req.body;
  if (!draft?.draft_id || !draft?.trainer_id) {
    return res.status(400).json({ error: 'Invalid PT draft payload' });
  }

  const mongo = await syncPtDraftToMongo({ ...draft, status: draft.status || 'pending' });
  if (!mongo.ok) {
    return res.status(503).json({ error: mongo.error || 'MongoDB unavailable' });
  }
  res.json({ success: true, mongo_synced: true, draft_id: draft.draft_id });
});

router.get('/pt-drafts', async (req, res) => {
  const key = req.headers['x-sync-key'];
  if (!process.env.OWNER_SYNC_KEY || key !== process.env.OWNER_SYNC_KEY) {
    return res.status(401).json({ error: 'Invalid sync key' });
  }
  const status = req.query.status || 'pending';
  const drafts = await listPtDraftsFromMongo({ status });
  if (!drafts) {
    return res.status(503).json({ error: getMongoError() || 'MongoDB unavailable' });
  }
  res.json({ drafts });
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
  res.json(reports.filter((r) => !String(r.payment_date || '').startsWith('cafe-')));
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

router.get('/cafe/months', ownerAuthMiddleware, async (_req, res) => {
  const mongoRows = await listCafeMonthsFromMongo();
  if (mongoRows?.length) return res.json(mongoRows);

  const legacy = (await listOwnerReportsAsync(120))
    .filter((r) => String(r.payment_date || '').startsWith('cafe-') || r.report_type === 'cafe')
    .map((r) => ({
      month_key: r.month_key || String(r.payment_date).replace(/^cafe-/, ''),
      label: r.label || r.month_key,
      period_from: r.period_from,
      period_to: r.period_to,
      business_name: r.business_name,
      grand_qty: r.grand_qty,
      grand_total: r.grand_total,
    }));
  if (legacy.length) return res.json(legacy);

  res.json(listCafeMonthsFromSqlite());
});

router.get('/cafe/report', ownerAuthMiddleware, async (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'month is required (YYYY-MM)' });

  const mongoReport = await getCafeReportFromMongo(month);
  if (mongoReport) return res.json(mongoReport);

  const legacy = await getOwnerReportAsync(`cafe-${month}`);
  if (legacy && (legacy.report_type === 'cafe' || legacy.month_key)) return res.json(legacy);

  const report = getCafeReportFromSqlite(month);
  if (!report) return res.status(404).json({ error: 'No cafe report for this month' });
  res.json(report);
});

router.get('/reviews/latest', ownerAuthMiddleware, async (_req, res) => {
  const mongoReview = await getLatestUnreadReviewFromMongo();
  if (mongoReview) return res.json(mongoReview);

  const local = getLatestUnreadReview();
  if (local) return res.json(reviewToSnapshot(local));

  res.json(null);
});

router.get('/reviews', ownerAuthMiddleware, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const mongoRows = await listReviewsFromMongo(limit);
  if (mongoRows?.length) return res.json(mongoRows);

  const legacyReports = (await listOwnerReportsAsync(limit))
    .filter(isLegacyReviewReport)
    .map(legacyReportToReview)
    .filter(Boolean);

  if (legacyReports.length) {
    return res.json(legacyReports.sort(
      (a, b) => String(b.created_at || b.review_id).localeCompare(String(a.created_at || a.review_id)),
    ));
  }

  res.json(listAllReviews(limit).map(reviewToSnapshot));
});

router.post('/reviews/:id/read', ownerAuthMiddleware, async (req, res) => {
  const reviewId = Number(req.params.id);
  if (!reviewId) return res.status(400).json({ error: 'Invalid review id' });

  await markReviewReadInMongo(reviewId);
  markReviewRead(reviewId);

  res.json({ success: true });
});

export default router;
