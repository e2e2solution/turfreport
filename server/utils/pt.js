const PT_PLAN_TYPES = ['22_sessions', '1_month', '3_month'];
const PT_GOALS = [
  'strength_and_conditioning',
  'calisthenics',
  'bodybuilding',
  'injury_recovery',
];

function parseIsoDate(iso) {
  return new Date(`${iso}T00:00:00`);
}

function toISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayISO() {
  return toISO(new Date());
}

export function addDaysISO(iso, days) {
  if (!iso) return '';
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + Number(days || 0));
  return toISO(date);
}

export function calcPtBaseEndDate(startISO, planType) {
  if (!startISO || !planType) return '';
  const months = planType === '3_month' ? 3 : 1;
  const end = parseIsoDate(startISO);
  end.setMonth(end.getMonth() + months);
  end.setDate(end.getDate() - 1);
  return toISO(end);
}

export function freezeDaysBetween(fromISO, toISO) {
  if (!fromISO || !toISO) return 0;
  const from = parseIsoDate(fromISO);
  const to = parseIsoDate(toISO);
  const diffMs = to.getTime() - from.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / 86400000) + 1;
}

export function targetSessionsForPlan(planType) {
  return planType === '22_sessions' ? 22 : null;
}

export function isValidPtPlanType(planType) {
  return PT_PLAN_TYPES.includes(planType);
}

export function isValidPtGoal(goal) {
  return PT_GOALS.includes(goal);
}

export function goalLabel(goal) {
  switch (goal) {
    case 'strength_and_conditioning': return 'Strength & Conditioning';
    case 'calisthenics': return 'Calisthenics';
    case 'bodybuilding': return 'Bodybuilding';
    case 'injury_recovery': return 'Injury Recovery';
    default: return goal || '';
  }
}

export function planLabel(planType) {
  switch (planType) {
    case '22_sessions': return '22 Sessions';
    case '1_month': return '1 Month PT';
    case '3_month': return '3 Months PT';
    default: return planType || '';
  }
}

export function isDateWithinRange(dateISO, fromISO, toISO) {
  if (!dateISO || !fromISO || !toISO) return false;
  return dateISO >= fromISO && dateISO <= toISO;
}
