import { findMany, findOne, replaceOne } from '../db/collections.js';
import { formatMonthLabel } from './cafeCsv.js';

export function cafeRowToReport(row) {
  if (!row) return null;
  const nested = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
  const { data: _data, ...rest } = row;
  return {
    ...rest,
    ...nested,
    month_key: row.month_key,
    label: formatMonthLabel(row.month_key),
    period_from: row.period_from,
    period_to: row.period_to,
    business_name: row.business_name,
    source_filename: row.source_filename,
    uploaded_at: row.uploaded_at,
    grand_qty: row.grand_qty,
    grand_total: row.grand_total,
  };
}

export async function listCafeMonthsFromSqlite() {
  const rows = await findMany('cafe_reports', {}, {
    sort: { month_key: -1 },
    projection: {
      month_key: 1,
      period_from: 1,
      period_to: 1,
      business_name: 1,
      grand_qty: 1,
      grand_total: 1,
      source_filename: 1,
      uploaded_at: 1,
    },
  });
  return rows.map((r) => ({
    ...r,
    label: formatMonthLabel(r.month_key),
  }));
}

export async function getCafeReportFromSqlite(monthKey) {
  const row = await findOne('cafe_reports', { month_key: monthKey });
  return cafeRowToReport(row);
}

export async function saveCafeReport(snapshot) {
  return replaceOne(
    'cafe_reports',
    { month_key: snapshot.month_key },
    snapshot,
    { upsert: true },
  );
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
