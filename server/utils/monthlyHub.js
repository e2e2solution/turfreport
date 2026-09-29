import { findMany, paymentDateFilter } from '../db/collections.js';
import { slotHours } from './time.js';
import { getRange } from './summaryDates.js';
import { queryBulkSessionsForSummary } from './bulk.js';
import { gymMemberCountForName } from './gymCount.js';
import {
  queryOnlineDirectReceivedRows,
  queryOnlineSettlementRows,
} from './onlinePayments.js';
import { SPORTS, sportLabel } from './sports.js';
import { formatMonthLabel } from './cafeCsv.js';

function emptyBucket() {
  return { hours: 0, revenue: 0, bookings: 0 };
}

function ceilHours(h) {
  return Math.ceil(h || 0);
}

function paymentOnDatesInRange(row, from, to) {
  let amount = 0;
  if (row.advance_date && row.advance_date >= from && row.advance_date <= to) {
    amount += (Number(row.advance_gpay) || 0) + (Number(row.advance_cash) || 0);
  }
  if (row.balance_date && row.balance_date >= from && row.balance_date <= to) {
    amount += (Number(row.balance_gpay) || 0) + (Number(row.balance_cash) || 0);
  }
  return amount;
}

function onlineReceiptInRange(row, from, to) {
  if (row.is_online_settlement) {
    if (row.credit_date >= from && row.credit_date <= to) {
      return Number(row.received_amount) || 0;
    }
    return 0;
  }
  return paymentOnDatesInRange(row, from, to);
}

/**
 * Monthly hub breakdown: hours + revenue by turf sport, online, and gym.
 * Hours: matches / sessions with date in the month.
 * Revenue: money received in the month (payment / credit dates).
 */
export async function buildMonthlyHubBreakdown(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey || ''))) {
    throw new Error('month must be YYYY-MM');
  }
  const anchor = `${monthKey}-01`;
  const range = getRange('monthly', anchor);

  const turfBySport = Object.fromEntries(SPORTS.map((s) => [s, emptyBucket()]));
  const online = emptyBucket();
  const gym = { hours: null, revenue: 0, admissions: 0 };

  function turfSportKey(sport) {
    // Cricket ball is the same play as cricket — fold into cricket hours/revenue.
    if (sport === 'cricket_ball') return 'cricket';
    return SPORTS.includes(sport) ? sport : 'cricket';
  }

  const turfRows = await findMany('bookings', {
    match_date: { $gte: range.from, $lte: range.to },
  });
  for (const row of turfRows) {
    const sport = turfSportKey(row.sport);
    turfBySport[sport].hours += slotHours(row.time_slot);
    turfBySport[sport].bookings += 1;
  }

  // Revenue by sport: payments received in this month (any match date)
  const turfPayRows = await findMany('bookings', paymentDateFilter(range.from, range.to, null));
  for (const row of turfPayRows) {
    const pay = paymentOnDatesInRange(row, range.from, range.to);
    if (pay <= 0) continue;
    const sport = turfSportKey(row.sport);
    turfBySport[sport].revenue += pay;
  }

  const onlineRows = await findMany('online_bookings', {
    match_date: { $gte: range.from, $lte: range.to },
  });
  for (const row of onlineRows) {
    online.hours += slotHours(row.time_slot);
    online.bookings += 1;
  }

  const onlineReceipts = [
    ...(await queryOnlineDirectReceivedRows({ from: range.from, to: range.to })),
    ...(await queryOnlineSettlementRows({ from: range.from, to: range.to })),
  ];
  for (const row of onlineReceipts) {
    online.revenue += onlineReceiptInRange(row, range.from, range.to);
  }

  const bulkSessions = await queryBulkSessionsForSummary(range.from, range.to);
  for (const row of bulkSessions) {
    const hours = row.hours || slotHours(row.time_slot);
    if (row.category === 'online') {
      online.hours += hours;
      online.bookings += 1;
    } else {
      const sport = turfSportKey(row.sport);
      turfBySport[sport].hours += hours;
      turfBySport[sport].bookings += 1;
    }
  }

  // Bulk package payments received in month
  const bulkPkgs = await findMany('bulk_packages', {
    status: 'CLOSED',
    ...paymentDateFilter(range.from, range.to, null),
  });
  for (const row of bulkPkgs) {
    const pay = paymentOnDatesInRange(row, range.from, range.to);
    if (pay <= 0) continue;
    if (row.category === 'online') online.revenue += pay;
    else if (row.category === 'gym') gym.revenue += pay;
    else {
      const sport = turfSportKey(row.sport);
      turfBySport[sport].revenue += pay;
    }
  }

  // Gym = payment + member admissions for starts in month (not hours)
  const gymStartRows = await findMany('gym_entries', {
    start_date: { $gte: range.from, $lte: range.to },
  });
  for (const row of gymStartRows) {
    gym.admissions += gymMemberCountForName(row.name);
  }
  const gymPayRows = await findMany('gym_entries', paymentDateFilter(range.from, range.to, null));
  for (const row of gymPayRows) {
    gym.revenue += paymentOnDatesInRange(row, range.from, range.to);
  }

  const reportSports = SPORTS.filter((s) => s !== 'cricket_ball');

  const channels = [
    ...reportSports.map((s) => ({
      key: s,
      label: sportLabel(s),
      kind: 'turf',
      hours: ceilHours(turfBySport[s].hours),
      revenue: Math.round(turfBySport[s].revenue * 100) / 100,
      bookings: turfBySport[s].bookings,
      admissions: null,
    })),
    {
      key: 'online',
      label: 'Online',
      kind: 'online',
      hours: ceilHours(online.hours),
      revenue: Math.round(online.revenue * 100) / 100,
      bookings: online.bookings,
      admissions: null,
    },
    {
      key: 'gym',
      label: 'Gym',
      kind: 'gym',
      hours: null,
      revenue: Math.round(gym.revenue * 100) / 100,
      bookings: null,
      admissions: gym.admissions,
    },
  ];

  const playChannels = channels.filter((c) => c.kind !== 'gym');
  const totals = {
    hours: playChannels.reduce((s, c) => s + (c.hours || 0), 0),
    revenue: Math.round(channels.reduce((s, c) => s + (c.revenue || 0), 0) * 100) / 100,
    bookings: playChannels.reduce((s, c) => s + (c.bookings || 0), 0),
    admissions: gym.admissions,
  };

  return {
    month_key: monthKey,
    label: formatMonthLabel(monthKey),
    range,
    channels,
    totals,
    note: 'Hours = turf + online only (cricket ball under cricket). Gym shows total admissions + payment (not hours).',
  };
}
