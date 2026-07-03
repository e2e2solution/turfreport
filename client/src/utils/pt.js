export const PT_GOAL_OPTIONS = [
  { value: 'strength_and_conditioning', label: 'Strength & Conditioning' },
  { value: 'calisthenics', label: 'Calisthenics' },
  { value: 'bodybuilding', label: 'Bodybuilding' },
  { value: 'injury_recovery', label: 'Injury Recovery' },
];

export const PT_PLAN_OPTIONS = [
  { value: '22_sessions', label: '22 Sessions PT' },
  { value: '1_month', label: '1 Month PT' },
  { value: '3_month', label: '3 Months PT' },
];

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

export function calcPtEndDate(startISO, planType, freezeDays = 0) {
  if (!startISO || !planType) return '';
  const months = planType === '3_month' ? 3 : 1;
  const end = parseIsoDate(startISO);
  end.setMonth(end.getMonth() + months);
  end.setDate(end.getDate() - 1);
  return addDaysISO(toISO(end), freezeDays);
}

export function ptPlanLabel(planType) {
  return PT_PLAN_OPTIONS.find((p) => p.value === planType)?.label || planType;
}

export function ptGoalLabel(goal) {
  return PT_GOAL_OPTIONS.find((g) => g.value === goal)?.label || goal;
}
