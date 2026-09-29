import { useEffect, useRef, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { fetchMonthlyHub, formatCurrency, todayISO } from '../api';
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

export default function MonthlyHubReport() {
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
    fetchMonthlyHub(month)
      .then(setData)
      .catch((err) => {
        setError(err.message);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [month]);

  const filename = `monthly-hub-${month}.png`;

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
      shareImageBlob(blob, filename, 'Monthly Hours & Revenue');
    } catch (err) {
      alert(err.message);
    } finally {
      setImageBusy(false);
    }
  };

  const hourChart = (data?.channels || [])
    .filter((c) => c.hours != null)
    .map((c) => ({ name: c.label, hours: c.hours, revenue: c.revenue }));

  const revenueChart = (data?.channels || []).map((c) => ({
    name: c.label,
    revenue: c.revenue,
  }));

  return (
    <div className="page">
      <h2>Monthly Hours &amp; Revenue</h2>
      <p className="hint">
        Cricket, football, badminton, online hours and gym admissions — with revenue received each month.
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
        <div className="card monthly-hub-card" ref={imageRef}>
          <div className="cafe-mom-image-header">
            <h3>Vathiyayath Sports Hub — {data.label}</h3>
            <p className="hint">{data.range?.from} to {data.range?.to}</p>
          </div>

          <div className="stat-grid">
            {data.channels.map((c) => (
              <StatCard
                key={c.key}
                label={c.label}
                value={c.kind === 'gym' ? formatCurrency(c.revenue) : `${c.hours} hrs`}
                sub={
                  c.kind === 'gym'
                    ? `${c.admissions || 0} admissions`
                    : formatCurrency(c.revenue)
                }
              />
            ))}
            <StatCard
              label="Grand Total"
              value={formatCurrency(data.totals.revenue)}
              sub={`${data.totals.hours} play hrs · gym ${data.totals.admissions || 0} admissions`}
            />
          </div>

          <div className="table-wrap">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Hours</th>
                  <th>Matches / Admissions</th>
                  <th>Revenue (received)</th>
                </tr>
              </thead>
              <tbody>
                {data.channels.map((c) => (
                  <tr key={c.key}>
                    <td><strong>{c.label}</strong></td>
                    <td>
                      {c.kind === 'gym' ? '—' : `${c.hours} hrs`}
                    </td>
                    <td>
                      {c.kind === 'gym'
                        ? `${c.admissions || 0} admissions`
                        : c.bookings}
                    </td>
                    <td>{formatCurrency(c.revenue)}</td>
                  </tr>
                ))}
                <tr className="monthly-hub-total-row">
                  <td><strong>Total</strong></td>
                  <td>
                    <strong>{data.totals.hours} hrs</strong>
                    <span className="hint"> (turf + online only)</span>
                  </td>
                  <td>
                    <strong>{data.totals.bookings}</strong>
                    <span className="hint">
                      {' '}matches · gym {data.totals.admissions || 0} admissions
                    </span>
                  </td>
                  <td><strong>{formatCurrency(data.totals.revenue)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          {hourChart.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h4>Hours by channel</h4>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={hourChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="hours" name="Hours" fill="#4472c4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div style={{ marginTop: 8 }}>
            <h4>Revenue by channel</h4>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={revenueChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Legend />
                <Bar dataKey="revenue" name="Revenue" fill="#92d050" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <p className="hint" style={{ marginTop: 12 }}>{data.note}</p>
        </div>
      )}
    </div>
  );
}
