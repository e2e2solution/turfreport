import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { createPtClient, fetchPtTrainer, formatCurrency, todayISO } from '../api';
import { calcPtEndDate, PT_GOAL_OPTIONS, PT_PLAN_OPTIONS, ptStatusLabel } from '../utils/pt';
import { PaymentSection } from '../components/BookingForm';

function emptyClientForm() {
  return {
    client_name: '',
    pt_goal: PT_GOAL_OPTIONS[0].value,
    plan_type: PT_PLAN_OPTIONS[0].value,
    start_date: todayISO(),
    total_amount: '',
    advance_gpay: '',
    advance_cash: '',
    advance_date: '',
    balance_gpay: '',
    balance_cash: '',
    balance_date: '',
    notes: '',
  };
}

export default function PTTrainerDetail() {
  const { id } = useParams();
  const [trainer, setTrainer] = useState(null);
  const [form, setForm] = useState(emptyClientForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetchPtTrainer(id)
      .then(setTrainer)
      .catch((err) => alert(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const computedEndDate = useMemo(
    () => calcPtEndDate(form.start_date, form.plan_type),
    [form.start_date],
  );

  const handleCreateClient = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, trainer_id: Number(id) };
      await createPtClient(payload);
      setForm(emptyClientForm());
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="page"><p className="muted">Loading...</p></div>;
  if (!trainer) return <div className="page"><p className="alert error">Trainer not found</p></div>;

  return (
    <div className="page">
      <div className="card-title-row">
        <h2>{trainer.name}</h2>
        <Link to="/pt" className="btn small">Back</Link>
      </div>
      <p className="hint">
        {trainer.phone ? `${trainer.phone} · ` : ''}
        {trainer.specializations || 'No specialization added'}
      </p>

      <div className="card">
        <h3>Add PT Client</h3>
        <form className="form" onSubmit={handleCreateClient}>
          <label>Client Name *
            <input value={form.client_name} onChange={(e) => set('client_name', e.target.value)} required />
          </label>
          <label>PT Goal *
            <select value={form.pt_goal} onChange={(e) => set('pt_goal', e.target.value)}>
              {PT_GOAL_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </label>
          <label>PT Plan *
            <select value={form.plan_type} onChange={(e) => set('plan_type', e.target.value)}>
              {PT_PLAN_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </label>
          <label>Start Date *
            <input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} required />
          </label>
          <label>End Date (start + 45 days)
            <input type="date" value={computedEndDate} readOnly className="readonly" />
          </label>
          <label>Total Amount
            <input type="number" value={form.total_amount} onChange={(e) => set('total_amount', e.target.value)} min="0" />
          </label>
          <PaymentSection title="Advance Paid" className="advance" gpayField="advance_gpay" cashField="advance_cash" dateField="advance_date" form={form} set={set} />
          <PaymentSection title="Balance Paid" className="balance" gpayField="balance_gpay" cashField="balance_cash" dateField="balance_date" form={form} set={set} />
          <label>Notes
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
          </label>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving...' : 'Create PT Client'}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-title-row">
          <h3>Clients ({trainer.clients?.length || 0})</h3>
        </div>
        {!trainer.clients?.length ? (
          <p className="muted">No PT clients under this trainer yet.</p>
        ) : (
          <div className="booking-list">
            {trainer.clients.map((client) => (
              <Link key={client.id} to={`/pt/clients/${client.id}`} className={`booking-card status-${client.status.toLowerCase()}`}>
                <div className="card-top">
                  <strong>{client.client_name}</strong>
                  <span className={`badge ${client.status === 'READY_FOR_PAYMENT' ? 'closed' : 'pending'}`}>
                    {client.status_label || ptStatusLabel(client.status)}
                  </span>
                </div>
                <div className="card-meta">
                  <span>{client.plan_label}</span>
                  <span>{client.pt_goal_label}</span>
                  <span>Ends {client.current_end_date}</span>
                </div>
                <div className="card-amounts">
                  <span>Total {formatCurrency(client.total_amount)}</span>
                  <span>Due {formatCurrency(client.amount_due)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
