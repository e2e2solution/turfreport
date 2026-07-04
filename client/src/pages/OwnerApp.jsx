import { useEffect, useState, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  ownerLogin, fetchOwnerReports, getOwnerToken, setOwnerToken, clearOwnerToken,
  formatCurrency, formatDateDMY, getOwnerApiBase, setOwnerApiBase, ownerHealthCheck,
  isOwnerDailyReport, markOwnerReviewRead, markAllOwnerReviewsRead,
  fetchOwnerReviews, countUnreadOwnerReviews, isReviewUnread,
} from '../api';
import OwnerReportPreview from '../components/OwnerReportPreview';
import OwnerCafeView from '../components/OwnerCafeView';
import OwnerHeroWave from '../components/OwnerHeroWave';
import OwnerSmileLoader from '../components/OwnerSmileLoader';
import OwnerReviewListPopup from '../components/OwnerReviewListPopup';
import OwnerNotifBanner from '../components/OwnerNotifBanner';
import SportMiniAnim from '../components/SportMiniAnim';
import { dailyMonthValueRange } from '../utils/waveValueScore';
import { captureElementAsBlob, downloadBlob } from '../utils/captureImage';
import AppLogo from '../components/AppLogo';
const COLORS = ['#4472c4', '#92d050', '#f4b084', '#ed7d31'];

