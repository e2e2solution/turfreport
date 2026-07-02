import { slotStartMinutes } from './time.js';

const SPORT_ORDER = { cricket: 0, football: 1, badminton: 2 };

export function sortTurfRows(rows) {
  return [...rows].sort((a, b) => {
    const sa = SPORT_ORDER[a.sport] ?? 9;
    const sb = SPORT_ORDER[b.sport] ?? 9;
    if (sa !== sb) return sa - sb;
    const ta = slotStartMinutes(a.time_slot);
    const tb = slotStartMinutes(b.time_slot);
    if (ta !== tb) return ta - tb;
    return String(a.match_date || '').localeCompare(String(b.match_date || ''));
  });
}

export function sortGymRows(rows) {
  return [...rows].sort((a, b) => {
    const da = String(a.start_date || '');
    const db = String(b.start_date || '');
    if (da !== db) return da.localeCompare(db);
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

export function groupTurfBySport(rows) {
  const sports = ['cricket', 'football', 'badminton'];
  const sorted = sortTurfRows(rows);
  return sports
    .map((sport) => ({
      sport,
      label: sport.charAt(0).toUpperCase() + sport.slice(1),
      rows: sorted.filter((r) => r.sport === sport),
    }))
    .filter((g) => g.rows.length > 0);
}
