import { Router } from 'express';
import {
  findMany,
  findOne,
  insertOne,
  updateOne,
  deleteOne,
  deleteMany,
} from '../db/collections.js';
import { parseNum } from '../utils/excel.js';
import { calcSessionHours, getBulkWithSessions } from '../utils/bulk.js';
import { SPORTS } from '../utils/sports.js';

const router = Router();
const CATEGORIES = ['turf', 'online', 'gym'];

function sameTimeSlot(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

router.get('/', async (req, res) => {
  try {
    const { status, category } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;

    const packages = await findMany('bulk_packages', filter, { sort: { id: -1 } });

    const withMeta = await Promise.all(packages.map(async (pkg) => {
      const sessions = await findMany('bulk_sessions', { bulk_id: pkg.id }, {
        projection: { hours: 1 },
      });
      const used_hours = sessions.reduce((sum, s) => sum + (s.hours || 0), 0);
      return { ...pkg, session_count: sessions.length, used_hours };
    }));

    res.json(withMeta);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const ok = await deleteOne('bulk_sessions', { id: Number(req.params.sessionId) });
    if (!ok) return res.status(404).json({ error: 'Session not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/sessions/:sessionId', async (req, res) => {
  try {
    const session = await findOne('bulk_sessions', { id: Number(req.params.sessionId) });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const pkg = await findOne('bulk_packages', { id: session.bulk_id });
    if (!pkg) return res.status(404).json({ error: 'Session not found' });
    if (pkg.status === 'CLOSED') {
      return res.status(400).json({ error: 'Reopen bulk first to edit sessions' });
    }

    const b = req.body;
    const sessionDate = b.session_date || session.session_date;
    const timeSlot = (b.time_slot || session.time_slot).trim();
    const remarks = b.remarks !== undefined ? (b.remarks || '').trim() : session.remarks;

    if (!sessionDate || !timeSlot) {
      return res.status(400).json({ error: 'session_date and time_slot are required' });
    }

    const hours = calcSessionHours(timeSlot);
    if (hours <= 0) {
      return res.status(400).json({ error: 'Invalid time slot' });
    }

    const siblings = await findMany('bulk_sessions', {
      bulk_id: session.bulk_id,
      session_date: sessionDate,
    });
    const duplicate = siblings.find(
      (s) => s.id !== session.id && sameTimeSlot(s.time_slot, timeSlot),
    );
    if (duplicate) {
      return res.status(400).json({ error: 'This bulk is already in the report for this date and time' });
    }

    const updated = await updateOne('bulk_sessions', { id: session.id }, {
      session_date: sessionDate,
      time_slot: timeSlot,
      hours,
      remarks,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const data = await getBulkWithSessions(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const b = req.body;
    if (!b.name || !b.category) {
      return res.status(400).json({ error: 'name and category are required' });
    }
    if (!CATEGORIES.includes(b.category)) {
      return res.status(400).json({ error: 'category must be turf, online, or gym' });
    }
    if (b.category !== 'gym' && b.sport && !SPORTS.includes(b.sport)) {
      return res.status(400).json({ error: 'invalid sport' });
    }

    const created = await insertOne('bulk_packages', {
      category: b.category,
      name: b.name.trim(),
      sport: b.category === 'gym' ? null : (b.sport || 'cricket'),
      total_hours: parseNum(b.total_hours),
      total_amount: parseNum(b.total_amount),
      plan_months: b.category === 'gym' ? (Number(b.plan_months) || null) : null,
      advance_gpay: 0,
      advance_cash: 0,
      advance_date: null,
      balance_gpay: 0,
      balance_cash: 0,
      balance_date: null,
      remarks: 'bulk',
      status: 'PENDING',
      created_at: new Date().toISOString(),
    });

    res.status(201).json(await getBulkWithSessions(created.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await findOne('bulk_packages', { id: Number(req.params.id) });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const b = req.body;
    const closing = b.close === true || b.status === 'CLOSED';

    await updateOne('bulk_packages', { id: Number(req.params.id) }, {
      name: (b.name || existing.name).trim(),
      sport: b.sport !== undefined ? b.sport : existing.sport,
      total_hours: parseNum(b.total_hours ?? existing.total_hours),
      total_amount: parseNum(b.total_amount ?? existing.total_amount),
      plan_months: b.plan_months !== undefined ? b.plan_months : existing.plan_months,
      advance_gpay: parseNum(b.advance_gpay ?? existing.advance_gpay),
      advance_cash: parseNum(b.advance_cash ?? existing.advance_cash),
      advance_date: b.advance_date !== undefined ? (b.advance_date || null) : existing.advance_date,
      balance_gpay: parseNum(b.balance_gpay ?? existing.balance_gpay),
      balance_cash: parseNum(b.balance_cash ?? existing.balance_cash),
      balance_date: b.balance_date !== undefined ? (b.balance_date || null) : existing.balance_date,
      status: closing ? 'CLOSED' : (b.status || existing.status),
      remarks: (b.remarks ?? existing.remarks ?? 'bulk').trim(),
    });

    res.json(await getBulkWithSessions(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/reopen', async (req, res) => {
  try {
    const existing = await findOne('bulk_packages', { id: Number(req.params.id) });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.status !== 'CLOSED') {
      return res.status(400).json({ error: 'Only closed bulk packages can be reopened' });
    }

    await updateOne('bulk_packages', { id: Number(req.params.id) }, { status: 'PENDING' });
    res.json(await getBulkWithSessions(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/close', async (req, res) => {
  try {
    const existing = await findOne('bulk_packages', { id: Number(req.params.id) });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const b = req.body || {};
    const hasExistingPayment = (existing.advance_gpay || 0) + (existing.advance_cash || 0)
      + (existing.balance_gpay || 0) + (existing.balance_cash || 0) > 0;

    if (!hasExistingPayment) {
      if (b.total_amount === undefined || b.total_amount === '') {
        return res.status(400).json({ error: 'Payment details required before closing' });
      }
    }

    await updateOne('bulk_packages', { id: Number(req.params.id) }, {
      total_amount: parseNum(b.total_amount ?? existing.total_amount),
      advance_gpay: parseNum(b.advance_gpay ?? existing.advance_gpay),
      advance_cash: parseNum(b.advance_cash ?? existing.advance_cash),
      advance_date: b.advance_date !== undefined ? (b.advance_date || null) : existing.advance_date,
      balance_gpay: parseNum(b.balance_gpay ?? existing.balance_gpay),
      balance_cash: parseNum(b.balance_cash ?? existing.balance_cash),
      balance_date: b.balance_date !== undefined ? (b.balance_date || null) : existing.balance_date,
      status: 'CLOSED',
      remarks: (b.remarks ?? existing.remarks ?? 'bulk').trim(),
    });

    res.json(await getBulkWithSessions(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const ok = await deleteOne('bulk_packages', { id });
    if (!ok) return res.status(404).json({ error: 'Not found' });
    await deleteMany('bulk_sessions', { bulk_id: id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/sessions', async (req, res) => {
  try {
    const pkg = await findOne('bulk_packages', { id: Number(req.params.id) });
    if (!pkg) return res.status(404).json({ error: 'Bulk package not found' });
    if (pkg.status === 'CLOSED') {
      return res.status(400).json({ error: 'Bulk is closed. Reopen it first to add more sessions.' });
    }

    const b = req.body;
    if (!b.session_date || !b.time_slot) {
      return res.status(400).json({ error: 'session_date and time_slot are required' });
    }

    const hours = calcSessionHours(b.time_slot);
    if (hours <= 0) {
      return res.status(400).json({ error: 'Invalid time slot' });
    }

    const timeSlot = b.time_slot.trim();
    const siblings = await findMany('bulk_sessions', {
      bulk_id: Number(req.params.id),
      session_date: b.session_date,
    });
    if (siblings.some((s) => sameTimeSlot(s.time_slot, timeSlot))) {
      return res.status(400).json({ error: 'This bulk is already in the report for this date and time' });
    }

    const session = await insertOne('bulk_sessions', {
      bulk_id: Number(req.params.id),
      session_date: b.session_date,
      time_slot: timeSlot,
      hours,
      remarks: (b.remarks || '').trim(),
      created_at: new Date().toISOString(),
    });

    res.status(201).json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
