import crypto from 'crypto';
import { findOne, findMany, updateOne } from '../db/collections.js';

function newLinkGroupId() {
  return crypto.randomUUID();
}

export function linkHue(groupId) {
  if (!groupId) return 0;
  let hash = 0;
  for (let i = 0; i < groupId.length; i += 1) {
    hash = ((hash << 5) - hash) + groupId.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 6;
}

function planText(months) {
  return ({ 1: '1 Month', 3: '3 Months', 6: '6 Months' }[Number(months)] || `${months} Month`);
}

/**
 * Pair this gym record with an older package paid on the same day
 * (e.g. June 3-month balance + this month's 1-month fee).
 */
export async function resolveGymLinkGroup(body, existing = null) {
  const linkGymId = body.link_gym_id != null && body.link_gym_id !== ''
    ? Number(body.link_gym_id)
    : null;

  if (!linkGymId) {
    if (body.link_gym_id === '' || body.link_gym_id === null) return null;
    if (body.link_group_id) return String(body.link_group_id);
    return existing?.link_group_id || null;
  }

  if (existing && Number(linkGymId) === Number(existing.id)) {
    const err = new Error('Cannot link a gym record to itself');
    err.status = 400;
    throw err;
  }

  const partner = await findOne('gym_entries', { id: linkGymId });
  if (!partner) {
    const err = new Error('Linked gym record not found');
    err.status = 400;
    throw err;
  }

  const groupId = partner.link_group_id || existing?.link_group_id || newLinkGroupId();
  if (partner.link_group_id !== groupId) {
    await updateOne('gym_entries', { id: partner.id }, { link_group_id: groupId });
  }
  return groupId;
}

export function annotateGymLinks(rows) {
  return (rows || []).map((row) => {
    if (!row?.link_group_id) return row;
    return {
      ...row,
      is_linked_booking: true,
      link_hue: linkHue(row.link_group_id),
      link_note: row.is_linked_carryover
        ? `Linked previous ${planText(row.plan_months)} — paid with this month`
        : 'Linked payment',
    };
  });
}

/** Pull linked older packages into a filtered month/package list so they stay visible. */
export async function appendLinkedGymCarryover(rows) {
  const groups = [...new Set((rows || []).map((r) => r.link_group_id).filter(Boolean))];
  if (!groups.length) return annotateGymLinks(rows);

  const byId = new Map(rows.map((r) => [r.id, r]));
  const partners = await findMany('gym_entries', { link_group_id: { $in: groups } });

  const extras = [];
  for (const row of partners) {
    if (byId.has(row.id)) continue;
    extras.push({
      ...row,
      is_linked_carryover: true,
    });
    byId.set(row.id, row);
  }

  return annotateGymLinks([...rows, ...extras]);
}
