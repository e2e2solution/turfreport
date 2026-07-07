import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPtReport, formatCurrency, formatDateDMY, todayISO } from '../api';

export default function PTReport() {
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchPtReport({ date })
      .then(setData)
      .catch((err) => alert(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [date]);

  return (
    <div className="page">
      <div className="card-title-row">
        <h2>PT Report</h2>
        <Link to="/pt" className="btn small">Back</Link>
      </div>

      <div className="card">
        <label className="inline-label">
          Report Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : !data ? (
        <p className="muted">No PT report data.</p>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-label">Clients</span>
              <strong className="stat-value">{data.summary.total_clients}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Active</span>
              <strong className="stat-value">{data.summary.active_clients}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Ready for Payment</span>
              <strong className="stat-value">{data.summary.ready_for_payment_clients}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Sessions Today</span>
              <strong className="stat-value">{data.summary.sessions_completed_today}</strong>
            </div>
          </div>

          <div className="card">
            <h3>Sessions Completed on {formatDateDMY(date)}</h3>
            {!data.sessions.length ? (
              <p className="muted">No PT sessions completed on this date.</p>
            ) : (
              <div className="booking-list">
                {data.sessions.map((session) => (
                  <div key={session.id} className="booking-card">
                    <div className="card-top">
                      <strong>{session.client_name}</strong>
                      <span className="badge closed">{session.plan_label}</span>
                    </div>
                    <div className="card-meta">
                      <span>{session.trainer_name}</span>
                      <span>{session.pt_goal_label}</span>
                    </div>
                    {session.notes && <p className="remarks">{session.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3>All PT Clients</h3>
            {!data.clients.length ? (
              <p className="muted">No PT clients added yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Trainer</th>
                      <th>Plan</th>
                      <th>Goal</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Sessions</th>
                      <th>Status</th>
                      <th>Paid</th>
                      <th>Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.clients.map((client) => (
                      <tr key={client.id}>
                        <td>{client.client_name}</td>
                        <td>{client.trainer_name}</td>
                        <td>{client.plan_label}</td>
                        <td>{client.pt_goal_label}</td>
                        <td>{formatDateDMY(client.start_date)}</td>
                        <td>{formatDateDMY(client.current_end_date)}</td>
                        <td>
                          {client.completed_sessions}
                          {client.session_target ? ` / ${client.session_target}` : ''}
                        </td>
                        <td>{client.status}</td>
                        <td>{formatCurrency(client.amount_paid)}</td>
                        <td>{formatCurrency(client.amount_due)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
