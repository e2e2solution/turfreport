import { reportToLegacySyncPayload } from './cafeStore.js';
import { reviewToLegacySyncPayload } from './reviewLegacy.js';

/** Forward report snapshot to deployed cloud server when local MongoDB is unreachable. */
export async function pushReportToCloud(snapshot) {
  const base = process.env.CLOUD_SYNC_URL?.replace(/\/$/, '');
  const key = process.env.OWNER_SYNC_KEY;
  if (!base || !key) {
    return { ok: false, error: 'CLOUD_SYNC_URL or OWNER_SYNC_KEY not set in server/.env' };
  }
  try {
    const res = await fetch(`${base}/api/owner/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Key': key,
      },
      body: JSON.stringify(snapshot),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || `Cloud sync failed (${res.status})` };
    }
    return { ok: true, url: base };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function pushCafeToCloud(snapshot) {
  const base = process.env.CLOUD_SYNC_URL?.replace(/\/$/, '');
  const key = process.env.OWNER_SYNC_KEY;
  if (!base || !key) {
    return { ok: false, error: 'CLOUD_SYNC_URL or OWNER_SYNC_KEY not set in server/.env' };
  }

  const attempts = [
    { path: '/api/owner/sync-cafe', body: snapshot },
    { path: '/api/owner/sync', body: reportToLegacySyncPayload(snapshot) },
  ];

  let lastError = 'Cafe cloud sync failed';

  for (const { path, body } of attempts) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sync-Key': key,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true, url: base, via: path };
      lastError = data.error || `Cafe cloud sync failed (${res.status})`;
      if (res.status === 404) continue;
    } catch (err) {
      lastError = err.message;
    }
  }

  return { ok: false, error: lastError };
}

export async function pushReviewToCloud(review) {
  const base = process.env.CLOUD_SYNC_URL?.replace(/\/$/, '');
  const key = process.env.OWNER_SYNC_KEY;
  if (!base || !key) {
    return { ok: false, error: 'CLOUD_SYNC_URL or OWNER_SYNC_KEY not set in server/.env' };
  }

  const attempts = [
    { path: '/api/owner/sync-review', body: review },
    { path: '/api/owner/sync', body: { ...review, report_type: 'review' } },
    { path: '/api/owner/sync', body: reviewToLegacySyncPayload(review) },
  ];

  let lastError = 'Review cloud sync failed';

  for (const { path, body } of attempts) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sync-Key': key,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true, url: base, via: path };
      lastError = data.error || `Review cloud sync failed (${res.status})`;
      if (res.status === 404) continue;
    } catch (err) {
      lastError = err.message;
    }
  }

  return { ok: false, error: lastError };
}

export async function pushPtDraftToCloud(draft) {
  const base = process.env.CLOUD_SYNC_URL?.replace(/\/$/, '');
  const key = process.env.OWNER_SYNC_KEY;
  if (!base || !key) {
    return { ok: false, error: 'CLOUD_SYNC_URL or OWNER_SYNC_KEY not set in server/.env' };
  }
  try {
    const res = await fetch(`${base}/api/owner/sync-pt-draft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Key': key,
      },
      body: JSON.stringify(draft),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || `PT draft cloud sync failed (${res.status})` };
    }
    return { ok: true, url: base };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function fetchPtDraftsFromCloud({ status = 'pending' } = {}) {
  const base = process.env.CLOUD_SYNC_URL?.replace(/\/$/, '');
  const key = process.env.OWNER_SYNC_KEY;
  if (!base || !key) {
    return { ok: false, error: 'CLOUD_SYNC_URL or OWNER_SYNC_KEY not set' };
  }
  try {
    const statusParam = Array.isArray(status) ? status.join(',') : status;
    const qs = statusParam ? `?status=${encodeURIComponent(statusParam)}` : '';
    const res = await fetch(`${base}/api/owner/pt-drafts${qs}`, {
      headers: { 'X-Sync-Key': key },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || `Fetch PT drafts failed (${res.status})` };
    }
    return { ok: true, drafts: data.drafts || data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function pushTrainerToCloud(trainer) {
  const base = process.env.CLOUD_SYNC_URL?.replace(/\/$/, '');
  const key = process.env.OWNER_SYNC_KEY;
  if (!base || !key) {
    return { ok: false, error: 'CLOUD_SYNC_URL or OWNER_SYNC_KEY not set in server/.env' };
  }
  try {
    const res = await fetch(`${base}/api/owner/sync-trainer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Key': key,
      },
      body: JSON.stringify(trainer),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || `Trainer cloud sync failed (${res.status})` };
    }
    return { ok: true, url: base };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
