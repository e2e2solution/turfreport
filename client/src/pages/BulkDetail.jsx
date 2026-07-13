import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { TabBar, PaymentSection } from '../components/BookingForm';
import TimeSlotPicker from '../components/TimeSlotPicker';
import {
  fetchBulkPackage, updateBulkPackage, deleteBulkPackage,
  addBulkSession, deleteBulkSession, updateBulkSession,
  reopenBulkPackage, closeBulkPackage,
  formatDateDMY, formatCurrency, todayISO,
} from '../api';

const DETAIL_TABS = [
  { id: 'matches', label: 'Matches' },
  { id: 'hours', label: 'Hours' },
  { id: 'payment', label: 'Payment' },
];

export default function BulkDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('matches');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [sessionForm, setSessionForm] = useState({
    session_date: todayISO(), time_slot: '', remarks: '',
  });
  const [payForm, setPayForm] = useState({
    total_amount: '', advance_gpay: '', advance_cash: '', advance_date: '',
    balance_gpay: '', balance_cash: '', balance_date: '',
  });
  const [saving, setSaving] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editSessionForm, setEditSessionForm] = useState({
    session_date: '', time_slot: '', remarks: '',
  });

  const load = () => {
    setLoading(true);
    fetchBulkPackage(id)
      .then((pkg) => {
        setData(pkg);
        setPayForm({
          total_amount: pkg.total_amount || '',
          advance_gpay: pkg.advance_gpay || '',
          advance_cash: pkg.advance_cash || '',
          advance_date: pkg.advance_date || '',
          balance_gpay: pkg.balance_gpay || '',
          balance_cash: pkg.balance_cash || '',
          balance_date: pkg.balance_date || '',
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const setSession = (field, value) => setSessionForm((f) => ({ ...f, [field]: value }));
  const setPay = (field, value) => setPayForm((f) => ({ ...f, [field]: value }));

  const handleAddSession = async (e) => {
    e.preventDefault();
    if (!sessionForm.time_slot) return alert('Select time slot');
    setSaving(true);
    try {
      await addBulkSession(id, sessionForm);
      setSessionForm({ session_date: todayISO(), time_slot: '', remarks: '' });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSession = async (sessionId) => {
    if (!confirm('Remove this session?')) return;
    await deleteBulkSession(sessionId);
    load();
  };

  const startEditSession = (s) => {
    setEditingSessionId(s.id);
    setEditSessionForm({
      session_date: s.session_date,
      time_slot: s.time_slot,
      remarks: s.remarks || '',
    });
  };

  const handleSaveSessionEdit = async (e) => {
    e.preventDefault();
    if (!editSessionForm.time_slot) return alert('Select time slot');
    setSaving(true);
    try {
      await updateBulkSession(editingSessionId, editSessionForm);
      setEditingSessionId(null);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async (e) => {
    e.preventDefault();
    if (!confirm('Close this bulk package and record payment?')) return;
    setSaving(true);
    try {
      await closeBulkPackage(id, payForm);
      load();
      setTab('payment');
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReopen = async () => {
    if (!confirm('Reopen this bulk to add more sessions? You can edit payment on the Payment tab.')) return;
    setSaving(true);
    try {
      await reopenBulkPackage(id);
      load();
      setTab('matches');
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCloseAgain = async (e) => {
    e?.preventDefault?.();
    if (!confirm('Close this bulk again? Payment changes will be saved.')) return;
    setSaving(true);
    try {
      await closeBulkPackage(id, payForm);
      load();
      setTab('payment');
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
      await updateBulkPackage(id, payForm);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this bulk package and all sessions?')) return;
    await deleteBulkPackage(id);
    navigate('/bulk');
  };

  if (loading) return <div className="page"><p className="muted">Loading...</p></div>;
  if (error || !data) return <div className="page"><p className="alert error">{error || 'Not found'}</p></div>;

  const isPending = data.status === 'PENDING';
  const isClosed = data.status === 'CLOSED';
  const hasPayment = (data.advance_gpay || 0) + (data.advance_cash || 0)
    + (data.balance_gpay || 0) + (data.balance_cash || 0) > 0;
  const hoursLeft = Math.max(0, (data.total_hours || 0) - (data.used_hours || 0));

  return (
    <div className="page">
      <div className="card-title-row">
        <h2>Bulk #{data.id} — {data.name}</h2>
        <span className={`badge ${data.status.toLowerCase()}`}>{data.status}</span>
      </div>
      <p className="hint">{data.category}{data.sport ? ` · ${data.sport}` : ''} · {data.remarks || 'bulk'}</p>

      <TabBar tabs={DETAIL_TABS} active={tab} onChange={setTab} />

      {tab === 'matches' && (
        <div className="card">
          <h3>Sessions ({data.sessions?.length || 0})</h3>
          {isPending && hasPayment && (
            <p className="hint">Bulk reopened — add today&apos;s session, then use <strong>Close Again</strong> on Payment tab.</p>
          )}
          {isPending && (
            <form className="form" onSubmit={handleAddSession}>
              <label>Date<input type="date" value={sessionForm.session_date} onChange={(e) => setSession('session_date', e.target.value)} /></label>
              <TimeSlotPicker value={sessionForm.time_slot} onChange={(v) => setSession('time_slot', v)} />
              <label>Remarks<input value={sessionForm.remarks} onChange={(e) => setSession('remarks', e.target.value)} placeholder="Optional" /></label>
              <button type="submit" className="btn primary" disabled={saving}>Add Session</button>
            </form>
          )}
          {!data.sessions?.length ? (
            <p className="muted">No sessions yet. Add from here or from Report page.</p>
          ) : (
            <div className="booking-list" style={{ marginTop: 12 }}>
              {data.sessions.map((s) => (
                <div key={s.id} className="booking-card bulk-session-card">
                  {editingSessionId === s.id ? (
                    <form className="form" onSubmit={handleSaveSessionEdit}>
                      <label>Date<input type="date" value={editSessionForm.session_date} onChange={(e) => setEditSessionForm((f) => ({ ...f, session_date: e.target.value }))} /></label>
                      <TimeSlotPicker value={editSessionForm.time_slot} onChange={(v) => setEditSessionForm((f) => ({ ...f, time_slot: v }))} />
                      <label>Remarks<input value={editSessionForm.remarks} onChange={(e) => setEditSessionForm((f) => ({ ...f, remarks: e.target.value }))} placeholder="Optional" /></label>
                      <div className="card-actions">
                        <button type="submit" className="btn small primary" disabled={saving}>Save</button>
                        <button type="button" className="btn small" onClick={() => setEditingSessionId(null)}>Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="card-top">
                        <strong>{formatDateDMY(s.session_date)}</strong>
                        <span>{s.hours}h</span>
                      </div>
                      <div className="card-meta"><span>{s.time_slot}</span></div>
                      {s.remarks && <p className="remarks">{s.remarks}</p>}
                      {isPending && (
                        <div className="card-actions">
                          <button type="button" className="btn small" onClick={() => startEditSession(s)}>Edit</button>
                          <button type="button" className="btn small danger" onClick={() => handleDeleteSession(s.id)}>Remove</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'hours' && (
        <div className="card">
          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-label">Package Hours</span>
              <strong className="stat-value">{data.total_hours}h</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Used</span>
              <strong className="stat-value">{data.used_hours || 0}h</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Remaining</span>
              <strong className="stat-value">{hoursLeft}h</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Sessions</span>
              <strong className="stat-value">{data.sessions?.length || 0}</strong>
            </div>
          </div>
        </div>
      )}

      {tab === 'payment' && (
        <div className="card">
          {isPending && !hasPayment ? (
            <form className="form" onSubmit={handleClose}>
              <p className="hint">Enter payment and close this bulk package. Payment will appear in payment reports.</p>
              <label>Total Amount *
                <input type="number" value={payForm.total_amount} onChange={(e) => setPay('total_amount', e.target.value)} required min="0" />
              </label>
              <PaymentSection title="Advance Paid" className="advance" gpayField="advance_gpay" cashField="advance_cash" dateField="advance_date" form={payForm} set={setPay} />
              <PaymentSection title="Balance Paid" className="balance" gpayField="balance_gpay" cashField="balance_cash" dateField="balance_date" form={payForm} set={setPay} />
              <button type="submit" className="btn primary" disabled={saving}>
                {saving ? 'Closing...' : 'Close & Record Payment'}
              </button>
            </form>
          ) : isPending && hasPayment ? (
            <form className="form" onSubmit={handleCloseAgain}>
              <p className="hint">
                Bulk reopened — you can edit payment below. Add sessions in Matches tab, then close again when done.
              </p>
              <label>Total Amount *
                <input type="number" value={payForm.total_amount} onChange={(e) => setPay('total_amount', e.target.value)} required min="0" />
              </label>
              <PaymentSection title="Advance Paid" className="advance" gpayField="advance_gpay" cashField="advance_cash" dateField="advance_date" form={payForm} set={setPay} />
              <PaymentSection title="Balance Paid" className="balance" gpayField="balance_gpay" cashField="balance_cash" dateField="balance_date" form={payForm} set={setPay} />
              <div className="card-actions" style={{ marginTop: 12 }}>
                <button type="button" className="btn" disabled={saving} onClick={handleSavePayment}>
                  {saving ? 'Saving...' : 'Save Payment'}
                </button>
                <button type="submit" className="btn primary" disabled={saving}>
                  {saving ? 'Closing...' : 'Close Again'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="daily-total" style={{ color: 'inherit' }}>
                <div className="total-row"><span>Total</span><strong>{formatCurrency(data.total_amount)}</strong></div>
                <div className="total-row"><span>Advance GPay</span><strong>{formatCurrency(data.advance_gpay)}</strong></div>
                <div className="total-row"><span>Advance Cash</span><strong>{formatCurrency(data.advance_cash)}</strong></div>
                <div className="total-row"><span>Advance Date</span><strong>{formatDateDMY(data.advance_date)}</strong></div>
                <div className="total-row"><span>Balance GPay</span><strong>{formatCurrency(data.balance_gpay)}</strong></div>
                <div className="total-row"><span>Balance Cash</span><strong>{formatCurrency(data.balance_cash)}</strong></div>
                <div className="total-row"><span>Balance Date</span><strong>{formatDateDMY(data.balance_date)}</strong></div>
              </div>
              {isClosed && (
                <button type="button" className="btn primary" disabled={saving} onClick={handleReopen} style={{ marginTop: 12 }}>
                  {saving ? 'Reopening...' : 'Reopen for More Sessions'}
                </button>
              )}
            </>
          )}
        </div>
      )}

      <div className="card-actions" style={{ marginTop: 16 }}>
        <Link to="/bulk" className="btn small">Back to List</Link>
        {isClosed && (
          <button type="button" className="btn small primary" disabled={saving} onClick={handleReopen}>
            Reopen
          </button>
        )}
        {isPending && hasPayment && (
          <button type="button" className="btn small primary" disabled={saving} onClick={handleCloseAgain}>
            Close Again
          </button>
        )}
        {isPending && !hasPayment && (
          <button type="button" className="btn small danger" onClick={handleDelete}>Delete Package</button>
        )}
      </div>
    </div>
  );
}
