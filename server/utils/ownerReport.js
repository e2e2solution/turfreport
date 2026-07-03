import db from '../db.js';
import { calcDailyCollection } from './dailyCollection.js';
import { slotHours } from './time.js';
import { queryReportData } from './reportQuery.js';
import { countGymMembersJoined, gymMemberCountForName } from './gymCount.js';

const SPORTS = ['cricket', 'football', 'badminton'];

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

function buildPaymentReport(paymentDate) {
  const data = queryReportData({
    match_date: paymentDate,
    filter_type: 'payment',
    section: 'all',
    include_bulk_pending: '1',
  });

  const turfOnline = [...data.turf, ...data.online].map((r) => ({
    name: r.name,
    sport: r.sport,
    time_slot: r.time_slot,
    bulk_id: r.is_bulk ? r.bulk_id : null,
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
    child_name: r.child_name,
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

function calcDayHours(date) {
  const hours = Object.fromEntries(SPORTS.map((s) => [s, 0]));

  const turfRows = db.prepare(
    'SELECT sport, time_slot FROM bookings WHERE match_date = ?'
  ).all(date);
  const onlineRows = db.prepare(
    'SELECT sport, time_slot FROM online_bookings WHERE match_date = ?'
  ).all(date);
  for (const row of [...turfRows, ...onlineRows]) {
    const sport = row.sport || 'cricket';
    if (hours[sport] !== undefined) hours[sport] += slotHours(row.time_slot);
  }

  const bulkSessions = db.prepare(`
    SELECT s.time_slot, s.hours, p.sport
    FROM bulk_sessions s
    JOIN bulk_packages p ON p.id = s.bulk_id
    WHERE s.session_date = ? AND p.category IN ('turf', 'online')
  `).all(date);
  for (const row of bulkSessions) {
    const sport = row.sport || 'cricket';
    if (hours[sport] !== undefined) {
      hours[sport] += row.hours || slotHours(row.time_slot);
    }
  }

  const rounded = Object.fromEntries(
    SPORTS.map((s) => [s, ceilHours(hours[s])]),
  );
  rounded.total = SPORTS.reduce((sum, s) => sum + rounded[s], 0);
  return rounded;
}

export function buildOwnerReportSnapshot(paymentDate) {
  const collection = calcDailyCollection(paymentDate);
  const hours = calcDayHours(paymentDate);
  const paymentReport = buildPaymentReport(paymentDate);

  const collectionChart = [
    { label: 'Turf', amount: collection.turf.total },
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
      badminton: collection.badminton,
      gym: collection.gym,
      football_coaching: collection.football_coaching,
      gpay: collection.gpay,
      cash: collection.cash,
      total: collection.total,
    },
    highlights: {
      turf: collection.turf.total,
      badminton: collection.badminton.total,
      gym: collection.gym.total,
      coaching: collection.football_coaching?.total || 0,
      gpay: collection.gpay,
      cash: collection.cash,
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
