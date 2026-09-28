import { findMany, nameLikeFilter } from '../db/collections.js';
import { formatDateDMY } from './excel.js';

function blankToEmpty(value) {
  if (value == null || value === '') return '';
  return value;
}

function money(value) {
  const n = Number(value) || 0;
  return n ? `₹${n}` : '';
}

export async function searchTurfNameHistory(q, limit = 8) {
  const query = String(q || '').trim();
  if (query.length < 1) return [];
  const rows = await findMany('bookings', nameLikeFilter(query), {
    sort: { id: -1 },
    limit,
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    label: [
      row.name,
      row.sport,
      row.time_slot,
      money(row.total),
      row.match_date ? formatDateDMY(row.match_date) : '',
    ].filter(Boolean).join(' · '),
    autofill: {
      name: row.name,
      sport: row.sport,
      total: blankToEmpty(row.total),
      time_slot: row.time_slot || '',
      advance_gpay: blankToEmpty(row.advance_gpay),
      advance_cash: blankToEmpty(row.advance_cash),
      balance_gpay: blankToEmpty(row.balance_gpay),
      balance_cash: blankToEmpty(row.balance_cash),
      remarks: row.remarks || '',
    },
  }));
}

export async function searchOnlineNameHistory(q, limit = 8) {
  const query = String(q || '').trim();
  if (query.length < 1) return [];
  const rows = await findMany('online_bookings', nameLikeFilter(query), {
    sort: { id: -1 },
    limit,
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    label: [
      row.name,
      row.sport,
      row.time_slot,
      money(row.total),
      row.advance_method || row.balance_method || '',
      row.match_date ? formatDateDMY(row.match_date) : '',
    ].filter(Boolean).join(' · '),
    autofill: {
      name: row.name,
      sport: row.sport,
      total: blankToEmpty(row.total),
      time_slot: row.time_slot || '',
      advance_gpay: blankToEmpty(row.advance_gpay),
      advance_cash: blankToEmpty(row.advance_cash),
      advance_method: row.advance_method || 'DIRECT_GPAY',
      balance_gpay: blankToEmpty(row.balance_gpay),
      balance_cash: blankToEmpty(row.balance_cash),
      balance_method: row.balance_method || 'DIRECT_GPAY',
      remarks: row.remarks || '',
    },
  }));
}

export async function searchGymNameHistory(q, limit = 8) {
  const query = String(q || '').trim();
  if (query.length < 1) return [];
  const rows = await findMany('gym_entries', nameLikeFilter(query), {
    sort: { id: -1 },
    limit,
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    label: [
      row.name,
      row.plan_months ? `${row.plan_months} month` : '',
      money(row.total),
      row.start_date ? formatDateDMY(row.start_date) : '',
    ].filter(Boolean).join(' · '),
    autofill: {
      name: row.name,
      plan_months: row.plan_months || 1,
      total: blankToEmpty(row.total),
      personal_training_amount: blankToEmpty(row.personal_training_amount),
      advance_gpay: blankToEmpty(row.advance_gpay),
      advance_cash: blankToEmpty(row.advance_cash),
      balance_gpay: blankToEmpty(row.balance_gpay),
      balance_cash: blankToEmpty(row.balance_cash),
      remarks: row.remarks || '',
    },
  }));
}

export async function searchFootballCoachingNameHistory(q, limit = 8) {
  const query = String(q || '').trim();
  if (query.length < 1) return [];
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rows = await findMany('football_coaching', {
    $or: [
      { name: { $regex: esc, $options: 'i' } },
      { parent_name: { $regex: esc, $options: 'i' } },
      { phone: { $regex: esc, $options: 'i' } },
    ],
  }, { sort: { id: -1 }, limit });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    label: [
      row.name,
      row.parent_name ? `Parent ${row.parent_name}` : '',
      row.phone || '',
      row.period || '',
      money(row.total),
      row.coaching_month || '',
    ].filter(Boolean).join(' · '),
    autofill: {
      name: row.name,
      parent_name: row.parent_name || '',
      phone: row.phone || '',
      period: row.period || 'full',
      total: blankToEmpty(row.total),
      advance_gpay: blankToEmpty(row.advance_gpay),
      advance_cash: blankToEmpty(row.advance_cash),
      balance_gpay: blankToEmpty(row.balance_gpay),
      balance_cash: blankToEmpty(row.balance_cash),
      remarks: row.remarks || '',
    },
  }));
}
