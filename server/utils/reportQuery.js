import { findMany, paymentDateFilter } from '../db/collections.js';
import {
  queryBulkSessionsForDate,
  queryBulkPaymentsForDate,
  queryBulkPaymentsInRange,
  queryBulkSessionsInRange,
} from './bulk.js';
import { sortTurfRows, sortGymRows } from './reportSort.js';
import {
  enrichOnlineBooking,
  queryOnlineDailyDisplayRows,
  queryOnlineDirectReceivedRows,
  queryOnlineSettlementRows,
} from './onlinePayments.js';
import { appendLinkedTurfBookings, annotateLinkedBookings } from './bookingLinks.js';
import { annotateGymLinks } from './gymLinks.js';

/** @deprecated Prefer paymentDateFilter from db/collections.js */
export const appendAnyPayment = paymentDateFilter;

function dateFieldFilter(field, from, to, singleDate) {
  if (singleDate) return { [field]: singleDate };
  if (from && to) return { [field]: { $gte: from, $lte: to } };
  return {};
}

function monthFieldFilter(field, from, to, singleDate) {
  if (singleDate) return { [field]: singleDate.slice(0, 7) };
  if (from && to) {
    return { [field]: { $gte: from.slice(0, 7), $lte: to.slice(0, 7) } };
  }
  return {};
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

export async function queryReportData({
  from,
  to,
  match_date,
  filter_type,
  section,
  include_bulk_pending,
  online_match_day,
}) {
  const paymentFilter = filter_type === 'payment' || filter_type === 'balance' || filter_type === 'advance';
  const addBulkPending = include_bulk_pending === true || include_bulk_pending === '1' || include_bulk_pending === 'true';
  // Daily report: show online by match date (pending visible), sum stays Direct GPay + settlements only.
  const onlineMatchDay = online_match_day === true
    || online_match_day === '1'
    || online_match_day === 'true'
    || addBulkPending;

  let turf = [];
  let online = [];
  let gym = [];
  let football_coaching = [];

  const wantTurf = (section === 'turf' || section === 'turf_online' || section === 'all' || !section) && section !== 'gym' && section !== 'football_coaching';
  const wantOnline = section !== 'gym' && section !== 'football_coaching' && (section === 'online' || section === 'turf_online' || section === 'all' || !section);
  const wantGym = section === 'gym' || section === 'all';
  const wantFootball = section === 'football_coaching' || section === 'all';

  if (wantTurf) {
    const turfFilter = paymentFilter
      ? paymentDateFilter(from, to, match_date)
      : dateFieldFilter('match_date', from, to, match_date);
    turf = await findMany('bookings', turfFilter, { sort: { match_date: 1, id: 1 } });
    if (!paymentFilter && match_date) {
      turf = [...turf, ...(await queryBulkSessionsForDate(match_date, 'turf'))];
    } else if (!paymentFilter && from && to) {
      turf = [...turf, ...(await queryBulkSessionsInRange(from, to, 'turf'))];
    } else if (paymentFilter) {
      const bulkPay = match_date
        ? await queryBulkPaymentsForDate(match_date, 'turf')
        : (from && to ? await queryBulkPaymentsInRange(from, to, 'turf') : []);
      turf = [...turf, ...bulkPay];
    }
    if (addBulkPending && match_date) {
      turf = [...turf, ...(await queryBulkSessionsForDate(match_date, 'turf'))];
    }
    // Include linked same-day bookings (e.g. football paid + badminton empty).
    turf = await appendLinkedTurfBookings(turf, { match_date, from, to });
    turf = annotateLinkedBookings(turf);
    turf = finalizeBulkRows(turf, sortTurfRows);
  }

  if (wantOnline) {
    if (paymentFilter && onlineMatchDay) {
      // Daily report: show matches by match date (pending visible).
      // Sum still uses Direct GPay + settlements only (calcDailyCollection).
      online = await queryOnlineDailyDisplayRows({ from, to, date: match_date });
    } else if (paymentFilter) {
      online = [
        ...(await queryOnlineDirectReceivedRows({ from, to, date: match_date })),
        ...(await queryOnlineSettlementRows({ from, to, date: match_date })),
      ];
    } else {
      const onlineFilter = dateFieldFilter('match_date', from, to, match_date);
      online = (await findMany('online_bookings', onlineFilter, {
        sort: { match_date: 1, id: 1 },
      })).map(enrichOnlineBooking);
    }
    if (!paymentFilter && match_date) {
      online = [...online, ...(await queryBulkSessionsForDate(match_date, 'online'))];
    } else if (!paymentFilter && from && to) {
      online = [...online, ...(await queryBulkSessionsInRange(from, to, 'online'))];
    } else if (paymentFilter && !onlineMatchDay) {
      const bulkPay = match_date
        ? await queryBulkPaymentsForDate(match_date, 'online')
        : (from && to ? await queryBulkPaymentsInRange(from, to, 'online') : []);
      online = [...online, ...bulkPay];
    }
    if (addBulkPending && match_date) {
      online = [...online, ...(await queryBulkSessionsForDate(match_date, 'online'))];
    }
    online = finalizeBulkRows(online, sortTurfRows);
  }

  if (wantGym) {
    const gymFilter = paymentFilter
      ? paymentDateFilter(from, to, match_date)
      : dateFieldFilter('start_date', from, to, match_date);
    gym = await findMany('gym_entries', gymFilter, { sort: { start_date: 1, id: 1 } });
    if (!paymentFilter && match_date) {
      gym = [...gym, ...(await queryBulkSessionsForDate(match_date, 'gym'))];
    } else if (!paymentFilter && from && to) {
      gym = [...gym, ...(await queryBulkSessionsInRange(from, to, 'gym'))];
    } else if (paymentFilter) {
      const bulkPay = match_date
        ? await queryBulkPaymentsForDate(match_date, 'gym')
        : (from && to ? await queryBulkPaymentsInRange(from, to, 'gym') : []);
      gym = [...gym, ...bulkPay];
    }
    if (addBulkPending && match_date) {
      gym = [...gym, ...(await queryBulkSessionsForDate(match_date, 'gym'))];
    }
    gym = annotateGymLinks(finalizeBulkRows(gym, sortGymRows));
  }

  if (wantFootball) {
    const fcFilter = paymentFilter
      ? paymentDateFilter(from, to, match_date)
      : monthFieldFilter('coaching_month', from, to, match_date);
    football_coaching = await findMany('football_coaching', fcFilter, {
      sort: { coaching_month: 1, id: 1 },
    });
  }

  return { turf, online, gym, football_coaching, paymentFilter, filter_type };
}
