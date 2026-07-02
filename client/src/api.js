import { getToken } from './context/AuthContext';

const API_ROOT = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

const API_BOOKINGS = `${API_ROOT}/api/bookings`;
const API_ONLINE = `${API_ROOT}/api/online`;
const API_GYM = `${API_ROOT}/api/gym`;
const API_FOOTBALL_COACHING = `${API_ROOT}/api/football-coaching`;
const API_BULK = `${API_ROOT}/api/bulk`;
const API_REPORT = `${API_ROOT}/api/report`;
const API_SUMMARY = `${API_ROOT}/api/summary`;
const API_OWNER = `${API_ROOT}/api/owner`;

function authHeaders(extra = {}) {
  const token = getToken();
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(url, options = {}) {
  const headers = authHeaders(options.headers || {});
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('vsh_token');
    window.location.href = '/login';
    throw new Error('Session expired');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export async function fetchBookings(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`${API_BOOKINGS}${qs ? `?${qs}` : ''}`);
}

export async function fetchBooking(id) {
  return request(`${API_BOOKINGS}/${id}`);
}

export async function createBooking(data) {
  return request(API_BOOKINGS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateBooking(id, data) {
  return request(`${API_BOOKINGS}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteBooking(id) {
  return request(`${API_BOOKINGS}/${id}`, { method: 'DELETE' });
}

export async function fetchOnlineBookings(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`${API_ONLINE}${qs ? `?${qs}` : ''}`);
}

export async function fetchOnlineBooking(id) {
  return request(`${API_ONLINE}/${id}`);
}

export async function createOnlineBooking(data) {
  return request(API_ONLINE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateOnlineBooking(id, data) {
  return request(`${API_ONLINE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteOnlineBooking(id) {
  return request(`${API_ONLINE}/${id}`, { method: 'DELETE' });
}

export async function fetchGymEntries(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`${API_GYM}${qs ? `?${qs}` : ''}`);
}

export async function fetchGymEntry(id) {
  return request(`${API_GYM}/${id}`);
}

export async function createGymEntry(data) {
  return request(API_GYM, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateGymEntry(id, data) {
  return request(`${API_GYM}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteGymEntry(id) {
  return request(`${API_GYM}/${id}`, { method: 'DELETE' });
}

export async function fetchFootballCoachingEntries(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`${API_FOOTBALL_COACHING}${qs ? `?${qs}` : ''}`);
}

export async function fetchFootballCoachingEntry(id) {
  return request(`${API_FOOTBALL_COACHING}/${id}`);
}

export async function createFootballCoachingEntry(data) {
  return request(API_FOOTBALL_COACHING, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateFootballCoachingEntry(id, data) {
  return request(`${API_FOOTBALL_COACHING}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteFootballCoachingEntry(id) {
  return request(`${API_FOOTBALL_COACHING}/${id}`, { method: 'DELETE' });
}

export async function fetchBulkPackages(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`${API_BULK}${qs ? `?${qs}` : ''}`);
}

export async function fetchBulkPackage(id) {
  return request(`${API_BULK}/${id}`);
}

export async function createBulkPackage(data) {
  return request(API_BULK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateBulkPackage(id, data) {
  return request(`${API_BULK}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function reopenBulkPackage(id) {
  return request(`${API_BULK}/${id}/reopen`, { method: 'POST' });
}

export async function closeBulkPackage(id, data = {}) {
  return request(`${API_BULK}/${id}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteBulkPackage(id) {
  return request(`${API_BULK}/${id}`, { method: 'DELETE' });
}

export async function addBulkSession(bulkId, data) {
  return request(`${API_BULK}/${bulkId}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteBulkSession(sessionId) {
  return request(`${API_BULK}/sessions/${sessionId}`, { method: 'DELETE' });
}

export async function updateBulkSession(sessionId, data) {
  return request(`${API_BULK}/sessions/${sessionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function fetchReportPreview(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`${API_REPORT}/preview?${qs}`);
}

export async function fetchDailyTotal(date) {
  return request(`${API_REPORT}/daily-total?date=${date}`);
}

export async function fetchSummary(period, date) {
  return request(`${API_SUMMARY}?period=${period}&date=${date}`);
}

export async function downloadReport(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const token = getToken();
  const res = await fetch(`${API_REPORT}/excel?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Failed to download report');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'report.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

export function todayISO() {
  return new Date().toISOString().split('T')[0];
}

export function formatDateDMY(iso) {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function formatCurrency(n) {
  return `₹${(n || 0).toLocaleString('en-IN')}`;
}

const OWNER_TOKEN_KEY = 'vsh_owner_token';
const OWNER_API_BASE_KEY = 'vsh_owner_api_base';

/** Cloud server URL for owner mobile app (APK / different district). */
export function getOwnerApiBase() {
  const stored = localStorage.getItem(OWNER_API_BASE_KEY);
  const fromEnv = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
  return (stored || fromEnv).replace(/\/$/, '');
}

export function setOwnerApiBase(url) {
  let trimmed = (url || '').trim().replace(/\/$/, '');
  if (trimmed && !/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  if (trimmed) localStorage.setItem(OWNER_API_BASE_KEY, trimmed);
  else localStorage.removeItem(OWNER_API_BASE_KEY);
}

function ownerFetchError(base, err) {
  const msg = err?.message || '';
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed')) {
    if (/localhost|127\.0\.0\.1/i.test(base)) {
      return 'localhost does not work on phone. Deploy to Render and use that https URL.';
    }
    if (/^https?:\/\/(192\.168|10\.|172\.(1[6-9]|2|3[01])\.)/i.test(base)) {
      return 'Local Wi-Fi IP only works on same network. Owner in another district needs a Render cloud URL.';
    }
    return `Cannot reach ${base}. Server may be offline or URL is wrong. Deploy on Render first.`;
  }
  return msg || 'Connection failed';
}

function ownerApi(path) {
  const base = getOwnerApiBase();
  if (!base) throw new Error('Cloud server URL not set');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}/api/owner${suffix}`;
}

export function getOwnerToken() {
  return localStorage.getItem(OWNER_TOKEN_KEY);
}

export function setOwnerToken(token) {
  localStorage.setItem(OWNER_TOKEN_KEY, token);
}

export function clearOwnerToken() {
  localStorage.removeItem(OWNER_TOKEN_KEY);
}

async function ownerRequest(url, options = {}) {
  const token = getOwnerToken();
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export async function ownerLogin(pin) {
  const res = await fetch(ownerApi('/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Login failed');
  }
  return res.json();
}

export async function ownerHealthCheck() {
  const base = getOwnerApiBase();
  if (!base) throw new Error('Enter cloud server URL first');
  try {
    const res = await fetch(`${base}/api/health`);
    if (!res.ok) throw new Error('Server not reachable');
    return res.json();
  } catch (err) {
    throw new Error(ownerFetchError(base, err));
  }
}

export async function pushOwnerReport(date) {
  return request(`${API_OWNER}/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date }),
  });
}

export async function fetchOwnerReports(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return ownerRequest(`${ownerApi('/reports')}${qs ? `?${qs}` : ''}`);
}

export async function fetchOwnerReport(date) {
  return ownerRequest(`${ownerApi(`/reports/${date}`)}`);
}
