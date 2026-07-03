import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPtTrainer, fetchPtClients, fetchPtTrainers, formatCurrency } from '../api';

const emptyTrainer = {
  name: '',
  phone: '',
  specializations: '',
};

export default function PTDashboard() {
  const [trainers, setTrainers] = useState([]);
  const [clients, setClients] = useState([]);
  const [status, setStatus] = useState('ACTIVE');
  const [form, setForm] = useState(emptyTrainer);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetchPtTrainers(),
      fetchPtClients(status ? { status } : {}),
    ])
      .then(([trainerRows, clientRows]) => {
        setTrainers(trainerRows);
        setClients(clientRows);
      })
      .catch((err) => alert(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [status]);

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

  const activeCount = clients.filter((c) => c.status === 'ACTIVE').length;
  const completedCount = clients.filter((c) => c.status === 'COMPLETED').length;

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
          <span className="stat-label">Clients Loaded</span>
          <strong className="stat-value">{clients.length}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Active</span>
          <strong className="stat-value">{activeCount}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Completed</span>
          <strong className="stat-value">{completedCount}</strong>
        </div>
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
      {loading ? (
        <p className="muted">Loading...</p>
      ) : !trainers.length ? (
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

      <div className="card">
        <div className="card-title-row">
          <h3>PT Clients</h3>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </label>
        </div>
        {!clients.length ? (
          <p className="muted">No PT clients found for this filter.</p>
        ) : (
          <div className="booking-list">
            {clients.map((client) => (
              <Link key={client.id} to={`/pt/clients/${client.id}`} className={`booking-card status-${client.status.toLowerCase()}`}>
                <div className="card-top">
                  <strong>{client.client_name}</strong>
                  <span className={`badge ${client.status === 'COMPLETED' ? 'closed' : 'pending'}`}>{client.status}</span>
                </div>
                <div className="card-meta">
                  <span>{client.trainer_name}</span>
                  <span>{client.plan_label}</span>
                  <span>{client.pt_goal_label}</span>
                </div>
                <div className="card-meta">
                  <span>Ends {client.current_end_date}</span>
                  <span>
                    Sessions {client.completed_sessions}
                    {client.session_target ? ` / ${client.session_target}` : ''}
                  </span>
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
