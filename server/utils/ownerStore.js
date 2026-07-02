import db from '../db.js';

export function saveOwnerReport(snapshot) {
  db.prepare(`
    INSERT INTO owner_daily_reports (payment_date, data, pushed_at)
    VALUES (?, ?, ?)
    ON CONFLICT(payment_date) DO UPDATE SET
      data = excluded.data,
      pushed_at = excluded.pushed_at
  `).run(
    snapshot.payment_date,
    JSON.stringify(snapshot),
    snapshot.pushed_at,
  );
}

export function listOwnerReports(limit = 60) {
  const rows = db.prepare(`
    SELECT data FROM owner_daily_reports
    ORDER BY payment_date DESC
    LIMIT ?
  `).all(limit);
  return rows.map((r) => JSON.parse(r.data));
}

export function getOwnerReport(date) {
  const row = db.prepare('SELECT data FROM owner_daily_reports WHERE payment_date = ?').get(date);
  return row ? JSON.parse(row.data) : null;
}

export function countOwnerReports() {
  return db.prepare('SELECT COUNT(*) AS n FROM owner_daily_reports').get().n;
}
