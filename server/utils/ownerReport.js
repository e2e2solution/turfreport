import { findMany } from '../db/collections.js';
import { calcDailyCollection } from './dailyCollection.js';
import { slotHours } from './time.js';
import { queryReportData } from './reportQuery.js';
import { countGymMembersJoined, gymMemberCountForName } from './gymCount.js';
import { SPORTS } from './sports.js';

function ceilHours(h) {
  return Math.ceil(h || 0);
}

function paymentOnDate(row, date) {
  let gpay = 0;
  let cash = 0;
  if (row.advance_date === date) {
    gpay += row.advance_gpay || 0;
    cash += row.advance_cash || 0;
  }
  if (row.balance_date === date) {
    gpay += row.balance_gpay || 0;
    cash += row.balance_cash || 0;
  }
  return { gpay, cash, total: gpay + cash };
}

async function buildPaymentReport(paymentDate) {
  const data = await queryReportData({
    match_date: paymentDate,
    filter_type: 'payment',
    section: 'all',
    include_bulk_pending: '1',
  });

  const turfOnline = [
    ...data.turf.map((row) => ({ ...row, booking_channel: 'Turf' })),
    ...data.online.map((row) => ({ ...row, booking_channel: 'Online' })),
  ].map((r) => ({
    name: r.name,
    sport: r.sport,
    time_slot: r.time_slot,
    bulk_id: r.is_bulk ? r.bulk_id : null,
    booking_channel: r.booking_channel,
    payment_method: r.payment_method || null,
    commission: r.commission_amount || 0,
    ...paymentOnDate(r, paymentDate),
  }));

  const gym = data.gym.map((r) => ({
    name: r.name,
    start_date: r.start_date,
    plan_months: r.plan_months,
    members: (!r.is_bulk && !r.is_bulk_payment) ? gymMemberCountForName(r.name) : 0,
    bulk_id: r.is_bulk ? r.bulk_id : null,
    is_bulk_session: Boolean(r.is_bulk && !r.is_bulk_payment),
    ...paymentOnDate(r, paymentDate),
  }));

  const football_coaching = data.football_coaching.map((r) => ({
    child_name: r.name,
    parent_name: r.parent_name,
    coaching_month: r.coaching_month,
    period: r.period,
    ...paymentOnDate(r, paymentDate),
  }));

  return {
    payment_date: paymentDate,
    gym_members_joined: countGymMembersJoined(data.gym),
    turf_online: turfOnline,
    gym,
    football_coaching,
  };
}

async function calcDayHours(date) {
  const hours = Object.fromEntries(SPORTS.map((s) => [s, 0]));

  const turfRows = await findMany('bookings', { match_date: date }, {
    projection: { sport: 1, time_slot: 1 },
  });
  const onlineRows = await findMany('online_bookings', { match_date: date }, {
    projection: { sport: 1, time_slot: 1 },
  });
  for (const row of [...turfRows, ...onlineRows]) {
    const sport = row.sport || 'cricket';
    if (hours[sport] !== undefined) hours[sport] += slotHours(row.time_slot);
  }

  const sessions = await findMany('bulk_sessions', { session_date: date });
  if (sessions.length) {
    const bulkIds = [...new Set(sessions.map((s) => s.bulk_id))];
    const packages = await findMany('bulk_packages', {
      id: { $in: bulkIds },
      category: { $in: ['turf', 'online'] },
    });
    const pkgById = new Map(packages.map((p) => [p.id, p]));
    for (const session of sessions) {
      const pkg = pkgById.get(session.bulk_id);
      if (!pkg) continue;
      const sport = pkg.sport || 'cricket';
      if (hours[sport] !== undefined) {
        hours[sport] += session.hours || slotHours(session.time_slot);
      }
    }
  }

  const rounded = Object.fromEntries(
    SPORTS.map((s) => [s, ceilHours(hours[s])]),
  );
  rounded.total = SPORTS.reduce((sum, s) => sum + rounded[s], 0);
  return rounded;
}

export async function buildOwnerReportSnapshot(paymentDate) {
  const collection = await calcDailyCollection(paymentDate);
  const hours = await calcDayHours(paymentDate);
  const paymentReport = await buildPaymentReport(paymentDate);

  const collectionChart = [
    { label: 'Turf', amount: collection.turf.total },
    { label: 'Online', amount: collection.online?.total || 0 },
    { label: 'Badminton', amount: collection.badminton.total },
    { label: 'Gym', amount: collection.gym.total },
    { label: 'Football Coaching', amount: collection.football_coaching?.total || 0 },
  ];

  const hoursChart = SPORTS.map((s) => ({
    label: s.charAt(0).toUpperCase() + s.slice(1),
    hours: hours[s],
  }));

  return {
    payment_date: paymentDate,
    pushed_at: new Date().toISOString(),
    collection: {
      turf: collection.turf,
      online: collection.online,
      badminton: collection.badminton,
      gym: collection.gym,
      football_coaching: collection.football_coaching,
      gpay: collection.gpay,
      cash: collection.cash,
      bank: collection.bank || 0,
      total: collection.total,
    },
    highlights: {
      turf: collection.turf.total,
      online: collection.online?.total || 0,
      badminton: collection.badminton.total,
      gym: collection.gym.total,
      coaching: collection.football_coaching?.total || 0,
      gpay: collection.gpay,
      cash: collection.cash,
      bank: collection.bank || 0,
      total: collection.total,
    },
    gym_members_joined: paymentReport.gym_members_joined,
    hours,
    charts: {
      collection: collectionChart,
      hours: hoursChart,
    },
    payment_report: paymentReport,
  };
}
