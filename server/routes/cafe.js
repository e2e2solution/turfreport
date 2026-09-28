import { Router } from 'express';
import { deleteOne } from '../db/collections.js';
import { formatMonthLabel, parseCafeCsv } from '../utils/cafeCsv.js';
import {
  buildCafeSnapshot,
  getCafeReportFromSqlite,
  listCafeMonthsFromSqlite,
  reportToSnapshot,
  saveCafeReport,
} from '../utils/cafeStore.js';
import { buildCafeMonthCompare, cafeCompareToCsv, cafeReportItemsToCsv } from '../utils/cafeCompare.js';
import { syncCafeToMongo, getMongoError } from '../db/mongo.js';
import { pushCafeToCloud } from '../utils/cloudSync.js';

const router = Router();

async function pushCafeSnapshotToOwner(snapshot) {
  const mongo = await syncCafeToMongo(snapshot);
  let cloud = { ok: false };
  if (!mongo.ok && process.env.CLOUD_SYNC_URL) {
    cloud = await pushCafeToCloud(snapshot);
  }
  return { cloud, mongo, synced: cloud.ok || mongo.ok };
}

router.get('/months', async (_req, res) => {
  res.json(await listCafeMonthsFromSqlite());
});

router.get('/report', async (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'month is required (YYYY-MM)' });

  const report = await getCafeReportFromSqlite(month);
  if (!report) return res.status(404).json({ error: 'No cafe report for this month' });
  res.json(report);
});

router.get('/compare', async (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'month is required (YYYY-MM)' });

  const payload = await buildCafeMonthCompare(month);
  if (!payload) return res.status(404).json({ error: 'No cafe report for this month' });
  res.json(payload);
});

router.get('/download', async (req, res) => {
  const { month, type } = req.query;
  if (!month) return res.status(400).json({ error: 'month is required (YYYY-MM)' });

  if (type === 'compare') {
    const payload = await buildCafeMonthCompare(month);
    if (!payload) return res.status(404).json({ error: 'No cafe report for this month' });
    const csv = cafeCompareToCsv(payload);
    const filename = `Cafe_Compare_${month}_vs_${payload.compare.previous_month_key || 'none'}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  }

  const report = await getCafeReportFromSqlite(month);
  if (!report) return res.status(404).json({ error: 'No cafe report for this month' });
  const csv = cafeReportItemsToCsv(report);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="Cafe_Results_${month}.csv"`);
  return res.send(csv);
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

  const snapshot = buildCafeSnapshot(parsed);
  await saveCafeReport(snapshot);

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

  const report = await getCafeReportFromSqlite(month);
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

router.delete('/report/:monthKey', async (req, res) => {
  const ok = await deleteOne('cafe_reports', { month_key: req.params.monthKey });
  if (!ok) return res.status(404).json({ error: 'Report not found' });
  res.json({ success: true });
});

export default router;
