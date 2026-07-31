import { Router } from 'express';
import db from '../db.js';
import { slotHours, bookingPayment, gymPayment } from '../utils/time.js';
import { getRange, eachDay, dayLabel, weekBuckets } from '../utils/summaryDates.js';
import { queryBulkSessionsForSummary } from '../utils/bulk.js';
import { gymMemberCountForName } from '../utils/gymCount.js';
import {
  queryOnlineDirectReceivedRows,
  queryOnlineSettlementRows,
} from '../utils/onlinePayments.js';
import { SPORTS, sportLabel } from '../utils/sports.js';

const router = Router();
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

function addSportPayment(stats, sport, payment) {
  if (!stats[sport]) stats[sport] = emptySport();
  stats[sport].payment += payment;
}

function onlineReceiptOnDate(row, date) {
  if (row.is_online_settlement) {
    return row.credit_date === date ? (Number(row.received_amount) || 0) : 0;
  }
  let amount = 0;
  if (row.advance_date === date) {
    amount += (Number(row.advance_gpay) || 0) + (Number(row.advance_cash) || 0);
  }
  if (row.balance_date === date) {
    amount += (Number(row.balance_gpay) || 0) + (Number(row.balance_cash) || 0);
  }
  return amount;
}

function onlineReceiptInDays(row, days) {
  return days.reduce((sum, day) => sum + onlineReceiptOnDate(row, day), 0);
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
  const onlineReceiptRows = [
    ...queryOnlineDirectReceivedRows({ from: range.from, to: range.to }),
    ...queryOnlineSettlementRows({ from: range.from, to: range.to }),
  ];
  const gymRows = db.prepare('SELECT * FROM gym_entries WHERE start_date BETWEEN ? AND ?').all(range.from, range.to);

  const turf = initSports();
  for (const row of turfRows) {
    addSport(turf, row.sport, slotHours(row.time_slot), bookingPayment(row));
  }
  for (const row of onlineRows) {
    // Online match remains part of hours/bookings, but pending platform
    // payments do not enter collection until the bank settlement is split.
    addSport(turf, row.sport, slotHours(row.time_slot), 0);
  }
  for (const row of onlineReceiptRows) {
    addSportPayment(turf, row.sport, onlineReceiptInDays(row, eachDay(range.from, range.to)));
  }

  const bulkSessions = queryBulkSessionsForSummary(range.from, range.to);
  for (const row of bulkSessions) {
    const hours = row.hours || slotHours(row.time_slot);
    addSport(turf, row.sport || 'cricket', hours, 0);
  }

  const gym = { admissions: 0, byPlan: initGymPlans(), overall: { count: 0, payment: 0 } };
  for (const row of gymRows) {
    const plan = row.plan_months || 1;
    const pay = gymPayment(row);
    const members = gymMemberCountForName(row.name);
    if (!gym.byPlan[plan]) gym.byPlan[plan] = { count: 0, payment: 0 };
    gym.byPlan[plan].count += members;
    gym.byPlan[plan].payment += pay;
    gym.overall.count += members;
    gym.overall.payment += pay;
    gym.admissions += members;
  }

  const chart = buildChart(period, range, turfRows, onlineRows, onlineReceiptRows, gymRows);
  const onlineReceived = onlineReceiptRows.reduce(
    (sum, row) => sum + onlineReceiptInDays(row, eachDay(range.from, range.to)),
    0,
  );

  res.json({
    period,
    range,
    turf: turfWithCeilHours(turf),
    online_received: onlineReceived,
    gym,
    chart,
  });
});

function buildChart(period, range, turfRows, onlineRows, onlineReceiptRows, gymRows) {
  if (period === 'daily') {
    const turfDay = initSports();
    for (const row of turfRows) {
      addSport(turfDay, row.sport, slotHours(row.time_slot), rowPayment(row));
    }
    for (const row of onlineRows) {
      addSport(turfDay, row.sport, slotHours(row.time_slot), 0);
    }
    for (const row of onlineReceiptRows) {
      addSportPayment(turfDay, row.sport, onlineReceiptOnDate(row, range.from));
    }
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
      const members = gymMemberCountForName(row.name);
      gymDay[plan].count += members;
      gymDay[plan].payment += gymPayment(row);
      gymPay += gymPayment(row);
    }
    return {
      type: 'daily',
      turfBars: SPORTS.map((s) => ({
        sport: sportLabel(s),
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
    const pt = {
      label: b.label,
      ...Object.fromEntries(SPORTS.map((s) => [s, 0])),
      gym: 0,
      payment: 0,
    };
    for (const row of turfRows) {
      if (b.days.includes(row.match_date)) {
        pt[row.sport] += slotHours(row.time_slot);
        pt.payment += rowPayment(row);
      }
    }
    for (const row of onlineRows) {
      if (b.days.includes(row.match_date)) {
        pt[row.sport] += slotHours(row.time_slot);
      }
    }
    for (const row of onlineReceiptRows) {
      pt.payment += onlineReceiptInDays(row, b.days);
    }
    const bulkInBucket = db.prepare(`
      SELECT s.session_date, s.time_slot, s.hours, p.sport
      FROM bulk_sessions s
      JOIN bulk_packages p ON p.id = s.bulk_id
      WHERE s.session_date BETWEEN ? AND ? AND p.category IN ('turf', 'online')
    `).all(b.days[0], b.days[b.days.length - 1]);
    for (const row of bulkInBucket) {
      if (b.days.includes(row.session_date)) {
        const sport = row.sport || 'cricket';
        if (pt[sport] == null) pt[sport] = 0;
        pt[sport] += row.hours || slotHours(row.time_slot);
      }
    }
    for (const row of gymRows) {
      if (b.days.includes(row.start_date)) {
        pt.gym += gymMemberCountForName(row.name);
        pt.payment += gymPayment(row);
      }
    }
    for (const s of SPORTS) {
      pt[s] = ceilHours(pt[s]);
    }
    return pt;
  });

  return { type: period, points };
}

export default router;
