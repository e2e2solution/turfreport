export const PT_GOAL_OPTIONS = [
  { value: 'strength_and_conditioning', label: 'Strength & Conditioning' },
  { value: 'calisthenics', label: 'Calisthenics' },
  { value: 'bodybuilding', label: 'Bodybuilding' },
  { value: 'injury_recovery', label: 'Injury Recovery' },
];

export const PT_PLAN_OPTIONS = [
  { value: '22_sessions', label: '22 Sessions PT' },
  { value: '11_sessions', label: '11 Sessions PT' },
  { value: '1_month', label: '1 Month PT (26 sessions)' },
  { value: '3_month', label: '3 Months PT (78 sessions)' },
];

export function targetSessionsForPlan(planType) {
  switch (planType) {
    case '11_sessions': return 11;
    case '22_sessions': return 22;
    case '1_month': return 26;
    case '3_month': return 78;
    default: return null;
  }
}

export const PT_FREEZE_REASON_OPTIONS = [
  { value: 'injury', label: 'Injury' },
  { value: 'health_issue', label: 'Health Issue' },
  { value: 'travel', label: 'Travel' },
  { value: 'other', label: 'Other' },
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

export function addDaysISO(iso, days) {
  if (!iso) return '';
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + Number(days || 0));
  return toISO(date);
}

export function calcPtEndDate(startISO, _planType, freezeDays = 0) {
  if (!startISO) return '';
  return addDaysISO(startISO, 45 + Number(freezeDays || 0));
}

export function ptStatusLabel(status) {
  switch (status) {
    case 'ACTIVE': return 'Ongoing';
    case 'READY_FOR_PAYMENT': return 'Ready for Payment';
    default: return status || '';
  }
}

export function isPtCycleLocked(status) {
  return status === 'READY_FOR_PAYMENT';
}

export function ptPlanLabel(planType) {
  return PT_PLAN_OPTIONS.find((p) => p.value === planType)?.label || planType;
}

export function ptGoalLabel(goal) {
  return PT_GOAL_OPTIONS.find((g) => g.value === goal)?.label || goal;
}
