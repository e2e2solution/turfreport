import { findMany, findOne } from '../db/collections.js';

export const ONLINE_PAYMENT_METHODS = ['DIRECT_GPAY', 'MPAY', 'ONLINE_PAY'];
export const DEFERRED_ONLINE_METHODS = ['MPAY', 'ONLINE_PAY'];

export function normalizeOnlinePaymentMethod(value) {
  return ONLINE_PAYMENT_METHODS.includes(value) ? value : 'DIRECT_GPAY';
}

export function expectedOnlineCreditDate(paymentDate, method) {
  if (!paymentDate) return null;
  if (method === 'DIRECT_GPAY') return paymentDate;

  const date = new Date(`${paymentDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  if (method === 'MPAY') {
    date.setDate(date.getDate() + 2);
  } else if (method === 'ONLINE_PAY') {
    date.setMonth(date.getMonth() + 1, 1);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function enrichOnlineBooking(row) {
  if (!row) return row;
  return {
    ...row,
    advance_method: normalizeOnlinePaymentMethod(row.advance_method),
    balance_method: normalizeOnlinePaymentMethod(row.balance_method),
    advance_expected_credit_date: row.advance_expected_credit_date
      || expectedOnlineCreditDate(row.advance_date, normalizeOnlinePaymentMethod(row.advance_method)),
    balance_expected_credit_date: row.balance_expected_credit_date
      || expectedOnlineCreditDate(row.balance_date, normalizeOnlinePaymentMethod(row.balance_method)),
  };
}

function paymentParts(row) {
  return [
    {
      stage: 'advance',
      amount: Number(row.advance_gpay) || 0,
      paid_date: row.advance_date,
      method: normalizeOnlinePaymentMethod(row.advance_method),
      expected_credit_date: row.advance_expected_credit_date
        || expectedOnlineCreditDate(row.advance_date, normalizeOnlinePaymentMethod(row.advance_method)),
    },
    {
      stage: 'balance',
      amount: Number(row.balance_gpay) || 0,
      paid_date: row.balance_date,
      method: normalizeOnlinePaymentMethod(row.balance_method),
      expected_credit_date: row.balance_expected_credit_date
        || expectedOnlineCreditDate(row.balance_date, normalizeOnlinePaymentMethod(row.balance_method)),
    },
  ];
}

async function settlementTotalsByBooking() {
  const allocated = await findMany('online_settlement_allocations', {});
  const map = new Map();
  for (const row of allocated) {
    const key = `${row.online_booking_id}:${row.payment_stage}`;
    const existing = map.get(key) || {
      online_booking_id: row.online_booking_id,
      payment_stage: row.payment_stage,
      allocated_expected: 0,
      allocated_received: 0,
      allocated_commission: 0,
    };
    existing.allocated_expected += Number(row.expected_amount) || 0;
    existing.allocated_received += Number(row.received_amount) || 0;
    existing.allocated_commission += Number(row.commission_amount) || 0;
    map.set(key, existing);
  }
  return map;
}

function matchDateFilter({ from, to } = {}) {
  const filter = {};
  if (from || to) {
    filter.match_date = {};
    if (from) filter.match_date.$gte = from;
    if (to) filter.match_date.$lte = to;
  }
  return filter;
}

function creditDateFilter({ from, to, date } = {}) {
  if (date) return { credit_date: date };
  const filter = {};
  if (from || to) {
    filter.credit_date = {};
    if (from) filter.credit_date.$gte = from;
    if (to) filter.credit_date.$lte = to;
  }
  return filter;
}

function dateInRange(value, { from, to, date } = {}) {
  if (!value) return false;
  if (date) return value === date;
  if (from && to) return value >= from && value <= to;
  return true;
}

function isDirectAdvancePart(row) {
  const method = normalizeOnlinePaymentMethod(row.advance_method);
  return (method === 'DIRECT_GPAY' && (Number(row.advance_gpay) || 0) > 0)
    || (Number(row.advance_cash) || 0) > 0;
}

function isDirectBalancePart(row) {
  const method = normalizeOnlinePaymentMethod(row.balance_method);
  return (method === 'DIRECT_GPAY' && (Number(row.balance_gpay) || 0) > 0)
    || (Number(row.balance_cash) || 0) > 0;
}

export async function listOnlineSettlementCandidates({ from, to } = {}) {
  const rows = await findMany('online_bookings', matchDateFilter({ from, to }), {
    sort: { match_date: 1, id: 1 },
  });
  const byPart = await settlementTotalsByBooking();

  const candidates = [];
  for (const row of rows) {
    for (const part of paymentParts(row)) {
      if (!DEFERRED_ONLINE_METHODS.includes(part.method) || part.amount <= 0) continue;
      const existing = byPart.get(`${row.id}:${part.stage}`);
      const settledExpected = Number(existing?.allocated_expected) || 0;
      const outstanding = Math.max(0, part.amount - settledExpected);
      if (outstanding <= 0) continue;

      candidates.push({
        candidate_id: `${row.id}:${part.stage}`,
        online_booking_id: row.id,
        payment_stage: part.stage,
        name: row.name,
        sport: row.sport,
        match_date: row.match_date,
        time_slot: row.time_slot,
        method: part.method,
        paid_date: part.paid_date,
        expected_credit_date: part.expected_credit_date,
        payment_amount: part.amount,
        already_settled_gross: settledExpected,
        already_received: Number(existing?.allocated_received) || 0,
        outstanding_amount: outstanding,
      });
    }
  }
  return candidates;
}

export async function getOnlineSettlementWithAllocations(id) {
  const settlement = await findOne('online_settlements', { id: Number(id) });
  if (!settlement) return null;

  const allocations = await findMany('online_settlement_allocations', {
    settlement_id: Number(id),
  });
  const bookingIds = [...new Set(allocations.map((row) => row.online_booking_id))];
  const bookings = bookingIds.length
    ? await findMany('online_bookings', { id: { $in: bookingIds } })
    : [];
  const byBooking = new Map(bookings.map((row) => [row.id, row]));

  const joined = allocations.map((row) => {
    const booking = byBooking.get(row.online_booking_id) || {};
    const isAdvance = row.payment_stage === 'advance';
    const method = normalizeOnlinePaymentMethod(
      isAdvance ? booking.advance_method : booking.balance_method,
    );
    const paymentDate = isAdvance
      ? (booking.advance_date || booking.match_date)
      : (booking.balance_date || booking.match_date);
    const paymentAmount = isAdvance
      ? (Number(booking.advance_gpay) || 0) + (Number(booking.advance_cash) || 0)
      : (Number(booking.balance_gpay) || 0) + (Number(booking.balance_cash) || 0);
    const storedExpected = isAdvance
      ? booking.advance_expected_credit_date
      : booking.balance_expected_credit_date;

    return {
      ...row,
      name: booking.name,
      sport: booking.sport,
      match_date: booking.match_date,
      time_slot: booking.time_slot,
      method,
      payment_date: paymentDate,
      payment_amount: paymentAmount,
      expected_credit_date: storedExpected || expectedOnlineCreditDate(paymentDate, method),
    };
  }).sort((a, b) => (
    String(a.match_date || '').localeCompare(String(b.match_date || ''))
    || (a.online_booking_id - b.online_booking_id)
    || String(a.payment_stage || '').localeCompare(String(b.payment_stage || ''))
  ));

  return {
    ...settlement,
    allocations: joined.map((row) => ({
      ...row,
      expected_amount: Number(row.expected_amount) || 0,
      received_amount: Number(row.received_amount) || 0,
      commission_amount: Math.round(((Number(row.expected_amount) || 0) - (Number(row.received_amount) || 0)) * 100) / 100,
      payment_amount: Number(row.payment_amount) || Number(row.expected_amount) || 0,
    })),
  };
}

export async function listOnlineSettlements({ from, to } = {}) {
  const rows = await findMany('online_settlements', creditDateFilter({ from, to }), {
    sort: { credit_date: -1, id: -1 },
  });
  return Promise.all(rows.map((row) => getOnlineSettlementWithAllocations(row.id)));
}

/**
 * Daily report display rows:
 * - Online matches played on this date (pending mPay/Online Pay stay visible)
 * - Direct GPay / cash received on this date (enter the sum immediately)
 * - Settlement credits received on this date (enter the sum)
 */
export async function queryOnlineDailyDisplayRows({ date, from, to } = {}) {
  const filter = {};
  if (date) {
    filter.match_date = date;
  } else if (from && to) {
    filter.match_date = { $gte: from, $lte: to };
  }

  const settled = await settlementTotalsByBooking();

  function annotateMatchRow(raw, reportDate = null) {
    const row = enrichOnlineBooking(raw);
    const advanceSettled = settled.get(`${row.id}:advance`);
    const balanceSettled = settled.get(`${row.id}:balance`);
    const advanceDeferred = DEFERRED_ONLINE_METHODS.includes(row.advance_method);
    const balanceDeferred = DEFERRED_ONLINE_METHODS.includes(row.balance_method);

    const advancePending = advanceDeferred
      ? Math.max(0, (Number(row.advance_gpay) || 0) - (Number(advanceSettled?.allocated_expected) || 0))
      : 0;
    const balancePending = balanceDeferred
      ? Math.max(0, (Number(row.balance_gpay) || 0) - (Number(balanceSettled?.allocated_expected) || 0))
      : 0;

    const advanceDirect = !advanceDeferred
      ? ((Number(row.advance_gpay) || 0) + (Number(row.advance_cash) || 0))
      : (Number(row.advance_cash) || 0);
    const balanceDirect = !balanceDeferred
      ? ((Number(row.balance_gpay) || 0) + (Number(row.balance_cash) || 0))
      : (Number(row.balance_cash) || 0);

    // When a specific report date is given, only Direct GPay/cash paid that day counts in sum.
    let inSumAdvance = advanceDirect;
    let inSumBalance = balanceDirect;
    if (reportDate) {
      inSumAdvance = (!advanceDeferred && row.advance_date === reportDate)
        ? ((Number(row.advance_gpay) || 0) + (Number(row.advance_cash) || 0))
        : (row.advance_date === reportDate ? (Number(row.advance_cash) || 0) : 0);
      inSumBalance = (!balanceDeferred && row.balance_date === reportDate)
        ? ((Number(row.balance_gpay) || 0) + (Number(row.balance_cash) || 0))
        : (row.balance_date === reportDate ? (Number(row.balance_cash) || 0) : 0);
    }

    const pendingCredit = advancePending + balancePending;
    const settledReceived = (Number(advanceSettled?.allocated_received) || 0)
      + (Number(balanceSettled?.allocated_received) || 0);
    const inSumAmount = inSumAdvance + inSumBalance;

    let creditStatus = 'UNPAID';
    if (pendingCredit > 0 && inSumAmount > 0) creditStatus = 'PARTIAL';
    else if (pendingCredit > 0 && settledReceived > 0) creditStatus = 'PARTIAL';
    else if (pendingCredit > 0) creditStatus = 'PENDING_CREDIT';
    else if (settledReceived > 0 || inSumAmount > 0) creditStatus = 'IN_SUM';

    return {
      ...row,
      is_online_match_day: true,
      pending_credit_amount: pendingCredit,
      settled_received_amount: settledReceived,
      in_sum_amount: inSumAmount,
      credit_status: creditStatus,
    };
  }

  const matchRows = await findMany('online_bookings', filter, {
    sort: { match_date: 1, id: 1 },
  });

  const byId = new Map();
  for (const raw of matchRows) {
    byId.set(raw.id, annotateMatchRow(raw, date || null));
  }

  // Also include Direct GPay received on this payment date, even if match was another day.
  for (const direct of await queryOnlineDirectReceivedRows({ date, from, to })) {
    if (byId.has(direct.id)) continue;
    const full = await findOne('online_bookings', { id: direct.id });
    if (!full) continue;
    byId.set(direct.id, {
      ...annotateMatchRow(full, date || direct.advance_date || direct.balance_date || null),
      is_online_direct_payment: true,
    });
  }

  const settlementRows = (await queryOnlineSettlementRows({ date, from, to })).map((row) => ({
    ...row,
    is_online_match_day: false,
    pending_credit_amount: 0,
    settled_received_amount: Number(row.received_amount) || 0,
    in_sum_amount: Number(row.received_amount) || 0,
    credit_status: 'CREDITED',
  }));

  return [
    ...[...byId.values()].sort((a, b) => String(a.match_date).localeCompare(String(b.match_date)) || a.id - b.id),
    ...settlementRows,
  ];
}

export async function queryOnlineDirectReceivedRows({ from, to, date } = {}) {
  const range = { from, to, date };
  const filter = {};
  if (date) {
    filter.$or = [{ advance_date: date }, { balance_date: date }];
  } else if (from && to) {
    filter.$or = [
      { advance_date: { $gte: from, $lte: to } },
      { balance_date: { $gte: from, $lte: to } },
    ];
  }

  const rows = await findMany('online_bookings', filter, {
    sort: { match_date: 1, id: 1 },
  });

  return rows
    .filter((raw) => (
      (isDirectAdvancePart(raw) && dateInRange(raw.advance_date, range))
      || (isDirectBalancePart(raw) && dateInRange(raw.balance_date, range))
    ))
    .map((raw) => {
      const row = enrichOnlineBooking(raw);
      return {
        ...row,
        deferred_advance_gpay: DEFERRED_ONLINE_METHODS.includes(row.advance_method)
          ? row.advance_gpay
          : 0,
        deferred_balance_gpay: DEFERRED_ONLINE_METHODS.includes(row.balance_method)
          ? row.balance_gpay
          : 0,
        advance_gpay: row.advance_method === 'DIRECT_GPAY' ? row.advance_gpay : 0,
        balance_gpay: row.balance_method === 'DIRECT_GPAY' ? row.balance_gpay : 0,
        payment_method: 'DIRECT_GPAY',
      };
    });
}

export async function queryOnlineSettlementRows({ from, to, date } = {}) {
  const settlements = await findMany('online_settlements', creditDateFilter({ from, to, date }), {
    sort: { credit_date: 1, id: 1 },
  });
  if (!settlements.length) return [];

  const settlementIds = settlements.map((row) => row.id);
  const settlementById = new Map(settlements.map((row) => [row.id, row]));
  const allocations = await findMany('online_settlement_allocations', {
    settlement_id: { $in: settlementIds },
  });
  if (!allocations.length) return [];

  const bookingIds = [...new Set(allocations.map((row) => row.online_booking_id))];
  const bookings = await findMany('online_bookings', { id: { $in: bookingIds } });
  const bookingById = new Map(bookings.map((row) => [row.id, row]));

  return allocations
    .map((allocation) => {
      const settlement = settlementById.get(allocation.settlement_id);
      const booking = bookingById.get(allocation.online_booking_id);
      if (!settlement || !booking) return null;
      return {
        ...booking,
        allocation_id: allocation.id,
        settlement_id: settlement.id,
        credit_date: settlement.credit_date,
        source: settlement.source,
        reference: settlement.reference,
        payment_stage: allocation.payment_stage,
        expected_amount: allocation.expected_amount,
        received_amount: allocation.received_amount,
        commission_amount: allocation.commission_amount,
        online_booking_id: booking.id,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (
      String(a.credit_date || '').localeCompare(String(b.credit_date || ''))
      || (a.settlement_id - b.settlement_id)
      || String(a.match_date || '').localeCompare(String(b.match_date || ''))
      || (a.online_booking_id - b.online_booking_id)
    ))
    .map((row) => ({
      ...row,
      id: `online-settlement-${row.allocation_id}`,
      is_online_settlement: true,
      total: row.expected_amount,
      advance_gpay: row.received_amount,
      advance_cash: 0,
      advance_date: row.credit_date,
      balance_gpay: 0,
      balance_cash: 0,
      balance_date: null,
      payment_method: row.source,
      settlement_reference: row.reference,
    }));
}
