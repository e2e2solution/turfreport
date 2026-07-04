import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchDailyTotal, todayISO, formatCurrency, pushOwnerReport, createCustomerReview, syncPendingReviews } from '../api';
import SportMiniAnim from '../components/SportMiniAnim';
import Toast from '../components/Toast';

const HAPPINESS_OPTIONS = [
  { value: 5, emoji: '😊', label: 'Very happy' },
  { value: 4, emoji: '🙂', label: 'Happy' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 2, emoji: '😕', label: 'Unhappy' },
  { value: 1, emoji: '😢', label: 'Very unhappy' },
];

export default function Home() {
  const [date, setDate] = useState(todayISO());
  const [total, setTotal] = useState(null);
  const [pushing, setPushing] = useState(false);
  const [pushSuccess, setPushSuccess] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewName, setReviewName] = useState('');
  const [reviewHappiness, setReviewHappiness] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [resyncing, setResyncing] = useState(false);

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

  const sendReviewToOwner = async (e) => {
    e.preventDefault();
    if (!reviewComment.trim()) {
      alert('Enter what the customer said about the turf');
      return;
    }
    setReviewSaving(true);
    try {
      const res = await createCustomerReview({
        customer_name: reviewName.trim(),
        happiness: reviewHappiness,
        comment: reviewComment.trim(),
      });
      setReviewName('');
      setReviewComment('');
      setReviewHappiness(5);
      setReviewOpen(false);
      const synced = res.mongo_synced || res.cloud_synced;
      setToast({
        type: synced ? 'success' : 'error',
        message: synced
          ? (res.message || 'Customer feedback sent to owner')
          : (res.sync_error || 'Saved locally — owner cannot see it yet. Fix cloud sync.'),
      });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Could not send feedback' });
    } finally {
      setReviewSaving(false);
    }
  };

  const resyncReviews = async () => {
    setResyncing(true);
    try {
      const res = await syncPendingReviews();
      setToast({
        type: res.synced > 0 ? 'success' : 'error',
        message: res.message || `Synced ${res.synced} review(s)`,
      });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Resync failed' });
    } finally {
      setResyncing(false);
    }
  };

  return (
    <div className="page">
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'success' })}
      />
      <h2>Dashboard</h2>

      <div className="card highlight">
        <label className="inline-label">
          Daily Collection (Turf + Online + Gym + Football Coaching)
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {total && (
          <div className="daily-total">
            <div className="total-row total-row-anim"><SportMiniAnim sport="turf" /><span>Turf</span><strong>{formatCurrency(total.turf.total)}</strong></div>
            <div className="total-row total-row-anim"><SportMiniAnim sport="badminton" /><span>Badminton</span><strong>{formatCurrency(total.badminton.total)}</strong></div>
            <div className="total-row total-row-anim"><SportMiniAnim sport="gym" /><span>Gym</span><strong>{formatCurrency(total.gym.total)}</strong></div>
            <div className="total-row total-row-anim"><SportMiniAnim sport="coaching" /><span>Football Coaching</span><strong>{formatCurrency(total.football_coaching?.total || 0)}</strong></div>
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

      <div className="card customer-review-card">
        <h3>Customer Feedback for Owner</h3>
        <p className="hint">When someone visits and shares feedback about the turf, add it here. Owner gets a notification.</p>
        {!reviewOpen ? (
          <div className="customer-review-open-row">
            <button type="button" className="btn customer-review-open" onClick={() => setReviewOpen(true)}>
              Add Customer Feedback
            </button>
            <button type="button" className="btn small" disabled={resyncing} onClick={resyncReviews}>
              {resyncing ? 'Syncing...' : 'Resync to Owner'}
            </button>
          </div>
        ) : (
          <form className="customer-review-form" onSubmit={sendReviewToOwner}>
            <label>
              Customer name (optional)
              <input
                type="text"
                value={reviewName}
                onChange={(e) => setReviewName(e.target.value)}
                placeholder="e.g. Rahul"
              />
            </label>
            <fieldset className="happiness-picker">
              <legend>How happy were they?</legend>
              <div className="happiness-options">
                {HAPPINESS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`happiness-btn${reviewHappiness === opt.value ? ' active' : ''}`}
                    onClick={() => setReviewHappiness(opt.value)}
                    title={opt.label}
                  >
                    <span className="happiness-emoji">{opt.emoji}</span>
                    <span className="happiness-label">{opt.label}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <label>
              What did they say?
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                rows={3}
                placeholder="e.g. Turf was excellent today, very happy with the booking..."
                required
              />
            </label>
            <div className="customer-review-actions">
              <button type="submit" className="btn primary" disabled={reviewSaving}>
                {reviewSaving ? 'Sending...' : 'Send to Owner'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setReviewOpen(false)}
                disabled={reviewSaving}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="quick-actions">
        <Link to="/add" className="action-card">
          <span className="action-icon">➕</span>
          <span>Add Entry (Turf / Online / Gym / Coaching)</span>
        </Link>
        <button
          type="button"
          className="action-card customer-feedback-action"
          onClick={() => {
            setReviewOpen(true);
            document.querySelector('.customer-review-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          <span className="action-icon">💬</span>
          <span>Customer Feedback → Owner</span>
        </button>
        <Link to="/cafe" className="action-card cafe-action-card">
          <span className="action-icon">☕</span>
          <span>Cafe Analysis — Upload CSV</span>
        </Link>
        <Link to="/pt" className="action-card">
          <span className="action-icon">🏋️</span>
          <span>Personal Training</span>
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
        <a href="/owner" className="action-card owner-action-card">
          <span className="action-icon">📱</span>
          <span>Owner App (Mobile Reports)</span>
        </a>
      </div>
    </div>
  );
}
