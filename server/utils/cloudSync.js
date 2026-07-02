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
