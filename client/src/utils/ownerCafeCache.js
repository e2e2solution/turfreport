const MONTHS_KEY = 'vsh_owner_cafe_months';
const REPORTS_KEY = 'vsh_owner_cafe_reports';
const SELECTED_MONTH_KEY = 'vsh_owner_cafe_selected_month';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode */
  }
}

export function getCachedCafeMonths() {
  return readJson(MONTHS_KEY, []);
}

export function setCachedCafeMonths(months) {
  writeJson(MONTHS_KEY, months);
}

export function getCachedCafeReport(monthKey) {
  if (!monthKey) return null;
  const reports = readJson(REPORTS_KEY, {});
  return reports[monthKey] || null;
}

export function setCachedCafeReport(monthKey, report) {
  if (!monthKey || !report) return;
  const reports = readJson(REPORTS_KEY, {});
  reports[monthKey] = report;
  writeJson(REPORTS_KEY, reports);
}

export function getCachedCafeSelectedMonth() {
  return localStorage.getItem(SELECTED_MONTH_KEY) || '';
}

export function setCachedCafeSelectedMonth(monthKey) {
  if (monthKey) localStorage.setItem(SELECTED_MONTH_KEY, monthKey);
  else localStorage.removeItem(SELECTED_MONTH_KEY);
}
