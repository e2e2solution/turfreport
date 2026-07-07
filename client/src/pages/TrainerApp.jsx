import { useEffect, useState } from 'react';
import {
  clearTrainerToken,
  createTrainerDraft,
  fetchTrainerDrafts,
  formatDateDMY,
  getTrainerApiBase,
  getTrainerToken,
  markTrainerDraftReady,
  reopenTrainerDraft,
  restartTrainerDraft,
  setTrainerApiBase,
  setTrainerToken,
  toggleTrainerDraftSession,
  todayISO,
  trainerHealthCheck,
  trainerLogin,
  updateTrainerDraft,
} from '../api';
import AppLogo from '../components/AppLogo';
import PTSessionCalendar from '../components/PTSessionCalendar';
import Toast from '../components/Toast';
import {
  PT_GOAL_OPTIONS,
  PT_PLAN_OPTIONS,
  calcPtEndDate,
  ptGoalLabel,
  ptPlanLabel,
  ptStatusLabel,
} from '../utils/pt';

function TrainerLogin({ onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('123');
  const [serverUrl, setServerUrl] = useState(getTrainerApiBase() || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const showServerUrl = !import.meta.env.VITE_API_BASE;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (showServerUrl && serverUrl.trim()) setTrainerApiBase(serverUrl.trim());
      if (!getTrainerApiBase()) throw new Error('Enter cloud server URL');
      await trainerHealthCheck();
      const { token, trainer_name: name } = await trainerLogin(username.trim(), password);
      setTrainerToken(token);
      onSuccess(name);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="owner-app owner-login-screen">
      <header className="owner-brand-header">
        <div className="owner-brand-title">
          <AppLogo className="app-logo-owner" />
          <h1>VSH Trainer PT</h1>
          <p className="owner-brand-sub">Personal training on the go</p>
        </div>
      </header>
      <div className="owner-login-wrap">
        <div className="owner-login-card">
          <form onSubmit={submit}>
            {error && <div className="alert error">{error}</div>}
            {showServerUrl && (
              <label>
                Cloud server URL
                <input
                  type="url"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="https://vsh-sports-hub.onrender.com"
                  required
                />
              </label>
            )}
            <label>
              Trainer name
              <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <button type="submit" className="btn primary full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function trainerNameFromToken() {
  const token = getTrainerToken();
  if (!token) return '';
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.trainer_name || '';
  } catch {
    return '';
  }
}

export default function TrainerApp() {
  const [loggedIn, setLoggedIn] = useState(Boolean(getTrainerToken()));
  const [trainerName, setTrainerName] = useState(trainerNameFromToken());
  const [view, setView] = useState('list');
  const [drafts, setDrafts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [restartDate, setRestartDate] = useState(todayISO());

  const showToast = (message, type = 'success') => setToast({ message, type });
  const draftNote = ' — saved as draft, waiting for staff approval';
  const [form, setForm] = useState({
    client_name: '',
    pt_goal: PT_GOAL_OPTIONS[0].value,
    plan_type: PT_PLAN_OPTIONS[0].value,
    start_date: todayISO(),
    total_amount: '',
    notes: '',
  });

  const load = () => {
    setLoading(true);
    fetchTrainerDrafts()
      .then(setDrafts)
      .catch((err) => showToast(err.message, 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (loggedIn) load();
  }, [loggedIn]);

  const openDraft = (draft) => {
    setSelected(draft);
    setRestartDate(todayISO());
    setView('detail');
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const draft = await createTrainerDraft(form);
      setDrafts((rows) => [draft, ...rows]);
      setForm({
        client_name: '',
        pt_goal: PT_GOAL_OPTIONS[0].value,
        plan_type: PT_PLAN_OPTIONS[0].value,
        start_date: todayISO(),
        total_amount: '',
        notes: '',
      });
      openDraft(draft);
      showToast(`${draft.client_name} added${draftNote}`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSession = async (dateISO, checked) => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await toggleTrainerDraftSession(selected.draft_id, dateISO, checked);
      setSelected(updated);
      setDrafts((rows) => rows.map((d) => (d.draft_id === updated.draft_id ? updated : d)));
      showToast(`Session ${checked ? 'marked' : 'removed'}${draftNote}`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateDate = async (field, value) => {
    if (!selected) return;
    setSaving(true);
    try {
      const payload = { [field]: value };
      if (field === 'start_date') payload.base_end_date = calcPtEndDate(value, selected.plan_type);
      const updated = await updateTrainerDraft(selected.draft_id, payload);
      setSelected(updated);
      setDrafts((rows) => rows.map((d) => (d.draft_id === updated.draft_id ? updated : d)));
      showToast(`Details updated${draftNote}`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReady = async () => {
    if (!selected || !confirm('Mark ready for payment?')) return;
    setSaving(true);
    try {
      const updated = await markTrainerDraftReady(selected.draft_id);
      setSelected(updated);
      setDrafts((rows) => rows.map((d) => (d.draft_id === updated.draft_id ? updated : d)));
      showToast(`Marked ready for payment${draftNote}`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReopen = async () => {
    if (!selected || !confirm('Undo ready for payment? Sessions become editable again.')) return;
    setSaving(true);
    try {
      const updated = await reopenTrainerDraft(selected.draft_id);
      setSelected(updated);
      setDrafts((rows) => rows.map((d) => (d.draft_id === updated.draft_id ? updated : d)));
      showToast(`Undo ready for payment${draftNote}`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRestart = async () => {
    if (!selected || !restartDate) return;
    if (!confirm(`Reset to new month from ${formatDateDMY(restartDate)}? Sessions reset for the new cycle.`)) return;
    setSaving(true);
    try {
      const updated = await restartTrainerDraft(selected.draft_id, restartDate);
      setSelected(updated);
      setDrafts((rows) => rows.map((d) => (d.draft_id === updated.draft_id ? updated : d)));
      showToast(`Reset to new month${draftNote}`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const logout = () => {
    clearTrainerToken();
    setLoggedIn(false);
    setView('list');
    setSelected(null);
  };

  if (!loggedIn) {
    return <TrainerLogin onSuccess={(name) => { setTrainerName(name); setLoggedIn(true); }} />;
  }

  const cycleLocked = selected?.pt_status === 'READY_FOR_PAYMENT';

  return (
    <div className="owner-app page">
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'success' })}
      />
      <header className="owner-brand-header">
        <div className="owner-brand-title">
          <AppLogo className="app-logo-owner" />
          <h1>{trainerName || 'Trainer'}</h1>
          <p className="owner-brand-sub">Drafts sync to cloud — staff confirms locally</p>
        </div>
        <button type="button" className="btn small" onClick={logout}>Logout</button>
      </header>

      {view === 'list' && (
        <>
          <div className="card-title-row">
            <h2>My PT Clients</h2>
            <button type="button" className="btn small primary" onClick={() => setView('add')}>+ Add</button>
          </div>
          {loading ? (
            <p className="muted">Loading...</p>
          ) : !drafts.length ? (
            <p className="muted">No drafts yet. Add a client to start.</p>
          ) : (
            <div className="booking-list">
              {drafts.map((draft) => (
                <button
                  key={draft.draft_id}
                  type="button"
                  className="booking-card"
                  onClick={() => openDraft(draft)}
                >
                  <div className="card-top">
                    <strong>{draft.client_name}</strong>
                    <span className={`badge ${draft.pt_status === 'READY_FOR_PAYMENT' ? 'closed' : 'pending'}`}>
                      {ptStatusLabel(draft.pt_status)}
                    </span>
                  </div>
                  <div className="card-meta">
                    <span>{ptPlanLabel(draft.plan_type)}</span>
                    <span>
                      Sessions {draft.completed_sessions}
                      {draft.session_target ? ` / ${draft.session_target}` : ''}
                    </span>
                  </div>
                  <div className="card-meta">
                    {draft.awaiting_approval ? (
                      <span className="badge pending">Waiting for staff approval</span>
                    ) : (
                      <span className="badge closed">Synced</span>
                    )}
                    {draft.from_dashboard && <span>From dashboard</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {view === 'add' && (
        <div className="card">
          <div className="card-title-row">
            <h2>Add Client</h2>
            <button type="button" className="btn small" onClick={() => setView('list')}>Back</button>
          </div>
          <form className="form" onSubmit={handleCreate}>
            <label>Name *
              <input value={form.client_name} onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))} required />
            </label>
            <label>Goal
              <select value={form.pt_goal} onChange={(e) => setForm((f) => ({ ...f, pt_goal: e.target.value }))}>
                {PT_GOAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label>Plan
              <select value={form.plan_type} onChange={(e) => setForm((f) => ({ ...f, plan_type: e.target.value }))}>
                {PT_PLAN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label>Start date *
              <input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} required />
            </label>
            <label>Total amount
              <input type="number" min="0" value={form.total_amount} onChange={(e) => setForm((f) => ({ ...f, total_amount: e.target.value }))} />
            </label>
            <label>Notes
              <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </label>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save draft'}
            </button>
          </form>
        </div>
      )}

      {view === 'detail' && selected && (
        <>
          <div className="card-title-row">
            <h2>{selected.client_name}</h2>
            <button type="button" className="btn small" onClick={() => { setView('list'); setSelected(null); }}>Back</button>
          </div>
          <p className="hint">{ptPlanLabel(selected.plan_type)} · {ptGoalLabel(selected.pt_goal)}</p>

          {selected.awaiting_approval && (
            <div className="alert" style={{ background: '#fef3c7', color: '#92400e' }}>
              Changes are saved and waiting for staff to approve on the dashboard.
            </div>
          )}

          <div className="card">
            <div className="stat-grid">
              <div className="stat-card">
                <span className="stat-label">Start</span>
                <input
                  type="date"
                  value={selected.start_date}
                  disabled={cycleLocked || saving}
                  onChange={(e) => handleUpdateDate('start_date', e.target.value)}
                />
              </div>
              <div className="stat-card">
                <span className="stat-label">End</span>
                <strong className="stat-value">{formatDateDMY(selected.current_end_date || selected.base_end_date)}</strong>
              </div>
              <div className="stat-card">
                <span className="stat-label">Sessions</span>
                <strong className="stat-value">
                  {selected.completed_sessions}
                  {selected.session_target ? ` / ${selected.session_target}` : ''}
                </strong>
              </div>
              <div className="stat-card">
                <span className="stat-label">Status</span>
                <strong className="stat-value">{ptStatusLabel(selected.pt_status)}</strong>
              </div>
            </div>

            <div className="card-actions" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
              {!cycleLocked ? (
                <button type="button" className="btn primary" onClick={handleReady} disabled={saving}>
                  Ready for Payment
                </button>
              ) : (
                <>
                  <button type="button" className="btn" onClick={handleReopen} disabled={saving}>
                    Undo Ready for Payment
                  </button>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    New month from
                    <input type="date" value={restartDate} onChange={(e) => setRestartDate(e.target.value)} />
                  </label>
                  <button type="button" className="btn primary" onClick={handleRestart} disabled={saving}>
                    Reset to New Month
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <h3>Sessions</h3>
            <PTSessionCalendar
              startDate={selected.start_date}
              endDate={selected.current_end_date || selected.base_end_date}
              sessions={selected.sessions || []}
              freezes={selected.freezes || []}
              planType={selected.plan_type}
              sessionTarget={selected.session_target}
              disabled={cycleLocked || saving}
              saving={saving}
              onToggle={handleToggleSession}
            />
          </div>
        </>
      )}
    </div>
  );
}
