import { slotStartMinutes } from './time.js';
import { SPORTS, sportLabel } from './sports.js';

const SPORT_ORDER = Object.fromEntries(SPORTS.map((s, i) => [s, i]));

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
  const sorted = sortTurfRows(rows);
  return SPORTS
    .map((sport) => ({
      sport,
      label: sportLabel(sport),
      rows: sorted.filter((r) => r.sport === sport),
    }))
    .filter((g) => g.rows.length > 0);
}
