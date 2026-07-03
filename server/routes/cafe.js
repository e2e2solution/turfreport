import { Router } from 'express';
import db from '../db.js';
import { formatMonthLabel, parseCafeCsv } from '../utils/cafeCsv.js';
import { getCafeReportFromSqlite, listCafeMonthsFromSqlite, reportToSnapshot } from '../utils/cafeStore.js';
import { syncCafeToMongo, getMongoError } from '../db/mongo.js';
import { pushCafeToCloud } from '../utils/cloudSync.js';

const router = Router();

async function pushCafeSnapshotToOwner(snapshot) {
  let cloud = { ok: false };
  let mongo = { ok: false };

  if (process.env.CLOUD_SYNC_URL) {
    cloud = await pushCafeToCloud(snapshot);
  }
  if (!cloud.ok) {
    mongo = await syncCafeToMongo(snapshot);
  }

  return { cloud, mongo, synced: cloud.ok || mongo.ok };
}

router.get('/months', (_req, res) => {
  res.json(listCafeMonthsFromSqlite());
});

router.get('/report', (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'month is required (YYYY-MM)' });

  const report = getCafeReportFromSqlite(month);
  if (!report) return res.status(404).json({ error: 'No cafe report for this month' });
  res.json(report);
});

router.post('/upload', async (req, res) => {
  const { csv, filename } = req.body || {};
  if (!csv || !String(csv).trim()) {
    return res.status(400).json({ error: 'CSV content is required' });
  }

  let parsed;
  try {
    parsed = parseCafeCsv(csv, filename || 'upload.csv');
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const payload = {
    categories: parsed.categories,
    items: parsed.items,
    analysis: parsed.analysis,
  };

  db.prepare(`
    INSERT INTO cafe_reports (
      month_key, period_from, period_to, business_name, source_filename,
      grand_qty, grand_total, data, uploaded_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(month_key) DO UPDATE SET
      period_from = excluded.period_from,
      period_to = excluded.period_to,
      business_name = excluded.business_name,
      source_filename = excluded.source_filename,
      grand_qty = excluded.grand_qty,
      grand_total = excluded.grand_total,
      data = excluded.data,
      uploaded_at = datetime('now')
  `).run(
    parsed.month_key,
    parsed.period_from,
    parsed.period_to,
    parsed.business_name || '',
    parsed.source_filename || '',
    parsed.analysis.summary.total_qty,
    parsed.analysis.summary.total_amount,
    JSON.stringify(payload),
  );

  res.status(201).json({
    message: `Cafe report saved for ${formatMonthLabel(parsed.month_key)}. Press Send to Owner to show on mobile app.`,
    month_key: parsed.month_key,
    label: formatMonthLabel(parsed.month_key),
    item_count: parsed.items.length,
    grand_total: parsed.analysis.summary.total_amount,
  });
});

router.post('/push-to-owner', async (req, res) => {
  const month = req.body?.month;
  if (!month) return res.status(400).json({ error: 'month is required (YYYY-MM)' });

  const report = getCafeReportFromSqlite(month);
  if (!report) return res.status(404).json({ error: 'No cafe report for this month. Upload CSV first.' });

  const snapshot = reportToSnapshot(report);
  const { cloud, mongo, synced } = await pushCafeSnapshotToOwner(snapshot);

  let note = 'Saved locally only — set CLOUD_SYNC_URL or MongoDB to reach owner phone';
  if (mongo.ok) note = 'Sent to MongoDB cloud — owner can view in Cafe tab';
  else if (cloud.ok) note = `Sent to cloud (${process.env.CLOUD_SYNC_URL}) — owner can view in Cafe tab`;

  if (process.env.NODE_ENV === 'production' && !synced) {
    return res.status(503).json({
      error: 'Could not send cafe report to cloud',
      mongo_note: mongo.error || getMongoError(),
      cloud_note: cloud.error,
    });
  }

  const cloudHint = !synced && cloud.error?.includes('404')
    ? ' Render server needs latest code deployed (Manual Deploy on Render).'
    : '';

  res.json({
    success: synced,
    message: synced
      ? `Cafe report sent for ${report.label}. Owner can open Cafe tab on mobile.`
      : `Could not reach cloud.${cloudHint} Check CLOUD_SYNC_URL and OWNER_SYNC_KEY in server/.env`,
    month_key: month,
    cloud_synced: cloud.ok,
    mongo_synced: mongo.ok,
    mongo_note: note,
    cloud_error: cloud.error || null,
  });
});

router.delete('/report/:monthKey', (req, res) => {
  const result = db.prepare('DELETE FROM cafe_reports WHERE month_key = ?').run(req.params.monthKey);
  if (result.changes === 0) return res.status(404).json({ error: 'Report not found' });
  res.json({ success: true });
});

export default router;
