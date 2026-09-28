import { Router } from 'express';
import {
  findMany,
  findOne,
  insertOne,
  updateOne,
  deleteOne,
  deleteMany,
  paymentDateFilter,
  nameLikeFilter,
} from '../db/collections.js';
import { parseNum } from '../utils/excel.js';
import {
  DEFERRED_ONLINE_METHODS,
  enrichOnlineBooking,
  expectedOnlineCreditDate,
  getOnlineSettlementWithAllocations,
  listOnlineSettlementCandidates,
  listOnlineSettlements,
  normalizeOnlinePaymentMethod,
} from '../utils/onlinePayments.js';
import { searchOnlineNameHistory } from '../utils/nameHistory.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { date, match_date, status, filter_type, from, to, name } = req.query;
    const filter = {};

    if (filter_type === 'payment' && (date || (from && to))) {
      Object.assign(filter, paymentDateFilter(from, to, date));
    } else if (match_date) {
      filter.match_date = match_date;
    } else if (from && to) {
      filter.match_date = { $gte: from, $lte: to };
    } else if (date) {
      filter.$or = [
        { advance_date: date },
        { balance_date: date },
        { match_date: date },
      ];
    }
    if (status) filter.status = status;
    if (name && String(name).trim()) {
      Object.assign(filter, nameLikeFilter(name));
    }

    const rows = await findMany('online_bookings', filter, { sort: { match_date: -1, id: -1 } });
    res.json(rows.map(enrichOnlineBooking));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/name-search', async (req, res) => {
  try {
    res.json(await searchOnlineNameHistory(req.query.q));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/settlement-candidates/list', async (req, res) => {
  try {
    res.json(await listOnlineSettlementCandidates({
      from: req.query.from,
      to: req.query.to,
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/settlements/list', async (req, res) => {
  try {
    res.json(await listOnlineSettlements({
      from: req.query.from,
      to: req.query.to,
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function validateSettlementBody(body) {
  if (!body.credit_date) throw new Error('Credit date is required');
  if (!body.from_date || !body.to_date) throw new Error('Match date range is required');
  if (!Array.isArray(body.allocations) || !body.allocations.length) {
    throw new Error('Select at least one online payment');
  }

  const receivedAmount = parseNum(body.received_amount);
  const allocationReceived = body.allocations.reduce(
    (sum, item) => sum + parseNum(item.received_amount),
    0,
  );
  if (Math.abs(receivedAmount - allocationReceived) > 0.01) {
    throw new Error('Split received amounts must equal the credited total');
  }
}

async function buildCandidateForRef(bookingId, stage, excludeSettlementId = null) {
  const booking = enrichOnlineBooking(
    await findOne('online_bookings', { id: Number(bookingId) }),
  );
  if (!booking) return null;

  const method = booking[`${stage}_method`];
  const partAmount = Number(booking[`${stage}_gpay`]) || 0;

  const allocFilter = {
    online_booking_id: Number(bookingId),
    payment_stage: stage,
  };
  if (excludeSettlementId) {
    allocFilter.settlement_id = { $ne: Number(excludeSettlementId) };
  }
  const allocations = await findMany('online_settlement_allocations', allocFilter);
  const allocatedExpected = allocations.reduce(
    (sum, row) => sum + (Number(row.expected_amount) || 0),
    0,
  );

  return {
    online_booking_id: booking.id,
    payment_stage: stage,
    method,
    payment_amount: partAmount,
    outstanding_amount: Math.max(0, partAmount - allocatedExpected),
  };
}

async function saveSettlement(body, settlementId = null) {
  validateSettlementBody(body);

  // Validate against the specific selected bookings, independent of the
  // match-date range, so a slightly different range never blocks a save.
  const candidateMap = new Map();
  for (const item of body.allocations) {
    const key = `${item.online_booking_id}:${item.payment_stage}`;
    if (candidateMap.has(key)) continue;
    const candidate = await buildCandidateForRef(
      Number(item.online_booking_id),
      item.payment_stage,
      settlementId,
    );
    if (candidate) candidateMap.set(key, candidate);
  }

  const allocations = body.allocations.map((item) => {
    const key = `${item.online_booking_id}:${item.payment_stage}`;
    const candidate = candidateMap.get(key);
    if (!candidate) throw new Error(`Payment ${key} is not available for settlement`);
    if (!DEFERRED_ONLINE_METHODS.includes(candidate.method)) {
      throw new Error('Only mPay and Online Pay need settlement');
    }
    const expectedAmount = parseNum(item.expected_amount);
    const received = parseNum(item.received_amount);
    if (expectedAmount <= 0 || expectedAmount > candidate.outstanding_amount + 0.01) {
      throw new Error(`Invalid expected amount for payment ${key}`);
    }
    if (received < 0 || received > expectedAmount + 0.01) {
      throw new Error(`Received amount cannot exceed expected amount for payment ${key}`);
    }
    return {
      online_booking_id: Number(item.online_booking_id),
      payment_stage: item.payment_stage,
      expected_amount: expectedAmount,
      received_amount: received,
      commission_amount: Math.max(0, expectedAmount - received),
    };
  });

  const grossAmount = allocations.reduce((sum, item) => sum + item.expected_amount, 0);
  const receivedAmount = allocations.reduce((sum, item) => sum + item.received_amount, 0);
  const sourceMethods = new Set(allocations.map((item) => {
    const candidate = candidateMap.get(`${item.online_booking_id}:${item.payment_stage}`);
    return candidate.method;
  }));
  const source = sourceMethods.size === 1 ? [...sourceMethods][0] : 'MIXED';

  const settlementFields = {
    credit_date: body.credit_date,
    source,
    from_date: body.from_date,
    to_date: body.to_date,
    gross_amount: grossAmount,
    received_amount: receivedAmount,
    commission_amount: Math.max(0, grossAmount - receivedAmount),
    reference: (body.reference || '').trim(),
    notes: (body.notes || '').trim(),
    updated_at: new Date().toISOString(),
  };

  let id = settlementId;
  if (settlementId) {
    const existing = await findOne('online_settlements', { id: Number(settlementId) });
    if (!existing) throw new Error('Settlement not found');
    await updateOne('online_settlements', { id: Number(settlementId) }, settlementFields);
    await deleteMany('online_settlement_allocations', { settlement_id: Number(settlementId) });
  } else {
    const created = await insertOne('online_settlements', {
      ...settlementFields,
      created_at: new Date().toISOString(),
    });
    id = created.id;
  }

  for (const allocation of allocations) {
    await insertOne('online_settlement_allocations', {
      settlement_id: Number(id),
      online_booking_id: allocation.online_booking_id,
      payment_stage: allocation.payment_stage,
      expected_amount: allocation.expected_amount,
      received_amount: allocation.received_amount,
      commission_amount: allocation.commission_amount,
    });
  }

  return getOnlineSettlementWithAllocations(id);
}

router.post('/settlements', async (req, res) => {
  try {
    res.status(201).json(await saveSettlement(req.body || {}));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/settlements/:id', async (req, res) => {
  try {
    res.json(await saveSettlement(req.body || {}, Number(req.params.id)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/settlements/:id', async (req, res) => {
  try {
    const settlement = await getOnlineSettlementWithAllocations(req.params.id);
    if (!settlement) return res.status(404).json({ error: 'Settlement not found' });
    res.json(settlement);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/settlements/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const ok = await deleteOne('online_settlements', { id });
    if (!ok) return res.status(404).json({ error: 'Settlement not found' });
    await deleteMany('online_settlement_allocations', { settlement_id: id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await findOne('online_bookings', { id: Number(req.params.id) });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(enrichOnlineBooking(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const b = req.body;
    if (!b.name || !b.sport || !b.match_date || !b.total || !b.time_slot) {
      return res.status(400).json({ error: 'name, sport, match_date, total, time_slot are required' });
    }

    const advanceMethod = normalizeOnlinePaymentMethod(b.advance_method);
    const balanceMethod = normalizeOnlinePaymentMethod(b.balance_method);

    const row = await insertOne('online_bookings', {
      name: b.name.trim(),
      sport: b.sport,
      match_date: b.match_date,
      total: parseNum(b.total),
      time_slot: b.time_slot.trim(),
      advance_gpay: parseNum(b.advance_gpay),
      advance_cash: parseNum(b.advance_cash),
      advance_date: b.advance_date || null,
      advance_method: advanceMethod,
      advance_expected_credit_date: b.advance_expected_credit_date
        || expectedOnlineCreditDate(b.advance_date, advanceMethod),
      balance_gpay: parseNum(b.balance_gpay),
      balance_cash: parseNum(b.balance_cash),
      balance_date: b.balance_date || null,
      balance_method: balanceMethod,
      balance_expected_credit_date: b.balance_expected_credit_date
        || expectedOnlineCreditDate(b.balance_date, balanceMethod),
      status: b.status || 'PENDING',
      remarks: (b.remarks || '').trim(),
      created_at: new Date().toISOString(),
    });

    res.status(201).json(enrichOnlineBooking(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await findOne('online_bookings', { id: Number(req.params.id) });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const b = req.body;
    const advanceMethod = normalizeOnlinePaymentMethod(b.advance_method ?? existing.advance_method);
    const balanceMethod = normalizeOnlinePaymentMethod(b.balance_method ?? existing.balance_method);
    const advanceDate = b.advance_date !== undefined ? (b.advance_date || null) : existing.advance_date;
    const balanceDate = b.balance_date !== undefined ? (b.balance_date || null) : existing.balance_date;

    let advanceExpectedCreditDate = existing.advance_expected_credit_date;
    if (b.advance_expected_credit_date !== undefined) {
      advanceExpectedCreditDate = b.advance_expected_credit_date || null;
    } else if (b.advance_method !== undefined || b.advance_date !== undefined) {
      advanceExpectedCreditDate = expectedOnlineCreditDate(advanceDate, advanceMethod);
    }

    let balanceExpectedCreditDate = existing.balance_expected_credit_date;
    if (b.balance_expected_credit_date !== undefined) {
      balanceExpectedCreditDate = b.balance_expected_credit_date || null;
    } else if (b.balance_method !== undefined || b.balance_date !== undefined) {
      balanceExpectedCreditDate = expectedOnlineCreditDate(balanceDate, balanceMethod);
    }

    const row = await updateOne('online_bookings', { id: Number(req.params.id) }, {
      name: (b.name || existing.name).trim(),
      sport: b.sport || existing.sport,
      match_date: b.match_date || existing.match_date,
      total: parseNum(b.total ?? existing.total),
      time_slot: (b.time_slot || existing.time_slot).trim(),
      advance_gpay: parseNum(b.advance_gpay ?? existing.advance_gpay),
      advance_cash: parseNum(b.advance_cash ?? existing.advance_cash),
      advance_date: advanceDate,
      advance_method: advanceMethod,
      advance_expected_credit_date: advanceExpectedCreditDate,
      balance_gpay: parseNum(b.balance_gpay ?? existing.balance_gpay),
      balance_cash: parseNum(b.balance_cash ?? existing.balance_cash),
      balance_date: balanceDate,
      balance_method: balanceMethod,
      balance_expected_credit_date: balanceExpectedCreditDate,
      status: b.status || existing.status,
      remarks: (b.remarks ?? existing.remarks ?? '').trim(),
    });

    res.json(enrichOnlineBooking(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ok = await deleteOne('online_bookings', { id: Number(req.params.id) });
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
