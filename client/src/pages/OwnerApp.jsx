import { useEffect, useState, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  ownerLogin, fetchOwnerReports, getOwnerToken, setOwnerToken, clearOwnerToken,
  formatCurrency, formatDateDMY, getOwnerApiBase, setOwnerApiBase, ownerHealthCheck,
} from '../api';
import OwnerReportPreview from '../components/OwnerReportPreview';
import { captureElementAsBlob, downloadBlob } from '../utils/captureImage';
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

function OwnerBrandHeader({ subtitle, actions }) {
  return (
    <header className="owner-brand-header">
      <div className="owner-brand-title">
        <h1>Vathiyayath Sports Hub</h1>
        {subtitle && <p className="owner-brand-sub">{subtitle}</p>}
      </div>
      {actions && <div className="owner-brand-actions">{actions}</div>}
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
    <div className="owner-app">
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
  return (
    <button
      type="button"
      className={`owner-day-chip${selected ? ' active' : ''}`}
      onClick={() => onSelect(report.payment_date)}
    >
      <span>{formatDateDMY(report.payment_date)}</span>
      <strong>{formatCurrency(report.collection?.total || 0)}</strong>
    </button>
  );
}

export default function OwnerApp({ standalone = false, native = false }) {
  const [authed, setAuthed] = useState(Boolean(getOwnerToken()));
  const [reports, setReports] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const exportRef = useRef(null);
  const { canInstall, installed, install } = usePwaInstall();
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

  if (!authed) {
    return <OwnerLogin onSuccess={() => setAuthed(true)} standalone={standalone} native={native} />;
  }

  const report = reports.find((r) => r.payment_date === selectedDate) || reports[0];

  const downloadReport = async () => {
    if (!exportRef.current) return;
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
    turf: report.collection.turf?.total || 0,
    badminton: report.collection.badminton?.total || 0,
    gym: report.collection.gym?.total || 0,
    coaching: report.collection.football_coaching?.total || 0,
    gpay: report.collection.gpay || 0,
    cash: report.collection.cash || 0,
    total: report.collection.total || 0,
  } : null);

  return (    <div className="owner-app">
      <OwnerBrandHeader
        subtitle="Owner Reports — Daily collection & turf hours"
        actions={(
          <>
            {standalone && !native && canInstall && !installed && (
              <button type="button" className="btn small owner-install-header" onClick={install}>
                Install
              </button>
            )}
            <button
              type="button"
              className="btn small owner-logout-btn"
              onClick={() => { clearOwnerToken(); setAuthed(false); }}
            >
              Logout
            </button>
          </>
        )}
      />

      <div className="owner-content">
      {loading && <p className="muted owner-pad">Loading...</p>}
      {error && <p className="alert error owner-pad">{error}</p>}

      {!loading && reports.length === 0 && (
        <p className="muted owner-pad">
          No reports yet. Staff must press &quot;Send Report to Owner&quot; from the staff app on PC.
          {' '}Also check Render MongoDB is connected (health should show mongo: true).
        </p>
      )}

      {reports.length > 0 && report && (
        <>
          <div className="owner-day-scroll">
            {reports.map((r) => (
              <ReportDay
                key={r.payment_date}
                report={r}
                selected={r.payment_date === (report.payment_date)}
                onSelect={setSelectedDate}
              />
            ))}
          </div>

          <div className="owner-hero">
            <span>Total Collected</span>
            <strong>{formatCurrency(report.collection.total)}</strong>
            <small>Payment date: {formatDateDMY(report.payment_date)}</small>
          </div>

          {highlights && (
            <div className="owner-highlight-grid">
              <div className="owner-highlight owner-hl-turf">
                <span>Turf</span>
                <strong>{formatCurrency(highlights.turf)}</strong>
              </div>
              <div className="owner-highlight owner-hl-badminton">
                <span>Badminton</span>
                <strong>{formatCurrency(highlights.badminton)}</strong>
              </div>
              <div className="owner-highlight owner-hl-gym">
                <span>Gym</span>
                <strong>{formatCurrency(highlights.gym)}</strong>
              </div>
              <div className="owner-highlight owner-hl-coaching">
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

          <div className="owner-preview-actions">
            <button type="button" className="btn small" onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? 'Hide' : 'Preview'} Payment Report
            </button>
            {showPreview && report.payment_report && (
              <button type="button" className="btn small owner-dl-btn" disabled={downloading} onClick={downloadReport}>
                {downloading ? 'Saving...' : 'Download Report'}
              </button>
            )}
          </div>

          {showPreview && report.payment_report && (
            <OwnerReportPreview report={report} exportRef={exportRef} />
          )}

          {!report.payment_report && (
            <p className="hint owner-pad">Re-send report from staff app to get payment preview on phone.</p>
          )}

          <div className="owner-card">            <h3>Collection by Category</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={report.charts.collection} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {report.charts.collection.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="owner-totals">
              <div><span>Turf</span><strong>{formatCurrency(report.collection.turf.total)}</strong></div>
              <div><span>Badminton</span><strong>{formatCurrency(report.collection.badminton.total)}</strong></div>
              <div><span>Gym</span><strong>{formatCurrency(report.collection.gym.total)}</strong></div>
              <div><span>Coaching</span><strong>{formatCurrency(report.collection.football_coaching?.total || 0)}</strong></div>
              <div><span>GPay</span><strong>{formatCurrency(report.collection.gpay)}</strong></div>
              <div><span>Cash</span><strong>{formatCurrency(report.collection.cash)}</strong></div>
            </div>
          </div>

          <div className="owner-card">
            <h3>Turf Hours (match day)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={report.charts.hours} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="hours" fill="#4472c4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <p className="hint owner-foot">Total hours: <strong>{report.hours?.total || 0}h</strong></p>
          </div>
        </>
      )}

      <button type="button" className="btn small owner-refresh" onClick={load} disabled={loading}>
        Refresh
      </button>
      </div>
    </div>
  );
}
