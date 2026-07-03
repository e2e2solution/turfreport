import db from '../db.js';
import {
  queryBulkSessionsForDate,
  queryBulkPaymentsForDate,
  queryBulkPaymentsInRange,
  queryBulkSessionsInRange,
} from './bulk.js';
import { sortTurfRows, sortGymRows } from './reportSort.js';

function filterByMonth(sql, params, dateField, from, to, singleDate) {
  if (singleDate) {
    sql += ` AND ${dateField} = ?`;
    params.push(singleDate.slice(0, 7));
  } else if (from && to) {
    sql += ` AND ${dateField} BETWEEN ? AND ?`;
    params.push(from.slice(0, 7), to.slice(0, 7));
  }
  return sql;
}

function filterByDate(sql, params, dateField, from, to, singleDate) {
  if (singleDate) {
    sql += ` AND ${dateField} = ?`;
    params.push(singleDate);
  } else if (from && to) {
    sql += ` AND ${dateField} BETWEEN ? AND ?`;
    params.push(from, to);
  }
  return sql;
}

export function appendAnyPayment(sql, params, from, to, singleDate) {
  if (singleDate) {
    sql += ` AND (
      (advance_date = ? AND (advance_gpay > 0 OR advance_cash > 0))
      OR (balance_date = ? AND (balance_gpay > 0 OR balance_cash > 0))
    )`;
    params.push(singleDate, singleDate);
  } else if (from && to) {
    sql += ` AND (
      (advance_date BETWEEN ? AND ? AND (advance_gpay > 0 OR advance_cash > 0))
      OR (balance_date BETWEEN ? AND ? AND (balance_gpay > 0 OR balance_cash > 0))
    )`;
    params.push(from, to, from, to);
  }
  return sql;
}

/** Drop bulk payment row when a session for the same bulk is already on this report day */
function dedupeBulkPaymentWithSession(rows) {
  const bulkIdsWithSession = new Set(
    rows.filter((r) => r.is_bulk && !r.is_bulk_payment && r.bulk_id).map((r) => r.bulk_id),
  );
  return rows.filter((r) => !(r.is_bulk_payment && bulkIdsWithSession.has(r.bulk_id)));
}

/** Same bulk, same day: show payment/total on first session row only (not every match slot). */
function dedupeBulkSessionPaymentsSameDay(rows) {
  const seen = new Set();
  return rows.map((row) => {
    if (!row.is_bulk || row.is_bulk_payment || !row.bulk_id) return row;
    const date = row.match_date || row.start_date;
    if (!date) return row;
    const paid = (row.advance_gpay || 0) + (row.advance_cash || 0)
      + (row.balance_gpay || 0) + (row.balance_cash || 0) > 0
      || (row.total || 0) > 0;
    if (!paid) return row;
    const key = `${row.bulk_id}:${date}`;
    if (seen.has(key)) {
      return {
        ...row,
        total: 0,
        advance_gpay: 0,
        advance_cash: 0,
        advance_date: null,
        balance_gpay: 0,
        balance_cash: 0,
        balance_date: null,
      };
    }
    seen.add(key);
    return row;
  });
}

function finalizeBulkRows(rows, sortFn) {
  return dedupeBulkSessionPaymentsSameDay(sortFn(dedupeBulkPaymentWithSession(rows)));
}

