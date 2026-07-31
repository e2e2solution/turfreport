import crypto from 'crypto';
import db from '../db.js';

export function newLinkGroupId() {
  return crypto.randomUUID();
}

/**
 * Resolve link_group_id when saving a turf booking.
 * Body may include link_booking_id (existing booking to pair with today).
 */
export function resolveBookingLinkGroup(body, existing = null) {
  const linkBookingId = body.link_booking_id != null && body.link_booking_id !== ''
    ? Number(body.link_booking_id)
    : null;

  if (!linkBookingId) {
    // Explicit clear when editing and no link selected
    if (body.link_booking_id === '' || body.link_booking_id === null) {
      return null;
    }
    if (body.link_group_id) return String(body.link_group_id);
    return existing?.link_group_id || null;
  }

  const partner = db.prepare('SELECT * FROM bookings WHERE id = ?').get(linkBookingId);
  if (!partner) {
    const err = new Error('Linked booking not found');
    err.status = 400;
    throw err;
  }

  const groupId = partner.link_group_id || existing?.link_group_id || newLinkGroupId();

  if (!partner.link_group_id) {
    db.prepare('UPDATE bookings SET link_group_id = ? WHERE id = ?').run(groupId, partner.id);
  }

  return groupId;
}

/** Merge in other bookings that share a link_group_id (so empty linked rows still show). */
export function appendLinkedTurfBookings(rows, { match_date, from, to } = {}) {
  const groups = [...new Set(
    rows
      .map((r) => r.link_group_id)
      .filter(Boolean),
  )];
  if (!groups.length) return rows;

  const byId = new Map(rows.map((r) => [r.id, r]));
  const placeholders = groups.map(() => '?').join(',');
  let sql = `SELECT * FROM bookings WHERE link_group_id IN (${placeholders})`;
  const params = [...groups];

  if (match_date) {
    sql += ' AND match_date = ?';
    params.push(match_date);
  } else if (from && to) {
    sql += ' AND match_date BETWEEN ? AND ?';
    params.push(from, to);
  }

  for (const row of db.prepare(sql).all(...params)) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }

  return [...byId.values()];
}

export function annotateLinkedBookings(rows) {
  return rows.map((row) => {
    if (!row.link_group_id) return row;
    const paid = (Number(row.advance_gpay) || 0) + (Number(row.advance_cash) || 0)
      + (Number(row.balance_gpay) || 0) + (Number(row.balance_cash) || 0);
    const hasAmount = paid > 0 || (Number(row.total) || 0) > 0;
    return {
      ...row,
      is_linked_booking: true,
      is_link_amount_row: hasAmount,
      link_hue: linkHue(row.link_group_id),
    };
  });
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
