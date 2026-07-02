import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchDailyTotal, todayISO, formatCurrency, pushOwnerReport } from '../api';

export default function Home() {
  const [date, setDate] = useState(todayISO());
  const [total, setTotal] = useState(null);
  const [pushing, setPushing] = useState(false);
  const [pushSuccess, setPushSuccess] = useState('');

  useEffect(() => {
    fetchDailyTotal(date).then(setTotal).catch(() => setTotal(null));
  }, [date]);

  const sendToOwner = async () => {
    setPushing(true);
    setPushSuccess('');
    try {
      const res = await pushOwnerReport(date);
      const note = res.mongo_note ? ` — ${res.mongo_note}` : '';
      setPushSuccess((res.message || `Report sent for ${date}`) + note);
    } catch (err) {
      alert(err.message);
    } finally {
      setPushing(false);
    }
  };

  return (
    <div className="page">
      <h2>Dashboard</h2>

      <div className="card highlight">
        <label className="inline-label">
          Daily Collection (Turf + Online + Gym + Football Coaching)
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {total && (
          <div className="daily-total">
            <div className="total-row"><span>Turf</span><strong>{formatCurrency(total.turf.total)}</strong></div>
            <div className="total-row"><span>Badminton</span><strong>{formatCurrency(total.badminton.total)}</strong></div>
            <div className="total-row"><span>Gym</span><strong>{formatCurrency(total.gym.total)}</strong></div>
            <div className="total-row"><span>Football Coaching</span><strong>{formatCurrency(total.football_coaching?.total || 0)}</strong></div>
            <div className="total-row"><span>GPay</span><strong>{formatCurrency(total.gpay)}</strong></div>
            <div className="total-row"><span>Cash</span><strong>{formatCurrency(total.cash)}</strong></div>
            <div className="total-row grand highlighted-total">
              <span>Total Collected</span>
              <strong>{formatCurrency(total.total)}</strong>
            </div>
          </div>
        )}
        <button type="button" className="btn owner-push-btn" disabled={pushing} onClick={sendToOwner}>
          {pushing ? 'Sending...' : 'Send Report to Owner'}
        </button>
        {pushSuccess && <div className="alert success owner-push-success">{pushSuccess}</div>}
      </div>

      <div className="quick-actions">
        <Link to="/add" className="action-card">
          <span className="action-icon">➕</span>
          <span>Add Entry (Turf / Online / Gym / Coaching)</span>
        </Link>
        <Link to="/bookings" className="action-card">
          <span className="action-icon">📋</span>
          <span>View & Update Records</span>
        </Link>
        <Link to="/summary" className="action-card">
          <span className="action-icon">📈</span>
          <span>Weekly / Monthly Summary</span>
        </Link>
        <Link to="/report" className="action-card">
          <span className="action-icon">📊</span>
          <span>Generate Excel Report</span>
        </Link>
        <Link to="/bulk" className="action-card">
          <span className="action-icon">📦</span>
          <span>Bulk Packages</span>
        </Link>
      </div>
    </div>
  );
}