export function queryReportData({ from, to, match_date, filter_type, section, include_bulk_pending }) {
  const paymentFilter = filter_type === 'payment' || filter_type === 'balance' || filter_type === 'advance';
  const addBulkPending = include_bulk_pending === true || include_bulk_pending === '1' || include_bulk_pending === 'true';

  let turf = [];
  let online = [];
  let gym = [];
  let football_coaching = [];

  const wantTurf = (section === 'turf' || section === 'turf_online' || section === 'all' || !section) && section !== 'gym' && section !== 'football_coaching';
  const wantOnline = section !== 'gym' && section !== 'football_coaching' && (section === 'online' || section === 'turf_online' || section === 'all' || !section);
  const wantGym = section === 'gym' || section === 'all';
  const wantFootball = section === 'football_coaching' || section === 'all';

  if (wantTurf) {
    let turfSql = 'SELECT * FROM bookings WHERE 1=1';
    const turfParams = [];
    if (paymentFilter) {
      turfSql = appendAnyPayment(turfSql, turfParams, from, to, match_date);
    } else {
      turfSql = filterByDate(turfSql, turfParams, 'match_date', from, to, match_date);
    }
    turfSql += ' ORDER BY match_date ASC, id ASC';
    turf = db.prepare(turfSql).all(...turfParams);
    if (!paymentFilter && match_date) {
      turf = [...turf, ...queryBulkSessionsForDate(match_date, 'turf')];
    } else if (!paymentFilter && from && to) {
      turf = [...turf, ...queryBulkSessionsInRange(from, to, 'turf')];
    } else if (paymentFilter) {
      const bulkPay = match_date
        ? queryBulkPaymentsForDate(match_date, 'turf')
        : (from && to ? queryBulkPaymentsInRange(from, to, 'turf') : []);
      turf = [...turf, ...bulkPay];
    }
    if (addBulkPending && match_date) {
      turf = [...turf, ...queryBulkSessionsForDate(match_date, 'turf')];
    }
    turf = finalizeBulkRows(turf, sortTurfRows);
  }

  if (wantOnline) {
    let onlineSql = 'SELECT * FROM online_bookings WHERE 1=1';
    const onlineParams = [];
    if (paymentFilter) {
      onlineSql = appendAnyPayment(onlineSql, onlineParams, from, to, match_date);
    } else {
      onlineSql = filterByDate(onlineSql, onlineParams, 'match_date', from, to, match_date);
    }
    onlineSql += ' ORDER BY match_date ASC, id ASC';
    online = db.prepare(onlineSql).all(...onlineParams);
    if (!paymentFilter && match_date) {
      online = [...online, ...queryBulkSessionsForDate(match_date, 'online')];
    } else if (!paymentFilter && from && to) {
      online = [...online, ...queryBulkSessionsInRange(from, to, 'online')];
    } else if (paymentFilter) {
      const bulkPay = match_date
        ? queryBulkPaymentsForDate(match_date, 'online')
        : (from && to ? queryBulkPaymentsInRange(from, to, 'online') : []);
      online = [...online, ...bulkPay];
    }
    if (addBulkPending && match_date) {
      online = [...online, ...queryBulkSessionsForDate(match_date, 'online')];
    }
    online = finalizeBulkRows(online, sortTurfRows);
  }

  if (wantGym) {
    let gymSql = 'SELECT * FROM gym_entries WHERE 1=1';
    const gymParams = [];
    if (paymentFilter) {
      gymSql = appendAnyPayment(gymSql, gymParams, from, to, match_date);
    } else {
      gymSql = filterByDate(gymSql, gymParams, 'start_date', from, to, match_date);
    }
    gymSql += ' ORDER BY start_date ASC, id ASC';
    gym = db.prepare(gymSql).all(...gymParams);
    if (!paymentFilter && match_date) {
      gym = [...gym, ...queryBulkSessionsForDate(match_date, 'gym')];
    } else if (!paymentFilter && from && to) {
      gym = [...gym, ...queryBulkSessionsInRange(from, to, 'gym')];
    } else if (paymentFilter) {
      const bulkPay = match_date
        ? queryBulkPaymentsForDate(match_date, 'gym')
        : (from && to ? queryBulkPaymentsInRange(from, to, 'gym') : []);
      gym = [...gym, ...bulkPay];
    }
    if (addBulkPending && match_date) {
      gym = [...gym, ...queryBulkSessionsForDate(match_date, 'gym')];
    }
    gym = finalizeBulkRows(gym, sortGymRows);
  }

  if (wantFootball) {
    let fcSql = 'SELECT * FROM football_coaching WHERE 1=1';
    const fcParams = [];
    if (paymentFilter) {
      fcSql = appendAnyPayment(fcSql, fcParams, from, to, match_date);
    } else {
      fcSql = filterByMonth(fcSql, fcParams, 'coaching_month', from, to, match_date);
    }
    fcSql += ' ORDER BY coaching_month ASC, id ASC';
    football_coaching = db.prepare(fcSql).all(...fcParams);
  }

  return { turf, online, gym, football_coaching, paymentFilter, filter_type };
}
