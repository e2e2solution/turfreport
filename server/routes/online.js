import { Router } from 'express';
import db from '../db.js';
import { parseNum } from '../utils/excel.js';
import { appendAnyPayment } from '../utils/reportQuery.js';
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

router.get('/', (req, res) => {
  const { date, match_date, status, filter_type, from, to } = req.query;
  let sql = 'SELECT * FROM online_bookings WHERE 1=1';
  const params = [];

  if (filter_type === 'payment' && (date || (from && to))) {
    sql = appendAnyPayment(sql, params, from, to, date);
  } else if (match_date) {
    sql += ' AND match_date = ?';
    params.push(match_date);
  } else if (from && to) {
    sql += ' AND match_date BETWEEN ? AND ?';
    params.push(from, to);
  } else if (date) {
    sql += ` AND (
      advance_date = ? OR balance_date = ? OR match_date = ?
    )`;
    params.push(date, date, date);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += ' ORDER BY match_date DESC, id DESC';
  res.json(db.prepare(sql).all(...params).map(enrichOnlineBooking));
});

router.get('/name-search', (req, res) => {
  res.json(searchOnlineNameHistory(req.query.q));
});

router.get('/settlement-candidates/list', (req, res) => {
  res.json(listOnlineSettlementCandidates({
    from: req.query.from,
    to: req.query.to,
  }));
});

router.get('/settlements/list', (req, res) => {
  res.json(listOnlineSettlements({
    from: req.query.from,
    to: req.query.to,
  }));
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

function buildCandidateForRef(bookingId, stage, excludeSettlementId = null) {
  const booking = enrichOnlineBooking(
    db.prepare('SELECT * FROM online_bookings WHERE id = ?').get(bookingId),
  );
  if (!booking) return null;

  const method = booking[`${stage}_method`];
  const partAmount = Number(booking[`${stage}_gpay`]) || 0;

  let allocatedSql = `
    SELECT COALESCE(SUM(expected_amount), 0) AS allocated_expected
    FROM online_settlement_allocations
    WHERE online_booking_id = ? AND payment_stage = ?
  `;
  const params = [bookingId, stage];
  if (excludeSettlementId) {
    allocatedSql += ' AND settlement_id != ?';
    params.push(excludeSettlementId);
  }
  const allocatedExpected = Number(
    db.prepare(allocatedSql).get(...params)?.allocated_expected,
  ) || 0;

  return {
    online_booking_id: booking.id,
    payment_stage: stage,
    method,
    payment_amount: partAmount,
    outstanding_amount: Math.max(0, partAmount - allocatedExpected),
  };
}

function saveSettlement(body, settlementId = null) {
  validateSettlementBody(body);

  // Validate against the specific selected bookings, independent of the
  // match-date range, so a slightly different range never blocks a save.
  const candidateMap = new Map();
  for (const item of body.allocations) {
    const key = `${item.online_booking_id}:${item.payment_stage}`;
    if (candidateMap.has(key)) continue;
    const candidate = buildCandidateForRef(
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

  return db.transaction(() => {
    let id = settlementId;
    if (settlementId) {
      db.prepare(`
        UPDATE online_settlements SET
          credit_date = ?, source = ?, from_date = ?, to_date = ?,
          gross_amount = ?, received_amount = ?, commission_amount = ?,
          reference = ?, notes = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        body.credit_date,
        source,
        body.from_date,
        body.to_date,
        grossAmount,
        receivedAmount,
        Math.max(0, grossAmount - receivedAmount),
        (body.reference || '').trim(),
        (body.notes || '').trim(),
        settlementId,
      );
      db.prepare('DELETE FROM online_settlement_allocations WHERE settlement_id = ?').run(settlementId);
    } else {
      const result = db.prepare(`
        INSERT INTO online_settlements (
          credit_date, source, from_date, to_date,
          gross_amount, received_amount, commission_amount, reference, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        body.credit_date,
        source,
        body.from_date,
        body.to_date,
        grossAmount,
        receivedAmount,
        Math.max(0, grossAmount - receivedAmount),
        (body.reference || '').trim(),
        (body.notes || '').trim(),
      );
      id = result.lastInsertRowid;
    }

    const insert = db.prepare(`
      INSERT INTO online_settlement_allocations (
        settlement_id, online_booking_id, payment_stage,
        expected_amount, received_amount, commission_amount
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const allocation of allocations) {
      insert.run(
        id,
        allocation.online_booking_id,
        allocation.payment_stage,
        allocation.expected_amount,
        allocation.received_amount,
        allocation.commission_amount,
      );
    }
    return getOnlineSettlementWithAllocations(id);
  })();
}

router.post('/settlements', (req, res) => {
  try {
    res.status(201).json(saveSettlement(req.body || {}));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/settlements/:id', (req, res) => {
  try {
    res.json(saveSettlement(req.body || {}, Number(req.params.id)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/settlements/:id', (req, res) => {
  const settlement = getOnlineSettlementWithAllocations(req.params.id);
  if (!settlement) return res.status(404).json({ error: 'Settlement not found' });
  res.json(settlement);
});

router.delete('/settlements/:id', (req, res) => {
  const result = db.prepare('DELETE FROM online_settlements WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Settlement not found' });
  res.json({ success: true });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM online_bookings WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(enrichOnlineBooking(row));
});

router.post('/', (req, res) => {
  const b = req.body;
  if (!b.name || !b.sport || !b.match_date || !b.total || !b.time_slot) {
    return res.status(400).json({ error: 'name, sport, match_date, total, time_slot are required' });
  }

  const result = db.prepare(`
    INSERT INTO online_bookings (name, sport, match_date, total, time_slot,
      advance_gpay, advance_cash, advance_date, advance_method, advance_expected_credit_date,
      balance_gpay, balance_cash, balance_date, balance_method, balance_expected_credit_date,
      status, remarks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    b.name.trim(), b.sport, b.match_date, parseNum(b.total), b.time_slot.trim(),
    parseNum(b.advance_gpay), parseNum(b.advance_cash), b.advance_date || null,
    normalizeOnlinePaymentMethod(b.advance_method),
    b.advance_expected_credit_date
      || expectedOnlineCreditDate(b.advance_date, normalizeOnlinePaymentMethod(b.advance_method)),
    parseNum(b.balance_gpay), parseNum(b.balance_cash), b.balance_date || null,
    normalizeOnlinePaymentMethod(b.balance_method),
    b.balance_expected_credit_date
      || expectedOnlineCreditDate(b.balance_date, normalizeOnlinePaymentMethod(b.balance_method)),
    b.status || 'PENDING', (b.remarks || '').trim()
  );

  res.status(201).json(enrichOnlineBooking(
    db.prepare('SELECT * FROM online_bookings WHERE id = ?').get(result.lastInsertRowid),
  ));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM online_bookings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const b = req.body;
  db.prepare(`
    UPDATE online_bookings SET
      name = ?, sport = ?, match_date = ?, total = ?, time_slot = ?,
      advance_gpay = ?, advance_cash = ?, advance_date = ?,
      advance_method = ?, advance_expected_credit_date = ?,
      balance_gpay = ?, balance_cash = ?, balance_date = ?,
      balance_method = ?, balance_expected_credit_date = ?,
      status = ?, remarks = ?
    WHERE id = ?
  `).run(
    (b.name || existing.name).trim(),
    b.sport || existing.sport,
    b.match_date || existing.match_date,
    parseNum(b.total ?? existing.total),
    (b.time_slot || existing.time_slot).trim(),
    parseNum(b.advance_gpay ?? existing.advance_gpay),
    parseNum(b.advance_cash ?? existing.advance_cash),
    b.advance_date !== undefined ? (b.advance_date || null) : existing.advance_date,
    normalizeOnlinePaymentMethod(b.advance_method ?? existing.advance_method),
    (() => {
      const method = normalizeOnlinePaymentMethod(b.advance_method ?? existing.advance_method);
      const paidDate = b.advance_date !== undefined ? (b.advance_date || null) : existing.advance_date;
      if (b.advance_expected_credit_date !== undefined) {
        return b.advance_expected_credit_date || null;
      }
      if (
        b.advance_method !== undefined
        || b.advance_date !== undefined
      ) {
        return expectedOnlineCreditDate(paidDate, method);
      }
      return existing.advance_expected_credit_date;
    })(),
    parseNum(b.balance_gpay ?? existing.balance_gpay),
    parseNum(b.balance_cash ?? existing.balance_cash),
    b.balance_date !== undefined ? (b.balance_date || null) : existing.balance_date,
    normalizeOnlinePaymentMethod(b.balance_method ?? existing.balance_method),
    (() => {
      const method = normalizeOnlinePaymentMethod(b.balance_method ?? existing.balance_method);
      const paidDate = b.balance_date !== undefined ? (b.balance_date || null) : existing.balance_date;
      if (b.balance_expected_credit_date !== undefined) {
        return b.balance_expected_credit_date || null;
      }
      if (
        b.balance_method !== undefined
        || b.balance_date !== undefined
      ) {
        return expectedOnlineCreditDate(paidDate, method);
      }
      return existing.balance_expected_credit_date;
    })(),
    b.status || existing.status,
    (b.remarks ?? existing.remarks ?? '').trim(),
    req.params.id
  );

  res.json(enrichOnlineBooking(
    db.prepare('SELECT * FROM online_bookings WHERE id = ?').get(req.params.id),
  ));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM online_bookings WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

export default router;
