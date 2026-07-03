/** Gym member count: "Rajesh AND Reni" style names = 2 members; all others = 1. Amounts unchanged. */
export function gymMemberCountForName(name) {
  if (name == null || name === '') return 1;
  if (/\band\b/i.test(String(name))) return 2;
  return 1;
}

export function countGymMembersJoined(rows) {
  return (rows || [])
    .filter((r) => !r.is_bulk_payment && !r.is_bulk)
    .reduce((sum, r) => sum + gymMemberCountForName(r.name), 0);
}
