import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SportGroupedTurfTable } from '../components/ReportTables';
import { DownloadButtons } from '../components/ImageActionButtons';
import { downloadReport, fetchReportPreview, formatCurrency, todayISO } from '../api';
import { formatCoachingMonth } from '../utils/dates';
import { downloadReportImage, shareReportImage } from '../utils/reportImage';

function currentMonthISO() {
  return todayISO().slice(0, 7);
}

function monthRange(yyyyMm) {
  if (!yyyyMm) return { from: '', to: '' };
  const [y, m] = yyyyMm.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return {
    from: `${yyyyMm}-01`,
    to: `${yyyyMm}-${String(last).padStart(2, '0')}`,
  };
}

function matchTotals(rows) {
  return rows.reduce(
    (acc, r) => {
      acc.total += Number(r.total) || 0;
      acc.gpay += (Number(r.advance_gpay) || 0) + (Number(r.balance_gpay) || 0);
      acc.cash += (Number(r.advance_cash) || 0) + (Number(r.balance_cash) || 0);
      return acc;
    },
    { total: 0, gpay: 0, cash: 0 },
  );
}

export default function OnlineMatchReport() {
  const [mode, setMode] = useState('match'); // match | payment
  const [month, setMonth] = useState(currentMonthISO());
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  const reportParams = useMemo(() => {
    if (!month) return null;
    const { from, to } = monthRange(month);
    if (mode === 'payment') {
      return {
        from,
        to,
        filter_type: 'payment',
        section: 'online',
      };
    }
    return {
      from,
      to,
      section: 'online',
    };
  }, [mode, month]);

  const totals = useMemo(() => matchTotals(rows), [rows]);

  const load = async () => {
    if (!reportParams) return alert('Select a month');
    setLoading(true);
    try {
      const data = await fetchReportPreview(reportParams);
      setPreviewData(data);
      setRows(data.online || []);
      setLoaded(true);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const withDownload = async (fn) => {
    if (!reportParams) return alert('Select a month');
    setDownloading(true);
    try {
      await fn();
    } catch (err) {
      alert(err.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="page">
      <div className="card-title-row">
        <h2>Online Match Report</h2>
        <Link to="/report" className="btn small">All Reports</Link>
      </div>

      <div className="card highlight-payment">
        <h3>Month-wise online matches</h3>
        <p className="hint">
          View online bookings for a month — by <strong>match date</strong> or by <strong>payments in that month</strong> — then download image / Excel.
        </p>

        <div className="filter-bar" style={{ marginBottom: 12 }}>
          <label>
            Show
            <select value={mode} onChange={(e) => { setMode(e.target.value); setLoaded(false); setRows([]); }}>
              <option value="match">Matches in month</option>
              <option value="payment">Paid in month (advance / balance date)</option>
            </select>
          </label>
          <label>
            Month
            <input
              type="month"
              value={month}
              onChange={(e) => { setMonth(e.target.value); setLoaded(false); setRows([]); }}
            />
          </label>
        </div>

        <div className="row-2">
          <button type="button" className="btn primary" disabled={loading} onClick={load}>
            {loading ? 'Loading...' : 'Show List'}
          </button>
          <DownloadButtons
            disabled={downloading || !month}
            onExcel={() => withDownload(() => downloadReport(reportParams))}
            onImage={() => withDownload(() => downloadReportImage(reportParams, previewData))}
            onWhatsApp={() => withDownload(() => shareReportImage(reportParams, previewData))}
          />
        </div>
      </div>

      {loaded && (
        <div className="card">
          <div className="card-title-row">
            <h3>
              {mode === 'payment'
                ? `Online paid in ${formatCoachingMonth(month)}`
                : `Online matches — ${formatCoachingMonth(month)}`}
            </h3>
            <span className="badge pending">{rows.length} record(s)</span>
          </div>

          <div className="stat-grid" style={{ marginBottom: 12 }}>
            <div className="stat-card">
              <span className="stat-label">Booking Total</span>
              <strong className="stat-value">{formatCurrency(totals.total)}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">GPay (Adv+Bal)</span>
              <strong className="stat-value">{formatCurrency(totals.gpay)}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Cash (Adv+Bal)</span>
              <strong className="stat-value">{formatCurrency(totals.cash)}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Collected</span>
              <strong className="stat-value">{formatCurrency(totals.gpay + totals.cash)}</strong>
            </div>
          </div>

          <SportGroupedTurfTable rows={rows} emptyLabel="No online records for this month" />

          <div className="preview-actions" style={{ marginTop: 12 }}>
            <DownloadButtons
              disabled={downloading}
              onExcel={() => withDownload(() => downloadReport(reportParams))}
              onImage={() => withDownload(() => downloadReportImage(reportParams, previewData))}
              onWhatsApp={() => withDownload(() => shareReportImage(reportParams, previewData))}
            />
          </div>
        </div>
      )}
    </div>
  );
}
