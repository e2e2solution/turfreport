import db from '../db.js';
import { formatMonthLabel } from './cafeCsv.js';

export function cafeRowToReport(row) {
  if (!row) return null;
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
  return {
    month_key: row.month_key,
    label: formatMonthLabel(row.month_key),
    period_from: row.period_from,
    period_to: row.period_to,
    business_name: row.business_name,
    source_filename: row.source_filename,
    uploaded_at: row.uploaded_at,
    grand_qty: row.grand_qty,
    grand_total: row.grand_total,
    ...data,
  };
}

export function listCafeMonthsFromSqlite() {
  const rows = db.prepare(`
    SELECT month_key, period_from, period_to, business_name, grand_qty, grand_total, source_filename, uploaded_at
    FROM cafe_reports
    ORDER BY month_key DESC
  `).all();
  return rows.map((r) => ({
    ...r,
    label: formatMonthLabel(r.month_key),
  }));
}

export function getCafeReportFromSqlite(monthKey) {
  const row = db.prepare('SELECT * FROM cafe_reports WHERE month_key = ?').get(monthKey);
  return cafeRowToReport(row);
}

export function buildCafeSnapshot(parsed) {
  return {
    month_key: parsed.month_key,
    label: formatMonthLabel(parsed.month_key),
    period_from: parsed.period_from,
    period_to: parsed.period_to,
    business_name: parsed.business_name || '',
    source_filename: parsed.source_filename || '',
    grand_qty: parsed.analysis.summary.total_qty,
    grand_total: parsed.analysis.summary.total_amount,
    categories: parsed.categories,
    items: parsed.items,
    analysis: parsed.analysis,
    uploaded_at: new Date().toISOString(),
  };
}

export function reportToSnapshot(report) {
  return {
    month_key: report.month_key,
    label: report.label || formatMonthLabel(report.month_key),
    period_from: report.period_from,
    period_to: report.period_to,
    business_name: report.business_name || '',
    source_filename: report.source_filename || '',
    grand_qty: report.grand_qty,
    grand_total: report.grand_total,
    categories: report.categories,
    items: report.items,
    analysis: report.analysis,
    uploaded_at: new Date().toISOString(),
  };
}

export function cafeLegacySyncKey(monthKey) {
  return `cafe-${monthKey}`;
}

/** Works with existing /api/owner/sync on Render (before cafe routes are deployed). */
export function reportToLegacySyncPayload(snapshot) {
  return {
    ...snapshot,
    payment_date: cafeLegacySyncKey(snapshot.month_key),
    report_type: 'cafe',
    pushed_at: new Date().toISOString(),
  };
}
