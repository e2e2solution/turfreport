function parseLabelToMinutes(label) {
  const t = label.trim().toLowerCase();
  const match = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3];
  if (ampm === 'pm' && h !== 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return h * 60 + m;
}

export function slotHours(timeSlot) {
  if (!timeSlot) return 0;
  const match = timeSlot.match(/^(.+?)\s+to\s+(.+)$/i);
  if (!match) return 0;
  const start = parseLabelToMinutes(match[1]);
  const end = parseLabelToMinutes(match[2]);
  if (start === null || end === null || end <= start) return 0;
  return (end - start) / 60;
}

export function slotStartMinutes(timeSlot) {
  if (!timeSlot) return 99999;
  const match = timeSlot.match(/^(.+?)\s+to\s+/i);
  if (!match) return 99999;
  const start = parseLabelToMinutes(match[1]);
  return start === null ? 99999 : start;
}

export function bookingPayment(row) {
  return (row.advance_gpay || 0) + (row.advance_cash || 0)
    + (row.balance_gpay || 0) + (row.balance_cash || 0);
}

export function onlinePayment(row) {
  return bookingPayment(row);
}

export function gymPayment(row) {
  return (row.advance_gpay || 0) + (row.advance_cash || 0)
    + (row.balance_gpay || 0) + (row.balance_cash || 0);
}
