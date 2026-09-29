import { findMany, paymentDateFilter } from '../db/collections.js';
import {
  queryOnlineDirectReceivedRows,
  queryOnlineSettlementRows,
} from './onlinePayments.js';

function emptyBucket() {
  return { gpay: 0, cash: 0, bank: 0, total: 0 };
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
  bucket.total = bucket.gpay + bucket.cash + bucket.bank;
}

function addBuckets(...buckets) {
  return buckets.reduce((acc, b) => ({
    gpay: acc.gpay + b.gpay,
    cash: acc.cash + b.cash,
    bank: acc.bank + (b.bank || 0),
    total: acc.total + b.total,
  }), emptyBucket());
}

export async function calcDailyCollection(date) {
  const payFilter = paymentDateFilter(null, null, date);
  const turfRows = await findMany('bookings', payFilter);
  const gymRows = await findMany('gym_entries', payFilter);

  const turf = emptyBucket();
  const online = emptyBucket();
  const badminton = emptyBucket();
  const gym = emptyBucket();
  const football_coaching = emptyBucket();

  for (const row of turfRows) {
    const bucket = row.sport === 'badminton' ? badminton : turf;
    addPaymentForDate(row, date, bucket);
  }

  const onlineDirectRows = await queryOnlineDirectReceivedRows({ date });
  for (const row of onlineDirectRows) {
    addPaymentForDate(row, date, online);
  }
  const onlineSettlementRows = await queryOnlineSettlementRows({ date });
  for (const row of onlineSettlementRows) {
    online.bank += Number(row.received_amount) || 0;
  }
  online.total = online.gpay + online.cash + online.bank;

  for (const row of gymRows) {
    addPaymentForDate(row, date, gym);
  }

  const bulkRows = await findMany('bulk_packages', {
    status: 'CLOSED',
    ...payFilter,
  });
  for (const row of bulkRows) {
    if (row.category === 'gym') {
      addPaymentForDate(row, date, gym);
    } else if (row.category === 'online') {
      addPaymentForDate(row, date, online);
    } else {
      const bucket = row.sport === 'badminton' ? badminton : turf;
      addPaymentForDate(row, date, bucket);
    }
  }

  const fcRows = await findMany('football_coaching', payFilter);
  for (const row of fcRows) {
    addPaymentForDate(row, date, football_coaching);
  }

  const overall = addBuckets(turf, online, badminton, gym, football_coaching);

  return {
    date,
    turf,
    online,
    badminton,
    gym,
    football_coaching,
    gpay: overall.gpay,
    cash: overall.cash,
    bank: overall.bank,
    total: overall.total,
  };
}
