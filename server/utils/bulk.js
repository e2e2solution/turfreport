import db from '../db.js';
import { slotHours } from './time.js';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDateDMY(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function bulkPeriodLabel(isoDate) {
  if (!isoDate) return '';
  const [y, m] = isoDate.split('-');
  const mi = parseInt(m, 10) - 1;
  return `${MONTH_NAMES[mi] || m} ${y}`;
}

function buildBulkPaymentMeta(pkg) {
  const sessions = getBulkSessions(pkg.id);
  const usedHours = sessions.reduce((sum, s) => sum + (s.hours || 0), 0);
  const payDate = pkg.balance_date || pkg.advance_date || '';
  const customRemarks = pkg.remarks && pkg.remarks !== 'bulk' ? pkg.remarks.trim() : '';

  if (!sessions.length) {
    return {
      match_date: null,
      match_date_end: null,
      time_slot: '—',
      remarks: customRemarks || `bulk #${pkg.id} | ${bulkPeriodLabel(payDate)} | ${pkg.total_hours}h pkg`,
      used_hours: usedHours,
      bulk_period: bulkPeriodLabel(payDate),
    };
  }

  const first = sessions[0].session_date;
  const last = sessions[sessions.length - 1].session_date;
  const sessionTimes = sessions
    .map((s) => `${formatDateDMY(s.session_date)} ${s.time_slot}`)
    .join(', ');
  const period = first === last
    ? bulkPeriodLabel(first)
    : `${bulkPeriodLabel(first)} – ${bulkPeriodLabel(last)}`;

  return {
    match_date: null,
    match_date_end: null,
    time_slot: sessionTimes,
    remarks: customRemarks || `bulk #${pkg.id} | ${period} | ${usedHours}h used / ${pkg.total_hours}h pkg | ${sessions.length} session${sessions.length === 1 ? '' : 's'}`,
    used_hours: usedHours,
    bulk_period: period,
  };
}

export function getBulkPackage(id) {
  return db.prepare('SELECT * FROM bulk_packages WHERE id = ?').get(id);
}

export function getBulkSessions(bulkId) {
  return db.prepare(
    'SELECT * FROM bulk_sessions WHERE bulk_id = ? ORDER BY session_date ASC, id ASC'
  ).all(bulkId);
}

export function getBulkWithSessions(id) {
  const pkg = getBulkPackage(id);
  if (!pkg) return null;
  const sessions = getBulkSessions(id);
  const usedHours = sessions.reduce((sum, s) => sum + (s.hours || 0), 0);
  return { ...pkg, sessions, used_hours: usedHours };
}

function closedBulkPaymentDisplay(pkg) {
  let advance_gpay = pkg.advance_gpay || 0;
  let advance_cash = pkg.advance_cash || 0;
  let advance_date = pkg.advance_date || null;
  let balance_gpay = pkg.balance_gpay || 0;
  let balance_cash = pkg.balance_cash || 0;
  let balance_date = pkg.balance_date || null;

  const balTotal = balance_gpay + balance_cash;
  const advTotal = advance_gpay + advance_cash;
  if (balTotal === 0 && advTotal > 0) {
    balance_gpay = advance_gpay;
    balance_cash = advance_cash;
    balance_date = advance_date;
    advance_gpay = 0;
    advance_cash = 0;
    advance_date = null;
  }

  return { advance_gpay, advance_cash, advance_date, balance_gpay, balance_cash, balance_date };
}

function bulkHasPayment(pkg) {
  return (pkg.advance_gpay || 0) + (pkg.advance_cash || 0)
    + (pkg.balance_gpay || 0) + (pkg.balance_cash || 0) > 0;
}

export function sessionToTurfRow(session, pkg) {
  const paid = bulkHasPayment(pkg);
  const pay = paid ? closedBulkPaymentDisplay(pkg) : null;
  return {
    id: `bulk-s-${session.id}`,
    bulk_session_id: session.id,
    bulk_id: pkg.id,
    is_bulk: true,
    name: pkg.name,
    sport: pkg.sport || 'cricket',
    match_date: session.session_date,
    total: paid ? (pkg.total_amount || 0) : 0,
    time_slot: session.time_slot,
    advance_gpay: paid ? pay.advance_gpay : 0,
    advance_cash: paid ? pay.advance_cash : 0,
    advance_date: paid ? pay.advance_date : null,
    balance_gpay: paid ? pay.balance_gpay : 0,
    balance_cash: paid ? pay.balance_cash : 0,
    balance_date: paid ? pay.balance_date : null,
    bulk_pkg_status: pkg.status || 'PENDING',
    status: paid ? 'CLOSED' : (pkg.status || 'PENDING'),
    remarks: session.remarks || `bulk #${pkg.id}`,
  };
}

export function sessionToGymRow(session, pkg) {
  const paid = bulkHasPayment(pkg);
  const pay = paid ? closedBulkPaymentDisplay(pkg) : null;
  return {
    id: `bulk-s-${session.id}`,
    bulk_session_id: session.id,
    bulk_id: pkg.id,
    is_bulk: true,
    name: pkg.name,
    plan_months: pkg.plan_months || 1,
    start_date: session.session_date,
    end_date: session.session_date,
    total: paid ? (pkg.total_amount || 0) : 0,
    personal_training_amount: 0,
    advance_gpay: paid ? pay.advance_gpay : 0,
    advance_cash: paid ? pay.advance_cash : 0,
    advance_date: paid ? pay.advance_date : null,
    balance_gpay: paid ? pay.balance_gpay : 0,
    balance_cash: paid ? pay.balance_cash : 0,
    balance_date: paid ? pay.balance_date : null,
    bulk_pkg_status: pkg.status || 'PENDING',
    status: paid ? 'CLOSED' : (pkg.status || 'PENDING'),
    remarks: session.remarks || `bulk #${pkg.id}`,
  };
}

export function packageToTurfPaymentRow(pkg) {
  const meta = buildBulkPaymentMeta(pkg);
  const pay = closedBulkPaymentDisplay(pkg);
  return {
    id: `bulk-p-${pkg.id}`,
    bulk_id: pkg.id,
    is_bulk: true,
    is_bulk_payment: true,
    name: pkg.name,
    sport: pkg.sport || 'cricket',
    match_date: meta.match_date,
    match_date_end: meta.match_date_end,
    total: pkg.total_amount || 0,
    time_slot: meta.time_slot,
    advance_gpay: pay.advance_gpay,
    advance_cash: pay.advance_cash,
    advance_date: pay.advance_date,
    balance_gpay: pay.balance_gpay,
    balance_cash: pay.balance_cash,
    balance_date: pay.balance_date,
    status: pkg.status,
    remarks: meta.remarks,
    bulk_period: meta.bulk_period,
    used_hours: meta.used_hours,
  };
}

export function packageToGymPaymentRow(pkg) {
  const meta = buildBulkPaymentMeta(pkg);
  const pay = closedBulkPaymentDisplay(pkg);
  return {
    id: `bulk-p-${pkg.id}`,
    bulk_id: pkg.id,
    is_bulk: true,
    is_bulk_payment: true,
    name: pkg.name,
    plan_months: pkg.plan_months || 1,
    start_date: null,
    end_date: null,
    total: pkg.total_amount || 0,
    personal_training_amount: 0,
    advance_gpay: pay.advance_gpay,
    advance_cash: pay.advance_cash,
    advance_date: pay.advance_date,
    balance_gpay: pay.balance_gpay,
    balance_cash: pay.balance_cash,
    balance_date: pay.balance_date,
    status: pkg.status,
    remarks: meta.remarks,
    bulk_period: meta.bulk_period,
    used_hours: meta.used_hours,
    time_slot: meta.time_slot,
  };
}

function pkgFromSessionRow(row) {
  return {
    id: row.pkg_id,
    category: row.category,
    name: row.pkg_name,
    sport: row.sport,
    plan_months: row.plan_months,
    status: row.pkg_status,
    total_amount: row.total_amount,
    advance_gpay: row.advance_gpay,
    advance_cash: row.advance_cash,
    advance_date: row.advance_date,
    balance_gpay: row.balance_gpay,
    balance_cash: row.balance_cash,
    balance_date: row.balance_date,
  };
}

export function queryBulkSessionsForDate(date, category) {
  const rows = db.prepare(`
    SELECT s.*, p.category, p.name AS pkg_name, p.sport, p.plan_months, p.id AS pkg_id, p.status AS pkg_status,
      p.total_amount, p.advance_gpay, p.advance_cash, p.advance_date,
      p.balance_gpay, p.balance_cash, p.balance_date
    FROM bulk_sessions s
    JOIN bulk_packages p ON p.id = s.bulk_id
    WHERE s.session_date = ? AND p.category = ?
    ORDER BY s.id ASC
  `).all(date, category);

  return rows.map((row) => {
    const pkg = pkgFromSessionRow(row);
    const session = {
      id: row.id,
      bulk_id: row.bulk_id,
      session_date: row.session_date,
      time_slot: row.time_slot,
      hours: row.hours,
      remarks: row.remarks,
    };
    return category === 'gym'
      ? sessionToGymRow(session, pkg)
      : sessionToTurfRow(session, pkg);
  });
}

export function queryBulkPaymentsForDate(date, category) {
  const packages = db.prepare(`
    SELECT * FROM bulk_packages
    WHERE category = ? AND status = 'CLOSED'
    AND (
      (advance_date = ? AND (advance_gpay > 0 OR advance_cash > 0))
      OR (balance_date = ? AND (balance_gpay > 0 OR balance_cash > 0))
    )
    ORDER BY id ASC
  `).all(category, date, date);

  return packages.map((pkg) =>
    category === 'gym' ? packageToGymPaymentRow(pkg) : packageToTurfPaymentRow(pkg)
  );
}

export function queryBulkPaymentsInRange(from, to, category) {
  const packages = db.prepare(`
    SELECT * FROM bulk_packages
    WHERE category = ? AND status = 'CLOSED'
    AND (
      (advance_date BETWEEN ? AND ? AND (advance_gpay > 0 OR advance_cash > 0))
      OR (balance_date BETWEEN ? AND ? AND (balance_gpay > 0 OR balance_cash > 0))
    )
    ORDER BY id ASC
  `).all(category, from, to, from, to);

  return packages.map((pkg) =>
    category === 'gym' ? packageToGymPaymentRow(pkg) : packageToTurfPaymentRow(pkg)
  );
}

export function queryBulkSessionsInRange(from, to, category) {
  const rows = db.prepare(`
    SELECT s.*, p.category, p.name AS pkg_name, p.sport, p.plan_months, p.id AS pkg_id, p.status AS pkg_status,
      p.total_amount, p.advance_gpay, p.advance_cash, p.advance_date,
      p.balance_gpay, p.balance_cash, p.balance_date
    FROM bulk_sessions s
    JOIN bulk_packages p ON p.id = s.bulk_id
    WHERE s.session_date BETWEEN ? AND ? AND p.category = ?
    ORDER BY s.session_date ASC, s.id ASC
  `).all(from, to, category);

  return rows.map((row) => {
    const pkg = pkgFromSessionRow(row);
    const session = {
      id: row.id,
      bulk_id: row.bulk_id,
      session_date: row.session_date,
      time_slot: row.time_slot,
      hours: row.hours,
      remarks: row.remarks,
    };
    return category === 'gym'
      ? sessionToGymRow(session, pkg)
      : sessionToTurfRow(session, pkg);
  });
}

export function queryBulkSessionsForSummary(from, to) {
  return db.prepare(`
    SELECT s.session_date, s.time_slot, s.hours, p.sport, p.category
    FROM bulk_sessions s
    JOIN bulk_packages p ON p.id = s.bulk_id
    WHERE s.session_date BETWEEN ? AND ? AND p.category IN ('turf', 'online')
    ORDER BY s.session_date ASC
  `).all(from, to);
}

export function calcSessionHours(timeSlot) {
  return slotHours(timeSlot);
}
