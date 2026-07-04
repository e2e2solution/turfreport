import { getToken } from './context/AuthContext';

const API_ROOT = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

const API_BOOKINGS = `${API_ROOT}/api/bookings`;
const API_ONLINE = `${API_ROOT}/api/online`;
const API_GYM = `${API_ROOT}/api/gym`;
const API_FOOTBALL_COACHING = `${API_ROOT}/api/football-coaching`;
const API_BULK = `${API_ROOT}/api/bulk`;
const API_REPORT = `${API_ROOT}/api/report`;
const API_SUMMARY = `${API_ROOT}/api/summary`;
const API_PT = `${API_ROOT}/api/pt`;
const API_CAFE = `${API_ROOT}/api/cafe`;
const API_REVIEWS = `${API_ROOT}/api/reviews`;
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

export async function fetchPtTrainers() {
  return request(`${API_PT}/trainers`);
}

export async function createPtTrainer(data) {
  return request(`${API_PT}/trainers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function fetchPtTrainer(id) {
  return request(`${API_PT}/trainers/${id}`);
}

export async function fetchPtClients(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`${API_PT}/clients${qs ? `?${qs}` : ''}`);
}

export async function createPtClient(data) {
  return request(`${API_PT}/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function fetchPtClient(id) {
  return request(`${API_PT}/clients/${id}`);
}

export async function updatePtClientPayment(id, data) {
  return request(`${API_PT}/clients/${id}/payment`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function markPtComplete(id) {
  return request(`${API_PT}/clients/${id}/complete`, { method: 'POST' });
}

export async function addPtSession(id, data) {
  return request(`${API_PT}/clients/${id}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deletePtSession(sessionId) {
  return request(`${API_PT}/sessions/${sessionId}`, { method: 'DELETE' });
}

export async function addPtFreeze(id, data) {
  return request(`${API_PT}/clients/${id}/freezes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deletePtFreeze(freezeId) {
  return request(`${API_PT}/freezes/${freezeId}`, { method: 'DELETE' });
}

export async function fetchPtReport(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`${API_PT}/report${qs ? `?${qs}` : ''}`);
}

export async function fetchCafeMonths() {
  return request(`${API_CAFE}/months`);
}

export async function fetchCafeReport(month) {
  return request(`${API_CAFE}/report?month=${encodeURIComponent(month)}`);
}

export async function uploadCafeReport(csv, filename) {
  return request(`${API_CAFE}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv, filename }),
  });
}

export async function deleteCafeReport(monthKey) {
  return request(`${API_CAFE}/report/${monthKey}`, { method: 'DELETE' });
}

export async function pushCafeToOwner(month) {
  return request(`${API_CAFE}/push-to-owner`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month }),
  });
}

export async function createCustomerReview(data) {
  return request(API_REVIEWS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function syncPendingReviews() {
  return request(`${API_REVIEWS}/sync-pending`, { method: 'POST' });
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
  if (stored) return stored.replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    return window.location.origin.replace(/\/$/, '');
  }
  return '';
}

export function isOwnerDailyReport(report) {
  if (!report?.payment_date) return false;
  if (String(report.payment_date).startsWith('cafe-')) return false;
  if (report.report_type === 'cafe') return false;
  return Boolean(report.collection);
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
  const rows = await ownerRequest(`${ownerApi('/reports')}${qs ? `?${qs}` : ''}`);
  return rows.filter(isOwnerDailyReport);
}

export async function fetchOwnerReport(date) {
  return ownerRequest(`${ownerApi(`/reports/${date}`)}`);
}

export async function fetchOwnerCafeMonths() {
  try {
    return await ownerRequest(`${ownerApi('/cafe/months')}`);
  } catch {
    const months = [];
    const now = new Date();
    for (let i = 0; i < 18; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      try {
        const r = await fetchOwnerReport(`cafe-${key}`);
        if (r?.month_key || r?.report_type === 'cafe') {
          months.push({
            month_key: r.month_key || key,
            label: r.label || key,
            grand_total: r.grand_total,
            grand_qty: r.grand_qty,
            business_name: r.business_name,
          });
        }
      } catch {
        /* no report for this month */
      }
    }
    if (!months.length) throw new Error('No cafe reports on cloud yet. Press Send to Owner on staff Cafe Analysis page.');
    return months;
  }
}

export async function fetchOwnerCafeReport(month) {
  try {
    return await ownerRequest(`${ownerApi(`/cafe/report?month=${encodeURIComponent(month)}`)}`);
  } catch (err) {
    const legacy = await fetchOwnerReport(`cafe-${month}`);
    if (legacy?.month_key || legacy?.report_type === 'cafe') return legacy;
    throw err;
  }
}

const OWNER_DISMISSED_REVIEWS_KEY = 'vsh_owner_dismissed_reviews';

function getDismissedReviewIds() {
  try {
    return JSON.parse(localStorage.getItem(OWNER_DISMISSED_REVIEWS_KEY) || '[]');
  } catch {
    return [];
  }
}

function dismissReviewLocally(reviewId) {
  const ids = getDismissedReviewIds();
  if (!ids.includes(reviewId)) {
    localStorage.setItem(OWNER_DISMISSED_REVIEWS_KEY, JSON.stringify([...ids, reviewId]));
  }
}

function legacyReportToReview(doc) {
  if (!doc) return null;
  const id = doc.review_id || Number(String(doc.payment_date || '').replace(/^review-/, ''));
  if (!id || !doc.comment) return null;
  return {
    review_id: id,
    customer_name: doc.customer_name || '',
    happiness: doc.happiness || 5,
    comment: doc.comment,
    read_by_owner: Boolean(doc.read_by_owner),
    created_at: doc.created_at,
  };
}

function isLegacyReviewReport(doc) {
  return String(doc?.payment_date || '').startsWith('review-')
    || doc?.report_type === 'customer_review';
}

async function fetchOwnerReviewsLegacy() {
  const rows = await ownerRequest(`${ownerApi('/reports')}?limit=60`);
  return (rows || [])
    .filter(isLegacyReviewReport)
    .map(legacyReportToReview)
    .filter(Boolean)
    .sort((a, b) => String(b.created_at || b.review_id).localeCompare(String(a.created_at || a.review_id)));
}

async function fetchOwnerLatestReviewLegacy() {
  const dismissed = getDismissedReviewIds();
  const rows = await fetchOwnerReviewsLegacy();
  const unread = rows
    .filter((r) => !r.read_by_owner)
    .filter((r) => !dismissed.includes(r.review_id));
  return unread[0] || null;
}

export async function fetchOwnerReviews() {
  try {
    return await ownerRequest(`${ownerApi('/reviews')}?limit=50`);
  } catch {
    return fetchOwnerReviewsLegacy();
  }
}

export function isReviewUnread(review) {
  if (!review?.review_id) return false;
  if (review.read_by_owner) return false;
  return !getDismissedReviewIds().includes(review.review_id);
}

export function countUnreadOwnerReviews(reviews) {
  return (reviews || []).filter(isReviewUnread).length;
}

export async function fetchOwnerLatestReview() {
  try {
    const review = await ownerRequest(ownerApi('/reviews/latest'));
    if (!review?.review_id && !isLegacyReviewReport(review)) return null;
    const normalized = review?.review_id ? review : legacyReportToReview(review);
    if (!normalized) return null;
    if (getDismissedReviewIds().includes(normalized.review_id)) return null;
    return normalized;
  } catch {
    return fetchOwnerLatestReviewLegacy();
  }
}

export async function markOwnerReviewRead(reviewId) {
  dismissReviewLocally(reviewId);
  try {
    await ownerRequest(ownerApi(`/reviews/${reviewId}/read`), { method: 'POST' });
  } catch {
    /* local dismiss keeps UI in sync when cloud route is unavailable */
  }
}

export async function markAllOwnerReviewsRead(reviewIds) {
  await Promise.all(reviewIds.map((id) => markOwnerReviewRead(id)));
}
