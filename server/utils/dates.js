export function calcGymEndDate(startISO, months) {
  if (!startISO || !months) return '';
  const [y, m] = startISO.split('-').map(Number);
  const target = new Date(y, m - 1 + Number(months), 1);
  const end = new Date(target.getFullYear(), target.getMonth() + 1, 0);
  const dd = String(end.getDate()).padStart(2, '0');
  const mm = String(end.getMonth() + 1).padStart(2, '0');
  return `${end.getFullYear()}-${mm}-${dd}`;
}
