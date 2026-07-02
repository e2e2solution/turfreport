import db from '../db.js';
import { calcDailyCollection } from './dailyCollection.js';
import { slotHours } from './time.js';

const SPORTS = ['cricket', 'football', 'badminton'];

function ceilHours(h) {
  return Math.ceil(h || 0);
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
    hours,
    charts: {
      collection: collectionChart,
      hours: hoursChart,
    },
  };
}
