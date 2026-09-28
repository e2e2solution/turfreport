import { Router } from 'express';
import {
  findMany,
  findOne,
  insertOne,
  updateOne,
  deleteOne,
  paymentDateFilter,
} from '../db/collections.js';
import { parseNum } from '../utils/excel.js';
import { searchFootballCoachingNameHistory } from '../utils/nameHistory.js';

const router = Router();
const PERIODS = ['full', 'first_half', 'second_half'];

function nameOrParentFilter(name) {
  const q = String(name || '').trim();
  if (!q) return null;
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    $or: [
      { name: { $regex: esc, $options: 'i' } },
      { parent_name: { $regex: esc, $options: 'i' } },
    ],
  };
}

function mergeFilters(...parts) {
  const cleaned = parts.filter((p) => p && Object.keys(p).length > 0);
  if (!cleaned.length) return {};
  if (cleaned.length === 1) return cleaned[0];
  return { $and: cleaned };
}

router.get('/', async (req, res) => {
  try {
    const { date, coaching_month, status, filter_type, from, to, name } = req.query;
    let baseFilter = {};

    if (filter_type === 'payment') {
      if (from && to) {
        baseFilter = paymentDateFilter(from, to, null);
      } else if (date) {
        // Allow YYYY-MM (month) or full date
        if (/^\d{4}-\d{2}$/.test(date)) {
          const [y, m] = date.split('-').map(Number);
          const last = new Date(y, m, 0).getDate();
          const monthFrom = `${date}-01`;
          const monthTo = `${date}-${String(last).padStart(2, '0')}`;
          baseFilter = paymentDateFilter(monthFrom, monthTo, null);
        } else {
          baseFilter = paymentDateFilter(null, null, date);
        }
      }
    } else if (coaching_month) {
      baseFilter = { coaching_month: coaching_month.slice(0, 7) };
    } else if (date) {
      baseFilter = {
        $or: [
          { advance_date: date },
          { balance_date: date },
          { coaching_month: date.slice(0, 7) },
        ],
      };
    }

    const extra = {};
    if (status) extra.status = status;

    const filter = mergeFilters(baseFilter, extra, nameOrParentFilter(name));
    const rows = await findMany('football_coaching', filter, {
      sort: { coaching_month: -1, id: -1 },
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/name-search', async (req, res) => {
  try {
    res.json(await searchFootballCoachingNameHistory(req.query.q));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await findOne('football_coaching', { id: Number(req.params.id) });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const b = req.body;
    if (!b.name || !b.coaching_month || b.total === undefined || b.total === '') {
      return res.status(400).json({ error: 'name, coaching_month, total are required' });
    }
    const period = b.period || 'full';
    if (!PERIODS.includes(period)) {
      return res.status(400).json({ error: 'period must be full, first_half, or second_half' });
    }

    const row = await insertOne('football_coaching', {
      name: b.name.trim(),
      parent_name: (b.parent_name || '').trim(),
      phone: (b.phone || '').trim(),
      coaching_month: b.coaching_month,
      period,
      total: parseNum(b.total),
      advance_gpay: parseNum(b.advance_gpay),
      advance_cash: parseNum(b.advance_cash),
      advance_date: b.advance_date || null,
      balance_gpay: parseNum(b.balance_gpay),
      balance_cash: parseNum(b.balance_cash),
      balance_date: b.balance_date || null,
      status: b.status || 'PENDING',
      remarks: (b.remarks || '').trim(),
      created_at: new Date().toISOString(),
    });

    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await findOne('football_coaching', { id: Number(req.params.id) });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const b = req.body;
    const period = b.period || existing.period;
    if (!PERIODS.includes(period)) {
      return res.status(400).json({ error: 'period must be full, first_half, or second_half' });
    }

    const row = await updateOne('football_coaching', { id: Number(req.params.id) }, {
      name: (b.name || existing.name).trim(),
      parent_name: (b.parent_name ?? existing.parent_name ?? '').trim(),
      phone: (b.phone ?? existing.phone ?? '').trim(),
      coaching_month: b.coaching_month || existing.coaching_month,
      period,
      total: parseNum(b.total ?? existing.total),
      advance_gpay: parseNum(b.advance_gpay ?? existing.advance_gpay),
      advance_cash: parseNum(b.advance_cash ?? existing.advance_cash),
      advance_date: b.advance_date !== undefined ? (b.advance_date || null) : existing.advance_date,
      balance_gpay: parseNum(b.balance_gpay ?? existing.balance_gpay),
      balance_cash: parseNum(b.balance_cash ?? existing.balance_cash),
      balance_date: b.balance_date !== undefined ? (b.balance_date || null) : existing.balance_date,
      status: b.status || existing.status,
      remarks: (b.remarks ?? existing.remarks ?? '').trim(),
    });

    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ok = await deleteOne('football_coaching', { id: Number(req.params.id) });
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
