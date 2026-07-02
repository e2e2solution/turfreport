import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { TabBar } from '../components/BookingForm';
import { fetchSummary, todayISO, formatCurrency } from '../api';
import { downloadTurfSummaryImage, downloadGymSummaryImage, shareTurfSummaryImage, shareGymSummaryImage } from '../utils/summaryImage';
import { ImageActionButtons } from '../components/ImageActionButtons';

const PERIODS = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

const SPORT_COLORS = { cricket: '#4472c4', football: '#92d050', badminton: '#f4b084' };

function StatCard({ label, value, sub }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

export default function Summary() {
  const [period, setPeriod] = useState('weekly');
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError('');
    fetchSummary(period, date)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [period, date]);

  const handleDownloadTurfImage = async () => {
    if (!data) return;
    setDownloading(true);
    try {
      await downloadTurfSummaryImage(data, period, date);
    } catch (err) {
      alert(err.message);
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadGymImage = async () => {
    if (!data) return;
    setDownloading(true);
    try {
      await downloadGymSummaryImage(data, period, date);
    } catch (err) {
      alert(err.message);
    } finally {
      setDownloading(false);
    }
  };

  const handleShareTurfImage = async () => {
    if (!data) return;
    setDownloading(true);
    try {
      await shareTurfSummaryImage(data, period, date);
    } catch (err) {
      alert(err.message);
    } finally {
      setDownloading(false);
    }
  };

  const handleShareGymImage = async () => {
    if (!data) return;
    setDownloading(true);
    try {
      await shareGymSummaryImage(data, period, date);
    } catch (err) {
      alert(err.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="page">
      <h2>Summary</h2>

      <TabBar tabs={PERIODS} active={period} onChange={setPeriod} />

      <div className="filter-bar">
        <label>
          {period === 'daily' ? 'Date' : period === 'weekly' ? 'Week of' : 'Month'}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      {loading && <p className="muted">Loading...</p>}
      {error && <div className="alert error">{error}</div>}

      {data && !loading && (
        <>
          <p className="range-label">{data.range.label}</p>

          <div className="card">
            <div className="card-title-row">
              <h3>Turf Hours & Payment</h3>
              <ImageActionButtons
                small
                disabled={downloading}
                onDownload={handleDownloadTurfImage}
                onWhatsApp={handleShareTurfImage}
              />
            </div>
            <div className="stat-grid">
              {['cricket', 'football', 'badminton'].map((s) => (
                <StatCard
                  key={s}
                  label={s.charAt(0).toUpperCase() + s.slice(1)}
                  value={`${data.turf[s].hours} hrs`}
                  sub={formatCurrency(data.turf[s].payment)}
                />
              ))}
              <StatCard
                label="Overall"
                value={`${data.turf.overall.hours} hrs`}
                sub={formatCurrency(data.turf.overall.payment)}
              />
            </div>
            <p className="hint">{data.turf.overall.bookings} total bookings</p>
          </div>

          <div className="card">
            <div className="card-title-row">
              <h3>Gym Admissions & Payment</h3>
              <ImageActionButtons
                small
                disabled={downloading}
                onDownload={handleDownloadGymImage}
                onWhatsApp={handleShareGymImage}
              />
            </div>
            <div className="stat-grid">
              {[1, 3, 6].map((p) => (
                <StatCard
                  key={p}
                  label={`${p} Month`}
                  value={`${data.gym.byPlan[p]?.count || 0} admissions`}
                  sub={formatCurrency(data.gym.byPlan[p]?.payment || 0)}
                />
              ))}
              <StatCard
                label="Overall"
                value={`${data.gym.overall.count} admissions`}
                sub={formatCurrency(data.gym.overall.payment)}
              />
            </div>
          </div>

          {data.chart.type === 'daily' ? (
            <>
              <div className="card chart-card">
                <h3>Hours by Sport</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.chart.turfBars}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="sport" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="hours" fill="#4472c4" name="Hours" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card chart-card">
                <h3>Gym Admissions by Plan</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.chart.gymBars}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="plan" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#92d050" name="Admissions" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <>
              <div className="card chart-card">
                <h3>Sport Hours Trend</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.chart.points}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="cricket" stackId="h" fill={SPORT_COLORS.cricket} name="Cricket" />
                    <Bar dataKey="football" stackId="h" fill={SPORT_COLORS.football} name="Football" />
                    <Bar dataKey="badminton" stackId="h" fill={SPORT_COLORS.badminton} name="Badminton" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card chart-card">
                <h3>Gym Admissions & Payment</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.chart.points}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis yAxisId="left" fontSize={12} />
                    <YAxis yAxisId="right" orientation="right" fontSize={12} />
                    <Tooltip formatter={(v, name) => name === 'Payment' ? formatCurrency(v) : v} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="gym" fill="#92d050" name="Gym Admissions" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="right" dataKey="payment" fill="#4472c4" name="Payment" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