function usePwaInstall() {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onInstall = (e) => {
      e.preventDefault();
      setPrompt(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
    setInstalled(standalone);

    window.addEventListener('beforeinstallprompt', onInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!prompt) return false;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setPrompt(null);
    return outcome === 'accepted';
  };

  return { canInstall: Boolean(prompt), installed, install };
}

function OwnerBrandHeader({ subtitle, rightActions }) {
  return (
    <header className="owner-brand-header">
      <div className="owner-brand-title">
        <AppLogo className="app-logo-owner" />
        <h1>Vathiyayath Sports Hub</h1>
        {subtitle && <p className="owner-brand-sub">{subtitle}</p>}
      </div>
      {rightActions && <div className="owner-brand-right">{rightActions}</div>}
    </header>
  );
}

function OwnerLogin({ onSuccess, standalone, native }) {
  const [pin, setPin] = useState('');
  const [serverUrl, setServerUrl] = useState(getOwnerApiBase() || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { canInstall, installed, install } = usePwaInstall();
  const showServerUrl = native || !import.meta.env.VITE_API_BASE;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (showServerUrl && serverUrl.trim()) {
        setOwnerApiBase(serverUrl.trim());
      }
      if (!getOwnerApiBase()) {
        throw new Error('Enter your cloud server URL (e.g. https://your-app.onrender.com)');
      }
      await ownerHealthCheck();
      const { token } = await ownerLogin(pin.trim());
      setOwnerToken(token);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="owner-app owner-login-screen">
      <OwnerBrandHeader subtitle="Owner Report" />
      <div className="owner-login-wrap">
        <div className="owner-login-card">
          <p className="hint owner-login-hint">Sign in to view daily collection from anywhere</p>
          <form onSubmit={submit}>
          {error && <div className="alert error">{error}</div>}
          {showServerUrl && (
            <label>
              Cloud server URL
              <input
                type="url"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://turfreport.onrender.com"
                autoComplete="off"
                required
              />
            </label>
          )}
          <label>
            Owner PIN
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN: 123"
              autoComplete="off"
            />
          </label>
          <p className="hint" style={{ marginTop: 8 }}>Owner PIN is set in server .env (<strong>OWNER_PIN</strong>)</p>
          <button type="submit" className="btn primary owner-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'View Reports'}
          </button>
        </form>
        {standalone && !native && canInstall && !installed && (
          <button type="button" className="btn owner-install-btn" onClick={install}>
            Install App on Phone
          </button>
        )}
        {standalone && !native && !canInstall && !installed && (
          <p className="hint owner-install-hint">
            To install: open this page in Chrome (Android) or Safari (iPhone) → menu →
            {' '}<strong>Add to Home Screen</strong>
          </p>
        )}
        </div>
      </div>
    </div>
  );
}

function ReportDay({ report, selected, onSelect }) {
  const ref = useRef(null);

  useEffect(() => {
    if (selected && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [selected]);

  return (
    <button
      ref={ref}
      type="button"
      className={`owner-day-chip${selected ? ' active' : ''}`}
      onClick={() => onSelect(report.payment_date)}
    >
      <span>{formatDateDMY(report.payment_date)}</span>
      <strong>{formatCurrency(report.collection?.total || 0)}</strong>
    </button>
  );
}

function OwnerBottomNav({ active, onChange, onNotif, unreadCount }) {
  return (
    <nav className="owner-bottom-nav">
      <button
        type="button"
        className={`owner-nav-item${active === 'home' ? ' active' : ''}`}
        onClick={() => onChange('home')}
      >
        <span className="owner-nav-icon">🏠</span>
        <span>Home</span>
      </button>
      <button
        type="button"
        className={`owner-nav-item${active === 'cafe' ? ' active' : ''}`}
        onClick={() => onChange('cafe')}
      >
        <span className="owner-nav-icon">☕</span>
        <span>Cafe</span>
      </button>
      <button
        type="button"
        className={`owner-nav-item owner-nav-notif${unreadCount > 0 ? ' has-notif' : ''}`}
        onClick={onNotif}
        aria-label={unreadCount > 0 ? `${unreadCount} new customer reviews` : 'Customer reviews'}
      >
        <span className="owner-nav-icon-wrap">
          <span className="owner-nav-icon" aria-hidden="true">🔔</span>
          {unreadCount > 0 && (
            <span className="owner-nav-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
          )}
        </span>
        <span>Alerts</span>
      </button>
    </nav>
  );
}

export default function OwnerApp({ standalone = false, native = false }) {
  const [authed, setAuthed] = useState(Boolean(getOwnerToken()));
  const [ownerTab, setOwnerTab] = useState('home');
  const [reports, setReports] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [pendingReview, setPendingReview] = useState(null);
  const [reviewList, setReviewList] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showReviewList, setShowReviewList] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [showNotifBanner, setShowNotifBanner] = useState(false);
  const exportRef = useRef(null);
  const lastBannerReviewRef = useRef(null);
  const { canInstall, installed, install } = usePwaInstall();

  const notifyNewReview = (review) => {
    if (!review?.review_id) return;
    if (lastBannerReviewRef.current === review.review_id) return;
    lastBannerReviewRef.current = review.review_id;
    setShowNotifBanner(true);
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([120, 60, 120]);
    }
  };

  const checkReview = () => {
    fetchOwnerReviews()
      .then((rows) => {
        setReviewList(rows);
        const unread = countUnreadOwnerReviews(rows);
        setUnreadCount(unread);
        const latest = rows.find((r) => isReviewUnread(r));
        if (latest?.review_id) {
          setPendingReview(latest);
          notifyNewReview(latest);
        } else {
          setPendingReview(null);
          setShowNotifBanner(false);
          lastBannerReviewRef.current = null;
        }
      })
      .catch(() => { /* ignore poll errors */ });
  };

  const load = () => {
    setLoading(true);
    setError('');
    fetchOwnerReports({ limit: 30 })
      .then((rows) => {
        setReports(rows);
        if (rows.length && !selectedDate) setSelectedDate(rows[0].payment_date);
      })
      .catch((e) => {
        setError(e.message);
        if (e.message.includes('login') || e.message.includes('Session')) {
          clearOwnerToken();
          setAuthed(false);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (authed) load();
  }, [authed]);

  useEffect(() => {
    if (!authed) return undefined;
    checkReview();
    const timer = setInterval(checkReview, 15000);
    const onFocus = () => checkReview();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [authed]);

  const openReview = async () => {
    setShowNotifBanner(false);
    setReviewsLoading(true);
    setShowReviewList(true);
    try {
      const rows = await fetchOwnerReviews();
      setReviewList(rows);
      setUnreadCount(countUnreadOwnerReviews(rows));
    } catch {
      /* keep existing list */
    } finally {
      setReviewsLoading(false);
    }
  };

  const dismissNotifBanner = () => {
    setShowNotifBanner(false);
  };

  const handleReviewRead = async (reviewId) => {
    await markOwnerReviewRead(reviewId);
    setReviewList((prev) => prev.map((r) => (
      r.review_id === reviewId ? { ...r, read_by_owner: true } : r
    )));
    const rows = await fetchOwnerReviews().catch(() => reviewList);
    const merged = rows.map((r) => (
      r.review_id === reviewId ? { ...r, read_by_owner: true } : r
    ));
    setReviewList(merged);
    setUnreadCount(countUnreadOwnerReviews(merged));
    const latest = merged.find((r) => isReviewUnread(r));
    setPendingReview(latest || null);
    if (!latest) {
      setShowNotifBanner(false);
      lastBannerReviewRef.current = null;
    }
  };

  const handleMarkAllRead = async (reviewIds) => {
    await markAllOwnerReviewsRead(reviewIds);
    setReviewList((prev) => prev.map((r) => (
      reviewIds.includes(r.review_id) ? { ...r, read_by_owner: true } : r
    )));
    setUnreadCount(0);
    setPendingReview(null);
    setShowNotifBanner(false);
    lastBannerReviewRef.current = null;
  };

  const handleExit = () => {
    clearOwnerToken();
    setAuthed(false);
  };

  const closeReviewList = () => {
    setShowReviewList(false);
  };

  if (!authed) {
    return <OwnerLogin onSuccess={() => setAuthed(true)} standalone={standalone} native={native} />;
  }

  const dailyReports = reports.filter(isOwnerDailyReport);
  const report = dailyReports.find((r) => r.payment_date === selectedDate) || dailyReports[0];
  const collection = report?.collection || {};
  const collectionChart = report?.charts?.collection || [];
  const hoursChart = report?.charts?.hours || [];

  const downloadReport = async () => {
    if (!exportRef.current || !report) return;
    setDownloading(true);
    try {
      const blob = await captureElementAsBlob(exportRef.current);
      downloadBlob(blob, `owner-report-${report.payment_date}.png`);
    } catch (err) {
      alert(err.message || 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const highlights = report?.highlights || (report?.collection ? {
    turf: collection.turf?.total || 0,
    badminton: collection.badminton?.total || 0,
    gym: collection.gym?.total || 0,
    coaching: collection.football_coaching?.total || 0,
    gpay: collection.gpay || 0,
    cash: collection.cash || 0,
    total: collection.total || 0,
  } : null);

  const dailyRange = report
    ? dailyMonthValueRange(dailyReports, report.payment_date, collection.total)
    : { min: 0, max: 0 };

  return (
    <div className="owner-app">
      <OwnerBrandHeader
        subtitle={ownerTab === 'cafe' ? 'Cafe Analysis — Monthly sales' : 'Owner Reports — Daily collection & turf hours'}
        rightActions={(
          <>
            {standalone && !native && canInstall && !installed && (
              <button type="button" className="btn small owner-install-header" onClick={install}>
                Install
              </button>
            )}
            <button
              type="button"
              className="owner-logout-icon-btn"
              onClick={handleExit}
              aria-label="Logout"
              title="Logout"
            >
              ⏻
            </button>
          </>
        )}
      />

      {showNotifBanner && pendingReview && (
        <OwnerNotifBanner
          onOpen={openReview}
          onDismiss={dismissNotifBanner}
        />
      )}

      <div className="owner-content">
        <div className="owner-tab-panel" hidden={ownerTab !== 'cafe'}>
          <OwnerCafeView />
        </div>
        <div className="owner-tab-panel" hidden={ownerTab !== 'home'}>
          <>
            {loading && !dailyReports.length && <OwnerSmileLoader label="Loading reports..." />}
            {error && <p className="alert error owner-pad">{error}</p>}

            {!loading && dailyReports.length === 0 && (
              <p className="muted owner-pad">
                No reports yet. Staff must press &quot;Send Report to Owner&quot; from the staff app on PC.
                {' '}Also check Render MongoDB is connected (health should show mongo: true).
              </p>
            )}

            {dailyReports.length > 0 && report && (
              <>
          <div className={`owner-day-scroll-wrap${dailyReports.length > 2 ? ' has-scroll' : ''}`}>
            <div className="owner-day-scroll">
            {dailyReports.map((r) => (
              <ReportDay
                key={r.payment_date}
                report={r}
                selected={r.payment_date === (report.payment_date)}
                onSelect={setSelectedDate}
              />
            ))}
            </div>
          </div>

          <div className="owner-hero owner-hero-daily">
            <OwnerHeroWave
              variant="daily"
              value={collection.total}
              minValue={dailyRange.min}
              maxValue={dailyRange.max}
            >
              <span>Total Collected</span>
              <strong>{formatCurrency(collection.total)}</strong>
              <small>Payment date: {formatDateDMY(report.payment_date)}</small>
            </OwnerHeroWave>
          </div>

          {highlights && (
            <div className="owner-highlight-grid">
              <div className="owner-highlight owner-hl-turf">
                <SportMiniAnim sport="turf" />
                <span>Turf</span>
                <strong>{formatCurrency(highlights.turf)}</strong>
              </div>
              <div className="owner-highlight owner-hl-badminton">
                <SportMiniAnim sport="badminton" />
                <span>Badminton</span>
                <strong>{formatCurrency(highlights.badminton)}</strong>
              </div>
              <div className="owner-highlight owner-hl-gym">
                <SportMiniAnim sport="gym" />
                <span>Gym</span>
                <strong>{formatCurrency(highlights.gym)}</strong>
              </div>
              <div className="owner-highlight owner-hl-coaching">
                <SportMiniAnim sport="coaching" />
                <span>Coaching</span>
                <strong>{formatCurrency(highlights.coaching)}</strong>
              </div>
              <div className="owner-highlight owner-hl-gpay">
                <span>GPay</span>
                <strong>{formatCurrency(highlights.gpay)}</strong>
              </div>
              <div className="owner-highlight owner-hl-cash">
                <span>Cash</span>
                <strong>{formatCurrency(highlights.cash)}</strong>
              </div>
            </div>
          )}

          <div className="owner-gym-badge">
            Gym members joined: <strong>{report.gym_members_joined ?? 0}</strong>
          </div>

          <div className="owner-card">
            <h3>Collection Chart</h3>
            {collectionChart.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={collectionChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {collectionChart.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            ) : (
              <p className="hint owner-pad">Chart data not in this report — re-send from staff app.</p>
            )}
          </div>

          <div className="owner-card">
            <h3>Turf Hours (match day)</h3>
            {hoursChart.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hoursChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="hours" fill="#4472c4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            ) : (
              <p className="hint owner-pad">Hours chart not in this report.</p>
            )}
            <p className="hint owner-foot">Total hours: <strong>{report.hours?.total || 0}h</strong></p>
          </div>

          <div className="owner-card owner-collection-card owner-report-bottom">
            <h3>Collection Details</h3>
            <div className="owner-totals owner-totals-standalone">
              <div><span>Turf</span><strong>{formatCurrency(collection.turf?.total)}</strong></div>
              <div><span>Badminton</span><strong>{formatCurrency(collection.badminton?.total)}</strong></div>
              <div><span>Gym</span><strong>{formatCurrency(collection.gym?.total)}</strong></div>
              <div><span>Coaching</span><strong>{formatCurrency(collection.football_coaching?.total || 0)}</strong></div>
              <div><span>GPay</span><strong>{formatCurrency(collection.gpay)}</strong></div>
              <div><span>Cash</span><strong>{formatCurrency(collection.cash)}</strong></div>
            </div>
          </div>

          <div className="owner-report-bottom">
            <h3>Daily Payment Report</h3>
            {!report.payment_report ? (
              <p className="hint">Re-send report from staff app to view payment details here.</p>
            ) : (
              <>
                <div className="owner-preview-actions">
                  <button type="button" className="btn small" onClick={() => setShowPreview((v) => !v)}>
                    {showPreview ? 'Hide Report' : 'View Report'}
                  </button>
                  <button type="button" className="btn small owner-dl-btn" disabled={downloading} onClick={downloadReport}>
                    {downloading ? 'Saving...' : 'Download Report'}
                  </button>
                </div>
                {showPreview && (
                  <OwnerReportPreview report={report} exportRef={exportRef} />
                )}
              </>
            )}
              </div>
              </>
            )}

            <button type="button" className="btn small owner-refresh" onClick={load} disabled={loading}>
              Refresh
            </button>
          </>
        </div>
      </div>

      <OwnerBottomNav
        active={ownerTab}
        onChange={setOwnerTab}
        onNotif={openReview}
        unreadCount={unreadCount}
      />

      {showReviewList && (
        <OwnerReviewListPopup
          reviews={reviewList}
          loading={reviewsLoading}
          onClose={closeReviewList}
          onMarkRead={handleReviewRead}
          onMarkAllRead={handleMarkAllRead}
        />
      )}
    </div>
  );
}
