import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  addPtFreeze,
  addPtSession,
  deletePtFreeze,
  deletePtSession,
  fetchPtClient,
  formatCurrency,
  formatDateDMY,
  markPtComplete,
  undoPtComplete,
  todayISO,
  updatePtClientPayment,
} from '../api';
import { PaymentSection, TabBar } from '../components/BookingForm';
import PTSessionCalendar from '../components/PTSessionCalendar';
import { PT_FREEZE_REASON_OPTIONS } from '../utils/pt';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'freeze', label: 'Freeze' },
  { id: 'payment', label: 'Payment' },
];

export default function PTClientDetail() {
  const { id } = useParams();
  const [client, setClient] = useState(null);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [freezeForm, setFreezeForm] = useState({
    freeze_from: todayISO(),
    freeze_to: todayISO(),
    reason: PT_FREEZE_REASON_OPTIONS[0].value,
    notes: '',
  });
  const [paymentForm, setPaymentForm] = useState({
    total_amount: '',
    advance_gpay: '',
    advance_cash: '',
    advance_date: '',
    balance_gpay: '',
    balance_cash: '',
    balance_date: '',
    notes: '',
  });

  const load = () => {
    setLoading(true);
    fetchPtClient(id)
      .then((row) => {
        setClient(row);
        setPaymentForm({
          total_amount: row.total_amount || '',
          advance_gpay: row.advance_gpay || '',
          advance_cash: row.advance_cash || '',
          advance_date: row.advance_date || '',
          balance_gpay: row.balance_gpay || '',
          balance_cash: row.balance_cash || '',
          balance_date: row.balance_date || '',
          notes: row.notes || '',
        });
      })
      .catch((err) => alert(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const setPayment = (field, value) => setPaymentForm((f) => ({ ...f, [field]: value }));

  const freezeDaysPlanned = useMemo(() => {
    if (!freezeForm.freeze_from || !freezeForm.freeze_to) return 0;
    const start = new Date(`${freezeForm.freeze_from}T00:00:00`);
    const end = new Date(`${freezeForm.freeze_to}T00:00:00`);
    const diff = end.getTime() - start.getTime();
    if (diff < 0) return 0;
    return Math.floor(diff / 86400000) + 1;
  }, [freezeForm.freeze_from, freezeForm.freeze_to]);

  const handleToggleSession = async (dateISO, checked, existingSession) => {
    setSaving(true);
    try {
      if (checked) {
        const updated = await addPtSession(id, { session_date: dateISO });
        setClient(updated);
      } else if (existingSession) {
        const updated = await deletePtSession(existingSession.id);
        setClient(updated);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddFreeze = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await addPtFreeze(id, freezeForm);
      setClient(updated);
      setFreezeForm({
        freeze_from: todayISO(),
        freeze_to: todayISO(),
        reason: PT_FREEZE_REASON_OPTIONS[0].value,
        notes: '',
      });
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFreeze = async (freezeId) => {
    if (!confirm('Remove this freeze?')) return;
    setSaving(true);
    try {
      const updated = await deletePtFreeze(freezeId);
      setClient(updated);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSavePayment = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updatePtClientPayment(id, paymentForm);
      setClient(updated);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!confirm('Mark this PT as completed?')) return;
    setSaving(true);
    try {
      const updated = await markPtComplete(id);
      setClient(updated);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUndoComplete = async () => {
    if (!confirm('Undo completion? Session checkboxes will be editable again.')) return;
    setSaving(true);
    try {
      const updated = await undoPtComplete(id);
      setClient(updated);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="page"><p className="muted">Loading...</p></div>;
  if (!client) return <div className="page"><p className="alert error">PT client not found</p></div>;

  return (
    <div className="page">
      <div className="card-title-row">
        <h2>{client.client_name}</h2>
        <Link to={`/pt/trainers/${client.trainer_id}`} className="btn small">Trainer</Link>
      </div>
      <p className="hint">
        {client.trainer_name} · {client.plan_label} · {client.pt_goal_label}
      </p>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="card">
          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-label">Start</span>
              <strong className="stat-value">{formatDateDMY(client.start_date)}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">End</span>
              <strong className="stat-value">{formatDateDMY(client.current_end_date)}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Sessions</span>
              <strong className="stat-value">
                {client.completed_sessions}
                {client.session_target ? ` / ${client.session_target}` : ''}
              </strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Freeze Days</span>
              <strong className="stat-value">{client.freeze_days || 0}</strong>
            </div>
          </div>

          <div className="daily-total" style={{ marginTop: 16 }}>
            <div className="total-row"><span>Status</span><strong>{client.status}</strong></div>
            <div className="total-row"><span>Total Amount</span><strong>{formatCurrency(client.total_amount)}</strong></div>
            <div className="total-row"><span>Paid</span><strong>{formatCurrency(client.amount_paid)}</strong></div>
            <div className="total-row"><span>Due</span><strong>{formatCurrency(client.amount_due)}</strong></div>
          </div>

          {client.notes && <p className="remarks" style={{ marginTop: 12 }}>{client.notes}</p>}

          {client.status !== 'COMPLETED' ? (
            <button type="button" className="btn primary" onClick={handleComplete} disabled={saving}>
              Mark PT Complete
            </button>
          ) : (
            <button type="button" className="btn" onClick={handleUndoComplete} disabled={saving}>
              Undo Complete
            </button>
          )}
        </div>
      )}

      {tab === 'sessions' && (
        <div className="card">
          <div className="card-title-row">
            <h3>Session Calendar</h3>
            {client.status === 'COMPLETED' && (
              <button type="button" className="btn small" onClick={handleUndoComplete} disabled={saving}>
                Undo Complete
              </button>
            )}
          </div>
          <p className="hint">
            {formatDateDMY(client.start_date)} to {formatDateDMY(client.current_end_date)}
            {saving && ' · Saving...'}
          </p>
          <PTSessionCalendar
            startDate={client.start_date}
            endDate={client.current_end_date}
            sessions={client.sessions || []}
            freezes={client.freezes || []}
            planType={client.plan_type}
            sessionTarget={client.session_target}
            disabled={client.status === 'COMPLETED'}
            saving={saving}
            onToggle={handleToggleSession}
          />
          {client.status === 'COMPLETED' && (
            <p className="hint" style={{ marginTop: 12 }}>
              Sessions are locked while PT is completed. Use <strong>Undo Complete</strong> on the Overview tab to edit again.
            </p>
          )}
        </div>
      )}

      {tab === 'freeze' && (
        <div className="card">
          <h3>Freeze PT</h3>
          <form className="form" onSubmit={handleAddFreeze}>
            <label>Freeze From *
              <input
                type="date"
                value={freezeForm.freeze_from}
                onChange={(e) => setFreezeForm((f) => ({ ...f, freeze_from: e.target.value }))}
                required
              />
            </label>
            <label>Freeze To *
              <input
                type="date"
                value={freezeForm.freeze_to}
                onChange={(e) => setFreezeForm((f) => ({ ...f, freeze_to: e.target.value }))}
                required
              />
            </label>
            <label>Reason *
              <select
                value={freezeForm.reason}
                onChange={(e) => setFreezeForm((f) => ({ ...f, reason: e.target.value }))}
              >
                {PT_FREEZE_REASON_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </label>
            <label>Notes
              <input
                value={freezeForm.notes}
                onChange={(e) => setFreezeForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional"
              />
            </label>
            <p className="hint">This freeze adds <strong>{freezeDaysPlanned}</strong> day(s) to the PT end date.</p>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? 'Saving...' : 'Add Freeze'}
            </button>
          </form>

          {!client.freezes?.length ? (
            <p className="muted">No freeze records yet.</p>
          ) : (
            <div className="booking-list" style={{ marginTop: 12 }}>
              {client.freezes.map((freeze) => (
                <div key={freeze.id} className="booking-card">
                  <div className="card-top">
                    <strong>{formatDateDMY(freeze.freeze_from)} to {formatDateDMY(freeze.freeze_to)}</strong>
                    <span className="badge pending">{freeze.days_count} days</span>
                  </div>
                  <div className="card-meta">
                    <span>{freeze.reason}</span>
                  </div>
                  {freeze.notes && <p className="remarks">{freeze.notes}</p>}
                  <div className="card-actions">
                    <button type="button" className="btn small danger" onClick={() => handleDeleteFreeze(freeze.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'payment' && (
        <div className="card">
          <form className="form" onSubmit={handleSavePayment}>
            <label>Total Amount
              <input
                type="number"
                value={paymentForm.total_amount}
                onChange={(e) => setPayment('total_amount', e.target.value)}
                min="0"
              />
            </label>
            <PaymentSection title="Advance Paid" className="advance" gpayField="advance_gpay" cashField="advance_cash" dateField="advance_date" form={paymentForm} set={setPayment} />
            <PaymentSection title="Balance Paid" className="balance" gpayField="balance_gpay" cashField="balance_cash" dateField="balance_date" form={paymentForm} set={setPayment} />
            <label>Notes
              <textarea value={paymentForm.notes} onChange={(e) => setPayment('notes', e.target.value)} rows={2} />
            </label>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Payment Details'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
