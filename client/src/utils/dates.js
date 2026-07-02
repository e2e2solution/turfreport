export const PLAN_OPTIONS = [
  { value: 1, label: '1 Month' },
  { value: 3, label: '3 Months' },
  { value: 6, label: '6 Months' },
];

export function calcGymEndDate(startISO, months) {
  if (!startISO || !months) return '';
  const [y, m] = startISO.split('-').map(Number);
  const target = new Date(y, m - 1 + Number(months), 1);
  const end = new Date(target.getFullYear(), target.getMonth() + 1, 0);
  const dd = String(end.getDate()).padStart(2, '0');
  const mm = String(end.getMonth() + 1).padStart(2, '0');
  return `${end.getFullYear()}-${mm}-${dd}`;
}

export function planLabel(months) {
  const opt = PLAN_OPTIONS.find((p) => p.value === Number(months));
  return opt ? opt.label : `${months} Month`;
}

export const COACHING_PERIOD_OPTIONS = [
  { value: 'full', label: 'Full Month' },
  { value: 'first_half', label: '1st Half (join mid-month)' },
  { value: 'second_half', label: '2nd Half' },
];

export function coachingPeriodLabel(period) {
  const opt = COACHING_PERIOD_OPTIONS.find((p) => p.value === period);
  return opt ? opt.label : period;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatCoachingMonth(yyyyMm) {
  if (!yyyyMm) return '-';
  const [y, m] = yyyyMm.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1] || m} ${y}`;
}
