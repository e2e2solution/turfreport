import { Router } from 'express';
import ExcelJS from 'exceljs';
import {
  findMany,
  findOne,
  insertOne,
  updateOne,
  deleteOne,
  paymentDateFilter,
  nameLikeFilter,
} from '../db/collections.js';
import { parseNum, buildGymSheet } from '../utils/excel.js';
import { calcGymEndDate } from '../utils/dates.js';
import { searchGymNameHistory } from '../utils/nameHistory.js';
import { gymPayment } from '../utils/time.js';
import { gymMemberCountForName } from '../utils/gymCount.js';
import { resolveGymLinkGroup, appendLinkedGymCarryover, annotateGymLinks } from '../utils/gymLinks.js';
import { formatMonthLabel } from '../utils/cafeCsv.js';
import { getRange } from '../utils/summaryDates.js';

const router = Router();

function gymDue(row) {
  const total = (Number(row.total) || 0) + (Number(row.personal_training_amount) || 0);
  const paid = gymPayment(row);
  return Math.round(Math.max(0, total - paid) * 100) / 100;
}

function enrichPendingRow(row) {
  const paid = gymPayment(row);
  const due = gymDue(row);
  return {
    ...row,
    paid,
    due,
    members: gymMemberCountForName(row.name),
  };
}

async function listGymEntries(query) {
  const { date, start_date, start_month, status, filter_type, name, plan_months } = query;
  const filter = {};

  if (filter_type === 'payment' && date) {
    Object.assign(filter, paymentDateFilter(null, null, date));
  } else if (start_month && /^\d{4}-\d{2}$/.test(String(start_month))) {
    const range = getRange('monthly', `${start_month}-01`);
    filter.start_date = { $gte: range.from, $lte: range.to };
  } else if (start_date) {
    filter.start_date = start_date;
  } else if (date) {
    filter.$or = [
      { advance_date: date },
      { balance_date: date },
      { start_date: date },
      { end_date: date },
    ];
  }
  if (status) filter.status = status;
  if (name && String(name).trim()) {
    Object.assign(filter, nameLikeFilter(name));
  }
  if (plan_months) filter.plan_months = Number(plan_months);

  const rows = await findMany('gym_entries', filter, { sort: { start_date: -1, id: -1 } });
  if (query.filter_type === 'payment') return annotateGymLinks(rows);
  return appendLinkedGymCarryover(rows);
}

router.get('/', async (req, res) => {
  try {
    res.json(await listGymEntries(req.query));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/excel', async (req, res) => {
  try {
    const rows = await listGymEntries(req.query);
    const workbook = new ExcelJS.Workbook();
    buildGymSheet(workbook.addWorksheet('Gym'), rows);

    const parts = ['gym'];
    if (req.query.start_month) parts.push(req.query.start_month);
    if (req.query.plan_months) parts.push(`${req.query.plan_months}m`);
    if (req.query.status) parts.push(String(req.query.status).toLowerCase());
    const filename = `${parts.join('-')}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/name-search', async (req, res) => {
  try {
    res.json(await searchGymNameHistory(req.query.q));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Month-wise gym pending (status PENDING or balance still due). */
router.get('/pending-report', async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(String(month))) {
      return res.status(400).json({ error: 'month must be YYYY-MM' });
    }
    const range = getRange('monthly', `${month}-01`);
    const rows = await findMany('gym_entries', {
      start_date: { $gte: range.from, $lte: range.to },
    }, { sort: { start_date: 1, name: 1, id: 1 } });

    const pending = rows
      .map(enrichPendingRow)
      .filter((r) => r.due > 0.009);

    const totals = pending.reduce(
      (acc, r) => {
        acc.count += 1;
        acc.members += r.members;
        acc.total += Number(r.total) || 0;
        acc.pt += Number(r.personal_training_amount) || 0;
        acc.paid += r.paid;
        acc.due += r.due;
        return acc;
      },
      { count: 0, members: 0, total: 0, pt: 0, paid: 0, due: 0 },
    );
    totals.total = Math.round(totals.total * 100) / 100;
    totals.pt = Math.round(totals.pt * 100) / 100;
    totals.paid = Math.round(totals.paid * 100) / 100;
    totals.due = Math.round(totals.due * 100) / 100;

    res.json({
      month_key: month,
      label: formatMonthLabel(month),
      range,
      rows: pending,
      totals,
      note: 'Only members who still owe money. Due = (Plan total + PT) − Paid. Status label is just for reference.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await findOne('gym_entries', { id: Number(req.params.id) });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const b = req.body;
    const planMonths = Number(b.plan_months) || 1;
    const startDate = b.start_date;
    const endDate = b.end_date || calcGymEndDate(startDate, planMonths);

    if (!b.name || !startDate || !b.total) {
      return res.status(400).json({ error: 'name, start_date, total are required' });
    }
    if (![1, 3, 6].includes(planMonths)) {
      return res.status(400).json({ error: 'plan_months must be 1, 3, or 6' });
    }

    const linkGroupId = await resolveGymLinkGroup(b);
    const row = await insertOne('gym_entries', {
      name: b.name.trim(),
      start_date: startDate,
      end_date: endDate,
      plan_months: planMonths,
      total: parseNum(b.total),
      personal_training_amount: parseNum(b.personal_training_amount),
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
    console.error('Gym create error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to save gym entry' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await findOne('gym_entries', { id: Number(req.params.id) });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const b = req.body;
    const planMonths = Number(b.plan_months ?? existing.plan_months) || 1;
    const startDate = b.start_date || existing.start_date;
    const endDate = b.end_date || calcGymEndDate(startDate, planMonths);

    const linkGroupId = await resolveGymLinkGroup(b, existing);
    const row = await updateOne('gym_entries', { id: Number(req.params.id) }, {
      name: (b.name || existing.name).trim(),
      start_date: startDate,
      end_date: endDate,
      plan_months: planMonths,
      total: parseNum(b.total ?? existing.total),
      personal_training_amount: parseNum(b.personal_training_amount ?? existing.personal_training_amount),
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
    const ok = await deleteOne('gym_entries', { id: Number(req.params.id) });
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
