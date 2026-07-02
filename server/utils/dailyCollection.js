import db from '../db.js';

function emptyBucket() {
  return { gpay: 0, cash: 0, total: 0 };
}

function addPaymentForDate(row, date, bucket) {
  if (row.advance_date === date) {
    bucket.gpay += row.advance_gpay || 0;
    bucket.cash += row.advance_cash || 0;
  }
  if (row.balance_date === date) {
    bucket.gpay += row.balance_gpay || 0;
    bucket.cash += row.balance_cash || 0;
  }
  bucket.total = bucket.gpay + bucket.cash;
}

function addBuckets(...buckets) {
  return buckets.reduce((acc, b) => ({
    gpay: acc.gpay + b.gpay,
    cash: acc.cash + b.cash,
    total: acc.total + b.total,
  }), emptyBucket());
}

export function calcDailyCollection(date) {
  const turfRows = db.prepare('SELECT * FROM bookings').all();
  const onlineRows = db.prepare('SELECT * FROM online_bookings').all();
  const gymRows = db.prepare('SELECT * FROM gym_entries').all();

  const turf = emptyBucket();
  const badminton = emptyBucket();
  const gym = emptyBucket();
  const football_coaching = emptyBucket();

  for (const row of [...turfRows, ...onlineRows]) {
    const bucket = row.sport === 'badminton' ? badminton : turf;
    addPaymentForDate(row, date, bucket);
  }

  for (const row of gymRows) {
    addPaymentForDate(row, date, gym);
  }

  const bulkRows = db.prepare(
    "SELECT * FROM bulk_packages WHERE status = 'CLOSED'"
  ).all();
  for (const row of bulkRows) {
    if (row.category === 'gym') {
      addPaymentForDate(row, date, gym);
    } else {
      const bucket = row.sport === 'badminton' ? badminton : turf;
      addPaymentForDate(row, date, bucket);
    }
  }

  const fcRows = db.prepare('SELECT * FROM football_coaching').all();
  for (const row of fcRows) {
    addPaymentForDate(row, date, football_coaching);
  }

  const overall = addBuckets(turf, badminton, gym, football_coaching);

  return {
    date,
    turf,
    badminton,
    gym,
    football_coaching,
    gpay: overall.gpay,
    cash: overall.cash,
    total: overall.total,
  };
}
