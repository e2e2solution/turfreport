import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchGymPendingReport, formatCurrency, formatDateDMY, todayISO } from '../api';
import { planLabel } from '../utils/dates';
import { ImageActionButtons } from '../components/ImageActionButtons';
import {
  captureElementAsBlob,
  downloadElementImage,
  shareImageBlob,
  waitForPaint,
} from '../utils/captureImage';

function currentMonthISO() {
  return todayISO().slice(0, 7);
}

function StatCard({ label, value, sub }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

export default function GymPendingReport() {
  const imageRef = useRef(null);
  const [month, setMonth] = useState(currentMonthISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [imageBusy, setImageBusy] = useState(false);

  useEffect(() => {
    if (!month) return;
    setLoading(true);
    setError('');
    fetchGymPendingReport(month)
      .then(setData)
      .catch((err) => {
        setError(err.message);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [month]);

  const filename = `gym-pending-${month}.png`;

  const handleDownloadImage = async () => {
    if (!imageRef.current) return;
    setImageBusy(true);
    try {
      await waitForPaint(200);
      await downloadElementImage(imageRef.current, filename);
    } catch (err) {
      alert(err.message);
    } finally {
      setImageBusy(false);
    }
  };

  const handleShareImage = async () => {
    if (!imageRef.current) return;
    setImageBusy(true);
    try {
      await waitForPaint(200);
      const blob = await captureElementAsBlob(imageRef.current);
      shareImageBlob(blob, filename, 'Gym Pending Report');
    } catch (err) {
      alert(err.message);
    } finally {
      setImageBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="card-title-row">
        <h2>Gym Pending Report</h2>
        <Link to="/monthly-hub" className="btn small">Monthly Hours &amp; Revenue</Link>
      </div>
      <p className="hint">
        Pick a month → see who still has <strong>money due</strong> (plan started that month).
        Use <strong>Download Image</strong> to save / WhatsApp the list.
      </p>

      <div className="card">
        <div className="card-title-row">
          <label>
            Month
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          <ImageActionButtons
            small
            disabled={imageBusy || !data}
            onDownload={handleDownloadImage}
            onWhatsApp={handleShareImage}
          />
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading && <p className="muted">Loading...</p>}

      {data && !loading && (
        <div className="card gym-pending-card" ref={imageRef}>
          <div className="cafe-mom-image-header">
            <h3>Gym money still due — {data.label}</h3>
            <p className="hint">
              Start date {data.range?.from} to {data.range?.to}
              {' · '}Due = (Total + PT) − Paid
            </p>
          </div>

          <div className="stat-grid">
            <StatCard label="People still owing" value={data.totals.count} />
            <StatCard label="Members" value={data.totals.members} />
            <StatCard label="Already paid" value={formatCurrency(data.totals.paid)} />
            <StatCard label="Still to collect" value={formatCurrency(data.totals.due)} />
          </div>

          {!data.rows.length ? (
            <p className="muted">Nobody owes money for gym starts in this month.</p>
          ) : (
            <div className="table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Plan</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Plan total</th>
                    <th>PT</th>
                    <th>Paid</th>
                    <th>Still due</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, idx) => (
                    <tr key={r.id} className="bulk-pending-row">
                      <td>{idx + 1}</td>
                      <td>{r.name}</td>
                      <td>{planLabel(r.plan_months)}</td>
                      <td>{formatDateDMY(r.start_date)}</td>
                      <td>{formatDateDMY(r.end_date)}</td>
                      <td>{formatCurrency(r.total)}</td>
                      <td>{r.personal_training_amount ? formatCurrency(r.personal_training_amount) : '—'}</td>
                      <td>{formatCurrency(r.paid)}</td>
                      <td><strong>{formatCurrency(r.due)}</strong></td>
                      <td><span className={`badge ${String(r.status || '').toLowerCase()}`}>{r.status}</span></td>
                    </tr>
                  ))}
                  <tr className="monthly-hub-total-row">
                    <td colSpan={5}><strong>Total to collect</strong></td>
                    <td><strong>{formatCurrency(data.totals.total)}</strong></td>
                    <td><strong>{formatCurrency(data.totals.pt)}</strong></td>
                    <td><strong>{formatCurrency(data.totals.paid)}</strong></td>
                    <td><strong>{formatCurrency(data.totals.due)}</strong></td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <p className="hint" style={{ marginTop: 12 }}>
            Example: Plan ₹12,000 + PT ₹11,998 − Paid ₹12,000 = <strong>Due ₹11,998</strong> (PT not fully paid yet).
            Fully paid people (Due ₹0) are hidden from this list.
          </p>
        </div>
      )}
    </div>
  );
}
