import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPtTrainer, deletePtClient, fetchPtClients, fetchPtTrainers, formatCurrency, undoPtComplete } from '../api';
import PtDraftInbox from '../components/PtDraftInbox';
import { ptStatusLabel } from '../utils/pt';

const emptyTrainer = {
  name: '',
  phone: '',
  specializations: '',
};

export default function PTDashboard() {
  const [trainers, setTrainers] = useState([]);
  const [clients, setClients] = useState([]);
  const [trainerId, setTrainerId] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [form, setForm] = useState(emptyTrainer);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [undoingId, setUndoingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = () => {
    setLoading(true);
    const clientParams = {};
    if (status) clientParams.status = status;
    if (trainerId) clientParams.trainer_id = trainerId;

    Promise.all([
      fetchPtTrainers(),
      fetchPtClients(clientParams),
    ])
      .then(([trainerRows, clientRows]) => {
        setTrainers(trainerRows);
        setClients(clientRows);
      })
      .catch((err) => alert(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [status, trainerId, refreshKey]);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleCreateTrainer = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createPtTrainer(form);
      setForm(emptyTrainer);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUndoReadyForPayment = async (clientId, clientName) => {
    if (!confirm(`Move ${clientName} back to ongoing PT?`)) return;
    setUndoingId(clientId);
    try {
      await undoPtComplete(clientId);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setUndoingId(null);
    }
  };

  const handleDeleteClient = async (clientId, clientName) => {
    if (!confirm(`Delete ${clientName}? All sessions and freeze records will be removed.`)) return;
    setDeletingId(clientId);
    try {
      await deletePtClient(clientId);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const ongoingCount = clients.filter((c) => c.status === 'ACTIVE').length;
  const readyCount = clients.filter((c) => c.status === 'READY_FOR_PAYMENT').length;
  const selectedTrainer = trainers.find((t) => String(t.id) === trainerId);

  return (
    <div className="page">
      <div className="card-title-row">
        <h2>Personal Training</h2>
        <Link to="/pt/report" className="btn small primary">PT Report</Link>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Trainers</span>
          <strong className="stat-value">{trainers.length}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Clients Shown</span>
          <strong className="stat-value">{clients.length}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Ongoing</span>
          <strong className="stat-value">{ongoingCount}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Ready for Payment</span>
          <strong className="stat-value">{readyCount}</strong>
        </div>
      </div>

      <PtDraftInbox onConfirmed={() => setRefreshKey((k) => k + 1)} />

      <div className="card pt-client-panel">
        <div className="pt-client-filters">
          <label>
            Trainer
            <select value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
              <option value="">All trainers</option>
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="ACTIVE">Ongoing</option>
              <option value="READY_FOR_PAYMENT">Ready for Payment</option>
            </select>
          </label>
        </div>

        <h3>
          {selectedTrainer ? `${selectedTrainer.name} — Clients` : 'All PT Clients'}
        </h3>

        {loading ? (
          <p className="muted">Loading...</p>
        ) : !clients.length ? (
          <p className="muted">No PT clients found for this filter.</p>
        ) : (
          <div className="pt-client-table-wrap">
            <table className="pt-client-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Sessions done</th>
                  <th>Remaining</th>
                  <th>Payment due</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td>
                      <Link to={`/pt/clients/${client.id}`} className="pt-client-link">
                        <strong>{client.client_name}</strong>
                        <small>
                          {client.plan_label} · {client.trainer_name}
                          {status === '' && ` · ${client.status_label || ptStatusLabel(client.status)}`}
                        </small>
                      </Link>
                    </td>
                    <td>
                      {client.session_target != null
                        ? `${client.completed_sessions} / ${client.session_target}`
                        : client.completed_sessions}
                    </td>
                    <td>
                      {client.sessions_remaining != null ? client.sessions_remaining : '—'}
                    </td>
                    <td className={client.amount_due > 0 ? 'pt-due-amount' : ''}>
                      {formatCurrency(client.amount_due)}
                    </td>
                    <td className="pt-client-actions">
                      {client.status === 'READY_FOR_PAYMENT' && (
                        <button
                          type="button"
                          className="btn small"
                          disabled={undoingId === client.id || deletingId === client.id}
                          onClick={() => handleUndoReadyForPayment(client.id, client.client_name)}
                        >
                          {undoingId === client.id ? '...' : 'Undo'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn small danger"
                        disabled={deletingId === client.id || undoingId === client.id}
                        onClick={() => handleDeleteClient(client.id, client.client_name)}
                      >
                        {deletingId === client.id ? '...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Add Trainer</h3>
        <form className="form" onSubmit={handleCreateTrainer}>
          <label>Trainer Name *
            <input value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </label>
          <label>Phone
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </label>
          <label>Specializations
            <input
              value={form.specializations}
              onChange={(e) => set('specializations', e.target.value)}
              placeholder="Strength, rehab, calisthenics..."
            />
          </label>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving...' : 'Create Trainer'}
          </button>
        </form>
      </div>

      <div className="card-title-row">
        <h3>Trainers</h3>
      </div>
      {!trainers.length ? (
        <p className="muted">No trainers yet.</p>
      ) : (
        <div className="booking-list">
          {trainers.map((trainer) => (
            <Link key={trainer.id} to={`/pt/trainers/${trainer.id}`} className="booking-card">
              <div className="card-top">
                <strong>{trainer.name}</strong>
                <span className="badge pending">{trainer.client_count || 0} clients</span>
              </div>
              <div className="card-meta">
                {trainer.phone && <span>{trainer.phone}</span>}
                {trainer.specializations && <span>{trainer.specializations}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
