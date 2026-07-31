/** Canonical turf/online sport values stored in DB. */
export const SPORTS = ['cricket', 'football', 'badminton', 'cricket_ball'];

export function isValidSport(value) {
  return SPORTS.includes(value);
}

export function sportLabel(sport) {
  if (!sport) return '';
  return String(sport)
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
