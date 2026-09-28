import { findMany, findOne, paymentDateFilter } from '../db/collections.js';
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

async function buildBulkPaymentMeta(pkg) {
  const sessions = await getBulkSessions(pkg.id);
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

export async function getBulkPackage(id) {
  return findOne('bulk_packages', { id: Number(id) });
}

export async function getBulkSessions(bulkId) {
  return findMany('bulk_sessions', { bulk_id: Number(bulkId) }, {
    sort: { session_date: 1, id: 1 },
  });
}

export async function getBulkWithSessions(id) {
  const pkg = await getBulkPackage(id);
  if (!pkg) return null;
  const sessions = await getBulkSessions(id);
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

export async function packageToTurfPaymentRow(pkg) {
  const meta = await buildBulkPaymentMeta(pkg);
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

export async function packageToGymPaymentRow(pkg) {
  const meta = await buildBulkPaymentMeta(pkg);
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

async function mapSessionsWithPackages(sessions, category) {
  if (!sessions.length) return [];
  const bulkIds = [...new Set(sessions.map((s) => s.bulk_id))];
  const packages = await findMany('bulk_packages', {
    id: { $in: bulkIds },
    category,
  });
  const pkgById = new Map(packages.map((p) => [p.id, p]));

  return sessions
    .filter((session) => pkgById.has(session.bulk_id))
    .map((session) => {
      const pkg = pkgById.get(session.bulk_id);
      return category === 'gym'
        ? sessionToGymRow(session, pkg)
        : sessionToTurfRow(session, pkg);
    });
}

async function mapPaymentPackages(packages, category) {
  return Promise.all(
    packages.map((pkg) =>
      category === 'gym' ? packageToGymPaymentRow(pkg) : packageToTurfPaymentRow(pkg),
    ),
  );
}

export async function queryBulkSessionsForDate(date, category) {
  const sessions = await findMany('bulk_sessions', { session_date: date }, {
    sort: { id: 1 },
  });
  return mapSessionsWithPackages(sessions, category);
}

export async function queryBulkPaymentsForDate(date, category) {
  const packages = await findMany('bulk_packages', {
    category,
    status: 'CLOSED',
    ...paymentDateFilter(null, null, date),
  }, { sort: { id: 1 } });
  return mapPaymentPackages(packages, category);
}

export async function queryBulkPaymentsInRange(from, to, category) {
  const packages = await findMany('bulk_packages', {
    category,
    status: 'CLOSED',
    ...paymentDateFilter(from, to, null),
  }, { sort: { id: 1 } });
  return mapPaymentPackages(packages, category);
}

export async function queryBulkSessionsInRange(from, to, category) {
  const sessions = await findMany('bulk_sessions', {
    session_date: { $gte: from, $lte: to },
  }, { sort: { session_date: 1, id: 1 } });
  return mapSessionsWithPackages(sessions, category);
}

export async function queryBulkSessionsForSummary(from, to) {
  const sessions = await findMany('bulk_sessions', {
    session_date: { $gte: from, $lte: to },
  }, { sort: { session_date: 1 } });
  if (!sessions.length) return [];

  const bulkIds = [...new Set(sessions.map((s) => s.bulk_id))];
  const packages = await findMany('bulk_packages', {
    id: { $in: bulkIds },
    category: { $in: ['turf', 'online'] },
  });
  const pkgById = new Map(packages.map((p) => [p.id, p]));

  return sessions
    .filter((s) => pkgById.has(s.bulk_id))
    .map((s) => {
      const pkg = pkgById.get(s.bulk_id);
      return {
        session_date: s.session_date,
        time_slot: s.time_slot,
        hours: s.hours,
        sport: pkg.sport,
        category: pkg.category,
      };
    });
}

export function calcSessionHours(timeSlot) {
  return slotHours(timeSlot);
}
