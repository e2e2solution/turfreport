import db from '../db.js';

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

export function listOnlineSettlementCandidates({ from, to } = {}) {
  let sql = 'SELECT * FROM online_bookings WHERE 1=1';
  const params = [];
  if (from) {
    sql += ' AND match_date >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND match_date <= ?';
    params.push(to);
  }
  sql += ' ORDER BY match_date ASC, id ASC';

  const rows = db.prepare(sql).all(...params);
  const allocated = db.prepare(`
    SELECT online_booking_id, payment_stage,
      COALESCE(SUM(expected_amount), 0) AS allocated_expected,
      COALESCE(SUM(received_amount), 0) AS allocated_received
    FROM online_settlement_allocations
    GROUP BY online_booking_id, payment_stage
  `).all();
  const byPart = new Map(
    allocated.map((row) => [
      `${row.online_booking_id}:${row.payment_stage}`,
      row,
    ]),
  );

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

export function getOnlineSettlementWithAllocations(id) {
  const settlement = db.prepare('SELECT * FROM online_settlements WHERE id = ?').get(id);
  if (!settlement) return null;
  const allocations = db.prepare(`
    SELECT a.*, b.name, b.sport, b.match_date, b.time_slot,
      CASE a.payment_stage
        WHEN 'advance' THEN COALESCE(b.advance_method, 'DIRECT_GPAY')
        ELSE COALESCE(b.balance_method, 'DIRECT_GPAY')
      END AS method,
      CASE a.payment_stage
        WHEN 'advance' THEN COALESCE(b.advance_date, b.match_date)
        ELSE COALESCE(b.balance_date, b.match_date)
      END AS payment_date,
      CASE a.payment_stage
        WHEN 'advance' THEN COALESCE(b.advance_gpay, 0) + COALESCE(b.advance_cash, 0)
        ELSE COALESCE(b.balance_gpay, 0) + COALESCE(b.balance_cash, 0)
      END AS payment_amount,
      CASE a.payment_stage
        WHEN 'advance' THEN COALESCE(
          b.advance_expected_credit_date,
          date(COALESCE(b.advance_date, b.match_date), '+2 day')
        )
        ELSE COALESCE(
          b.balance_expected_credit_date,
          date(COALESCE(b.balance_date, b.match_date), '+2 day')
        )
      END AS expected_credit_date
    FROM online_settlement_allocations a
    JOIN online_bookings b ON b.id = a.online_booking_id
    WHERE a.settlement_id = ?
    ORDER BY b.match_date ASC, b.id ASC, a.payment_stage ASC
  `).all(id);
  return {
    ...settlement,
    allocations: allocations.map((row) => ({
      ...row,
      expected_amount: Number(row.expected_amount) || 0,
      received_amount: Number(row.received_amount) || 0,
      commission_amount: Math.round(((Number(row.expected_amount) || 0) - (Number(row.received_amount) || 0)) * 100) / 100,
      payment_amount: Number(row.payment_amount) || Number(row.expected_amount) || 0,
    })),
  };
}

export function listOnlineSettlements({ from, to } = {}) {
  let sql = 'SELECT * FROM online_settlements WHERE 1=1';
  const params = [];
  if (from) {
    sql += ' AND credit_date >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND credit_date <= ?';
    params.push(to);
  }
  sql += ' ORDER BY credit_date DESC, id DESC';
  return db.prepare(sql).all(...params).map((row) => getOnlineSettlementWithAllocations(row.id));
}

function settlementTotalsByBooking() {
  const allocated = db.prepare(`
    SELECT online_booking_id, payment_stage,
      COALESCE(SUM(expected_amount), 0) AS allocated_expected,
      COALESCE(SUM(received_amount), 0) AS allocated_received,
      COALESCE(SUM(commission_amount), 0) AS allocated_commission
    FROM online_settlement_allocations
    GROUP BY online_booking_id, payment_stage
  `).all();
  return new Map(
    allocated.map((row) => [`${row.online_booking_id}:${row.payment_stage}`, row]),
  );
}

/**
 * Daily report display rows:
 * - Online matches played on this date (pending mPay/Online Pay stay visible)
 * - Direct GPay / cash received on this date (enter the sum immediately)
 * - Settlement credits received on this date (enter the sum)
 */
export function queryOnlineDailyDisplayRows({ date, from, to } = {}) {
  let matchSql = 'SELECT * FROM online_bookings WHERE 1=1';
  const matchParams = [];
  if (date) {
    matchSql += ' AND match_date = ?';
    matchParams.push(date);
  } else if (from && to) {
    matchSql += ' AND match_date BETWEEN ? AND ?';
    matchParams.push(from, to);
  }
  matchSql += ' ORDER BY match_date ASC, id ASC';

  const settled = settlementTotalsByBooking();

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

  const byId = new Map();
  for (const raw of db.prepare(matchSql).all(...matchParams)) {
    byId.set(raw.id, annotateMatchRow(raw, date || null));
  }

  // Also include Direct GPay received on this payment date, even if match was another day.
  for (const direct of queryOnlineDirectReceivedRows({ date, from, to })) {
    if (byId.has(direct.id)) continue;
    const full = db.prepare('SELECT * FROM online_bookings WHERE id = ?').get(direct.id);
    if (!full) continue;
    byId.set(direct.id, {
      ...annotateMatchRow(full, date || direct.advance_date || direct.balance_date || null),
      is_online_direct_payment: true,
    });
  }

  const settlementRows = queryOnlineSettlementRows({ date, from, to }).map((row) => ({
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

export function queryOnlineDirectReceivedRows({ from, to, date } = {}) {
  let sql = 'SELECT * FROM online_bookings WHERE 1=1';
  const params = [];
  const directAdvance = `
    (advance_date %DATE_FILTER%
      AND (
        (COALESCE(advance_method, 'DIRECT_GPAY') = 'DIRECT_GPAY' AND advance_gpay > 0)
        OR advance_cash > 0
      ))
  `;
  const directBalance = `
    (balance_date %DATE_FILTER%
      AND (
        (COALESCE(balance_method, 'DIRECT_GPAY') = 'DIRECT_GPAY' AND balance_gpay > 0)
        OR balance_cash > 0
      ))
  `;

  if (date) {
    sql += ` AND (${directAdvance.replace('%DATE_FILTER%', '= ?')}
      OR ${directBalance.replace('%DATE_FILTER%', '= ?')})`;
    params.push(date, date);
  } else if (from && to) {
    sql += ` AND (${directAdvance.replace('%DATE_FILTER%', 'BETWEEN ? AND ?')}
      OR ${directBalance.replace('%DATE_FILTER%', 'BETWEEN ? AND ?')})`;
    params.push(from, to, from, to);
  }
  sql += ' ORDER BY match_date ASC, id ASC';

  return db.prepare(sql).all(...params).map((raw) => {
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

export function queryOnlineSettlementRows({ from, to, date } = {}) {
  let sql = `
    SELECT
      a.id AS allocation_id,
      s.id AS settlement_id,
      s.credit_date,
      s.source,
      s.reference,
      a.payment_stage,
      a.expected_amount,
      a.received_amount,
      a.commission_amount,
      b.id AS online_booking_id,
      b.*
    FROM online_settlement_allocations a
    JOIN online_settlements s ON s.id = a.settlement_id
    JOIN online_bookings b ON b.id = a.online_booking_id
    WHERE 1=1
  `;
  const params = [];
  if (date) {
    sql += ' AND s.credit_date = ?';
    params.push(date);
  } else {
    if (from) {
      sql += ' AND s.credit_date >= ?';
      params.push(from);
    }
    if (to) {
      sql += ' AND s.credit_date <= ?';
      params.push(to);
    }
  }
  sql += ' ORDER BY s.credit_date ASC, s.id ASC, b.match_date ASC, b.id ASC';

  return db.prepare(sql).all(...params).map((row) => ({
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
