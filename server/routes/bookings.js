import { Router } from 'express';
import {
  findMany,
  findOne,
  insertOne,
  updateOne,
  deleteOne,
  paymentDateFilter,
  nameLikeFilter,
} from '../db/collections.js';
import { parseNum } from '../utils/excel.js';
import { searchTurfNameHistory } from '../utils/nameHistory.js';
import { resolveBookingLinkGroup } from '../utils/bookingLinks.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { date, match_date, status, filter_type, exclude_id, name } = req.query;
    const filter = {};

    if (filter_type === 'payment' && date) {
      Object.assign(filter, paymentDateFilter(null, null, date));
    } else if (match_date) {
      filter.match_date = match_date;
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
    if (exclude_id) filter.id = { $ne: Number(exclude_id) };

    const rows = await findMany('bookings', filter, { sort: { match_date: -1, id: -1 } });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/name-search', async (req, res) => {
  try {
    res.json(await searchTurfNameHistory(req.query.q));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await findOne('bookings', { id: Number(req.params.id) });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const b = req.body;
    if (!b.name || !b.sport || !b.match_date || b.total === undefined || b.total === null || b.total === '' || !b.time_slot) {
      return res.status(400).json({ error: 'name, sport, match_date, total, time_slot are required' });
    }

    let linkGroupId = null;
    try {
      linkGroupId = await resolveBookingLinkGroup(b);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }

    const row = await insertOne('bookings', {
      name: b.name.trim(),
      sport: b.sport,
      match_date: b.match_date,
      total: parseNum(b.total),
      time_slot: b.time_slot.trim(),
      advance_gpay: parseNum(b.advance_gpay),
      advance_cash: parseNum(b.advance_cash),
      advance_date: b.advance_date || null,
      balance_gpay: parseNum(b.balance_gpay),
      balance_cash: parseNum(b.balance_cash),
      balance_date: b.balance_date || null,
      status: b.status || 'PENDING',
      remarks: (b.remarks || '').trim(),
      link_group_id: linkGroupId,
      created_at: new Date().toISOString(),
    });

    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await findOne('bookings', { id: Number(req.params.id) });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const b = req.body;
    let linkGroupId = existing.link_group_id || null;
    try {
      if (b.link_booking_id !== undefined || b.link_group_id !== undefined) {
        linkGroupId = await resolveBookingLinkGroup(b, existing);
      }
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }

    const row = await updateOne('bookings', { id: Number(req.params.id) }, {
      name: (b.name || existing.name).trim(),
      sport: b.sport || existing.sport,
      match_date: b.match_date || existing.match_date,
      total: parseNum(b.total ?? existing.total),
      time_slot: (b.time_slot || existing.time_slot).trim(),
      advance_gpay: parseNum(b.advance_gpay ?? existing.advance_gpay),
      advance_cash: parseNum(b.advance_cash ?? existing.advance_cash),
      advance_date: b.advance_date !== undefined ? (b.advance_date || null) : existing.advance_date,
      balance_gpay: parseNum(b.balance_gpay ?? existing.balance_gpay),
      balance_cash: parseNum(b.balance_cash ?? existing.balance_cash),
      balance_date: b.balance_date !== undefined ? (b.balance_date || null) : existing.balance_date,
      status: b.status || existing.status,
      remarks: (b.remarks ?? existing.remarks ?? '').trim(),
      link_group_id: linkGroupId,
    });

    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ok = await deleteOne('bookings', { id: Number(req.params.id) });
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
