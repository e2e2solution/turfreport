import { useCallback, useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { fetchOwnerCafeMonths, fetchOwnerCafeReport, formatCurrency } from '../api';
import {
  getCachedCafeMonths, setCachedCafeMonths,
  getCachedCafeReport, setCachedCafeReport,
  getCachedCafeSelectedMonth, setCachedCafeSelectedMonth,
} from '../utils/ownerCafeCache';
import { cafeYearValueRange } from '../utils/waveValueScore';
import OwnerHeroWave from './OwnerHeroWave';
import OwnerSmileLoader from './OwnerSmileLoader';

const COLORS = ['#4472c4', '#92d050', '#f4b084', '#ed7d31', '#7030a0', '#c55a11', '#5b9bd5', '#ffc000'];
const CAFE_AXIS_TICK = { fill: '#1a202c' };
const CAFE_GRID_STROKE = 'rgba(0,0,0,0.12)';

function pickInitialMonth(months) {
  const saved = getCachedCafeSelectedMonth();
  if (saved && months.some((m) => m.month_key === saved)) return saved;
  return months[0]?.month_key || '';
}

function OwnerCafeHighlight({ label, value, variant }) {
  return (
    <div className={`owner-highlight owner-hl-${variant}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function OwnerCafeView() {
  const initialMonths = getCachedCafeMonths();
  const initialMonth = pickInitialMonth(initialMonths);

  const [months, setMonths] = useState(initialMonths);
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [report, setReport] = useState(() => (
    initialMonth ? getCachedCafeReport(initialMonth) : null
  ));
  const [loading, setLoading] = useState(!initialMonths.length);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadReport = useCallback(async (monthKey, force = false) => {
    if (!monthKey) {
      setReport(null);
      return;
    }
    if (!force) {
      const cached = getCachedCafeReport(monthKey);
      if (cached) {
        setReport(cached);
        return;
      }
    }
    const data = await fetchOwnerCafeReport(monthKey);
    setCachedCafeReport(monthKey, data);
    setReport(data);
  }, []);

  const loadMonths = useCallback(async (force = false) => {
    if (!force && months.length) return;

    const hadData = months.length > 0 || Boolean(report);
    if (!hadData) setLoading(true);
    else setRefreshing(true);

    setError('');
    try {
      const rows = await fetchOwnerCafeMonths();
      setCachedCafeMonths(rows);
      setMonths(rows);

      const monthKey = (selectedMonth && rows.some((m) => m.month_key === selectedMonth))
        ? selectedMonth
        : pickInitialMonth(rows);

      if (monthKey !== selectedMonth) setSelectedMonth(monthKey);
      if (monthKey) {
        setCachedCafeSelectedMonth(monthKey);
        await loadReport(monthKey, force);
      } else {
        setReport(null);
      }
    } catch (e) {
      setError(e.message);
      if (!hadData) {
        setMonths([]);
        setReport(null);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadReport, months.length, report, selectedMonth]);

  useEffect(() => {
    if (initialMonths.length) return;
    loadMonths(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedMonth) return;
    setCachedCafeSelectedMonth(selectedMonth);
    loadReport(selectedMonth, false).catch((e) => setError(e.message));
  }, [selectedMonth, loadReport]);

  const handleRefresh = () => loadMonths(true);

  const analysis = report?.analysis;
  const categoryChart = analysis?.category_chart || [];
  const topRevenue = analysis?.top_by_revenue?.slice(0, 8) || [];
  const topQty = analysis?.top_by_qty?.slice(0, 8) || [];
  const bottomRevenue = analysis?.bottom_by_revenue?.slice(0, 5) || [];
  const cafeRange = report && selectedMonth
    ? cafeYearValueRange(months, selectedMonth, report.grand_total)
    : { min: 0, max: 0 };

  if (loading && !report) {
    return <OwnerSmileLoader label="Loading cafe report..." />;
  }

  if (!months.length && !error) {
    return (
      <div className="owner-pad">
        <p className="muted">No cafe reports on cloud yet.</p>
        <p className="hint owner-cafe-help">
          On staff PC: Cafe Analysis → upload CSV → <strong>Send to Owner</strong>.
          {' '}Then refresh this Cafe tab.
        </p>
        <button type="button" className="btn small owner-refresh" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    );
  }

  if (error && !months.length) {
    return (
      <div className="owner-pad">
        <p className="alert error">{error}</p>
        <p className="hint owner-cafe-help">
          If this says 404, deploy latest code on Render (Manual Deploy), then Send to Owner again from staff app.
        </p>
        <button type="button" className="btn small owner-refresh" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    );
  }

  return (
    <>
      {error && <p className="alert error owner-pad">{error}</p>}

      <div className="owner-cafe-filter owner-pad">
        <label>
          Month
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m.month_key} value={m.month_key}>{m.label || m.month_key}</option>
            ))}
          </select>
        </label>
      </div>

      {report && (
        <>
          <div className="owner-hero owner-hero-cafe">
            <OwnerHeroWave
              variant="cafe"
              value={report.grand_total}
              minValue={cafeRange.min}
              maxValue={cafeRange.max}
            >
              <span>Cafe Revenue</span>
              <strong>{formatCurrency(report.grand_total)}</strong>
              <small>{report.label} · {report.business_name || 'Cafe'}</small>
            </OwnerHeroWave>
          </div>

          <div className="owner-highlight-grid">
            <OwnerCafeHighlight label="Qty Sold" value={report.grand_qty?.toLocaleString('en-IN')} variant="turf" />
            <OwnerCafeHighlight label="Categories" value={report.categories?.length || 0} variant="badminton" />
            <OwnerCafeHighlight label="Items" value={report.items?.length || 0} variant="gym" />
            <OwnerCafeHighlight
              label="Top Item"
              value={topRevenue[0]?.item?.slice(0, 14) || '-'}
              variant="coaching"
            />
          </div>

          {topRevenue[0] && (
            <div className="owner-gym-badge owner-cafe-best">
              Best seller: <strong>{topRevenue[0].item}</strong>
              {' '}({formatCurrency(topRevenue[0].total)} · {topRevenue[0].qty} qty)
            </div>
          )}

          <div className="owner-card">
            <h3>Revenue by Category</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryChart} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CAFE_GRID_STROKE} />
                <XAxis dataKey="label" tick={{ fontSize: 9, ...CAFE_AXIS_TICK }} angle={-25} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10, ...CAFE_AXIS_TICK }} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {categoryChart.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="owner-card">
            <h3>Top Items by Revenue</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={topRevenue} layout="vertical" margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CAFE_GRID_STROKE} />
                <XAxis type="number" tick={{ fontSize: 10, ...CAFE_AXIS_TICK }} />
                <YAxis type="category" dataKey="item" width={100} tick={{ fontSize: 9, ...CAFE_AXIS_TICK }} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Bar dataKey="total" fill="#92d050" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="owner-card">
            <h3>Top Items by Quantity</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={topQty} layout="vertical" margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CAFE_GRID_STROKE} />
                <XAxis type="number" tick={{ fontSize: 10, ...CAFE_AXIS_TICK }} allowDecimals={false} />
                <YAxis type="category" dataKey="item" width={100} tick={{ fontSize: 9, ...CAFE_AXIS_TICK }} />
                <Tooltip />
                <Bar dataKey="qty" fill="#4472c4" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="owner-report-bottom">
            <h3>Top Sellers</h3>
            <div className="owner-cafe-rank-list">
              {topRevenue.map((row, idx) => (
                <div key={row.item} className="owner-cafe-rank-row">
                  <span className="owner-cafe-rank-num">{idx + 1}</span>
                  <div className="owner-cafe-rank-body">
                    <strong>{row.item}</strong>
                    <small>{row.category} · {row.qty} qty</small>
                  </div>
                  <strong className="owner-cafe-rank-amt">{formatCurrency(row.total)}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="owner-report-bottom">
            <h3>Lowest Sellers</h3>
            <div className="owner-cafe-rank-list owner-cafe-rank-low">
              {bottomRevenue.map((row) => (
                <div key={row.item} className="owner-cafe-rank-row">
                  <div className="owner-cafe-rank-body">
                    <strong>{row.item}</strong>
                    <small>{row.category} · {row.qty} qty</small>
                  </div>
                  <strong className="owner-cafe-rank-amt">{formatCurrency(row.total)}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="owner-report-bottom">
            <h3>Category Summary</h3>
            <div className="owner-totals owner-totals-standalone">
              {report.categories?.map((cat) => (
                <div key={cat.name}>
                  <span>{cat.name}</span>
                  <strong>{formatCurrency(cat.total)}</strong>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <button type="button" className="btn small owner-refresh" onClick={handleRefresh} disabled={refreshing}>
        {refreshing ? 'Refreshing...' : 'Refresh'}
      </button>
    </>
  );
}
