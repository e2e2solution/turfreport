import { Router } from 'express';
import db from '../db.js';
import { slotHours, bookingPayment, gymPayment } from '../utils/time.js';
import { getRange, eachDay, dayLabel, weekBuckets } from '../utils/summaryDates.js';
import { queryBulkSessionsForSummary } from '../utils/bulk.js';

const router = Router();
const SPORTS = ['cricket', 'football', 'badminton'];
const PLANS = [1, 3, 6];

function emptySport() {
  return { hours: 0, payment: 0, bookings: 0 };
}

function initSports() {
  return Object.fromEntries(SPORTS.map((s) => [s, emptySport()]));
}

function addSport(stats, sport, hours, payment) {
  if (!stats[sport]) stats[sport] = emptySport();
  stats[sport].hours += hours;
  stats[sport].payment += payment;
  stats[sport].bookings += 1;
}

function sumSports(stats) {
  return SPORTS.reduce((acc, s) => {
    acc.hours += stats[s].hours;
    acc.payment += stats[s].payment;
    acc.bookings += stats[s].bookings;
    return acc;
  }, { hours: 0, payment: 0, bookings: 0 });
}

function ceilHours(hours) {
  return Math.ceil(hours || 0);
}

function turfWithCeilHours(stats) {
  const result = initSports();
  for (const s of SPORTS) {
    result[s] = {
      ...stats[s],
      hours: ceilHours(stats[s].hours),
    };
  }
  const overall = sumSports(stats);
  overall.hours = ceilHours(overall.hours);
  return { ...result, overall };
}

function rowPayment(row) {
  return bookingPayment(row);
}

function initGymPlans() {
  return Object.fromEntries(PLANS.map((p) => [p, { count: 0, payment: 0 }]));
}

router.get('/', (req, res) => {
  const period = req.query.period || 'weekly';
  const date = req.query.date || new Date().toISOString().split('T')[0];

  if (!['daily', 'weekly', 'monthly'].includes(period)) {
    return res.status(400).json({ error: 'period must be daily, weekly, or monthly' });
  }

  const range = getRange(period, date);
  const turfRows = db.prepare('SELECT * FROM bookings WHERE match_date BETWEEN ? AND ?').all(range.from, range.to);
  const onlineRows = db.prepare('SELECT * FROM online_bookings WHERE match_date BETWEEN ? AND ?').all(range.from, range.to);
  const gymRows = db.prepare('SELECT * FROM gym_entries WHERE start_date BETWEEN ? AND ?').all(range.from, range.to);

  const turf = initSports();
  for (const row of turfRows) {
    addSport(turf, row.sport, slotHours(row.time_slot), bookingPayment(row));
  }
  for (const row of onlineRows) {
    addSport(turf, row.sport, slotHours(row.time_slot), bookingPayment(row));
  }

  const bulkSessions = queryBulkSessionsForSummary(range.from, range.to);
  for (const row of bulkSessions) {
    const hours = row.hours || slotHours(row.time_slot);
    addSport(turf, row.sport || 'cricket', hours, 0);
  }

  const gym = { admissions: gymRows.length, byPlan: initGymPlans(), overall: { count: 0, payment: 0 } };
  for (const row of gymRows) {
    const plan = row.plan_months || 1;
    const pay = gymPayment(row);
    if (!gym.byPlan[plan]) gym.byPlan[plan] = { count: 0, payment: 0 };
    gym.byPlan[plan].count += 1;
    gym.byPlan[plan].payment += pay;
    gym.overall.count += 1;
    gym.overall.payment += pay;
  }

  const chart = buildChart(period, range, turfRows, onlineRows, gymRows);

  res.json({
    period,
    range,
    turf: turfWithCeilHours(turf),
    gym,
    chart,
  });
});

function buildChart(period, range, turfRows, onlineRows, gymRows) {
  const allTurf = [...turfRows, ...onlineRows];

  if (period === 'daily') {
    const turfDay = initSports();
    for (const row of allTurf) addSport(turfDay, row.sport, slotHours(row.time_slot), rowPayment(row));
    const bulkDay = db.prepare(`
      SELECT s.session_date, s.time_slot, s.hours, p.sport
      FROM bulk_sessions s
      JOIN bulk_packages p ON p.id = s.bulk_id
      WHERE s.session_date = ? AND p.category IN ('turf', 'online')
    `).all(range.from);
    for (const row of bulkDay) {
      addSport(turfDay, row.sport || 'cricket', row.hours || slotHours(row.time_slot), 0);
    }
    const gymDay = initGymPlans();
    let gymPay = 0;
    for (const row of gymRows) {
      const plan = row.plan_months || 1;
      gymDay[plan].count += 1;
      gymDay[plan].payment += gymPayment(row);
      gymPay += gymPayment(row);
    }
    return {
      type: 'daily',
      turfBars: SPORTS.map((s) => ({
        sport: s.charAt(0).toUpperCase() + s.slice(1),
        hours: ceilHours(turfDay[s].hours),
        payment: turfDay[s].payment,
      })),
      gymBars: PLANS.map((p) => ({
        plan: `${p} Month`,
        count: gymDay[p].count,
        payment: gymDay[p].payment,
      })),
      gymTotal: gymPay,
    };
  }

  const days = eachDay(range.from, range.to);
  const buckets = period === 'monthly' ? weekBuckets(range.from, range.to) : days.map((d) => ({ key: d, label: dayLabel(d), days: [d] }));

  const points = buckets.map((b) => {
    const pt = { label: b.label, cricket: 0, football: 0, badminton: 0, gym: 0, payment: 0 };
    for (const row of allTurf) {
      if (b.days.includes(row.match_date)) {
        pt[row.sport] += slotHours(row.time_slot);
        pt.payment += rowPayment(row);
      }
    }
    const bulkInBucket = db.prepare(`
      SELECT s.session_date, s.time_slot, s.hours, p.sport
      FROM bulk_sessions s
      JOIN bulk_packages p ON p.id = s.bulk_id
      WHERE s.session_date BETWEEN ? AND ? AND p.category IN ('turf', 'online')
    `).all(b.days[0], b.days[b.days.length - 1]);
    for (const row of bulkInBucket) {
      if (b.days.includes(row.session_date)) {
        pt[row.sport || 'cricket'] += row.hours || slotHours(row.time_slot);
      }
    }
    for (const row of gymRows) {
      if (b.days.includes(row.start_date)) {
        pt.gym += 1;
        pt.payment += gymPayment(row);
      }
    }
    pt.cricket = ceilHours(pt.cricket);
    pt.football = ceilHours(pt.football);
    pt.badminton = ceilHours(pt.badminton);
    return pt;
  });

  return { type: period, points };
}

export default router;
