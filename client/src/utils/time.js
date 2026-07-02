function formatHour(h, m) {
  const hour12 = h % 12 || 12;
  const ampm = h < 12 ? 'am' : 'pm';
  if (m === 0) return `${hour12} ${ampm}`;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export const TIME_OPTIONS = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    TIME_OPTIONS.push({ value, label: formatHour(h, m) });
  }
}
TIME_OPTIONS.push({ value: '23:59', label: formatHour(23, 59) });

export function buildTimeSlot(start, end) {
  if (!start || !end) return '';
  const s = TIME_OPTIONS.find((t) => t.value === start);
  const e = TIME_OPTIONS.find((t) => t.value === end);
  if (!s || !e) return '';
  return `${s.label} to ${e.label}`;
}

export function parseTimeSlot(slot) {
  if (!slot) return { start: '', end: '' };

  const match = slot.match(/^(.+?)\s+to\s+(.+)$/i);
  if (match) {
    const find = (label) => {
      const trimmed = label.trim();
      const exact = TIME_OPTIONS.find((t) => t.label === trimmed);
      if (exact) return exact.value;
      const normalized = trimmed.replace(/\s+/g, ' ').toLowerCase();
      const fuzzy = TIME_OPTIONS.find((t) => t.label.replace(/\s+/g, ' ').toLowerCase() === normalized);
      return fuzzy?.value || '';
    };
    return { start: find(match[1]), end: find(match[2]) };
  }

  return { start: '', end: '' };
}

export function timeToMinutes(value) {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}
