function pad(n) {
  return String(n).padStart(2, '0');
}

export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function getRange(period, dateStr) {
  const base = dateStr ? parseISO(dateStr) : new Date();
  const y = base.getFullYear();
  const m = base.getMonth();
  const d = base.getDate();

  if (period === 'daily') {
    const iso = toISO(base);
    return { from: iso, to: iso, label: iso };
  }

  if (period === 'weekly') {
    const day = base.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const mon = new Date(y, m, d + diffToMon);
    const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
    return { from: toISO(mon), to: toISO(sun), label: `${toISO(mon)} to ${toISO(sun)}` };
  }

  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const monthName = first.toLocaleString('en', { month: 'long', year: 'numeric' });
  return { from: toISO(first), to: toISO(last), label: monthName };
}

export function eachDay(from, to) {
  const days = [];
  const cur = parseISO(from);
  const end = parseISO(to);
  while (cur <= end) {
    days.push(toISO(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function dayLabel(iso) {
  const d = parseISO(iso);
  return d.toLocaleDateString('en', { weekday: 'short', day: 'numeric' });
}

export function weekBuckets(from, to) {
  const days = eachDay(from, to);
  const buckets = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    buckets.push({
      key: chunk[0],
      label: `W${Math.floor(i / 7) + 1} (${dayLabel(chunk[0])})`,
      days: chunk,
    });
  }
  return buckets;
}

export function inRange(iso, from, to) {
  return iso >= from && iso <= to;
}
