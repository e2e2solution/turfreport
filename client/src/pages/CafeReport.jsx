import { useEffect, useRef, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts';
import {
  deleteCafeReport, fetchCafeMonths, fetchCafeReport, formatCurrency, pushCafeToOwner, uploadCafeReport,
} from '../api';

const CHART_COLORS = ['#4472c4', '#92d050', '#f4b084', '#ed7d31', '#7030a0', '#c55a11', '#5b9bd5', '#a5a5a5', '#ffc000', '#00b050'];

function StatCard({ label, value, sub }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

function ItemTable({ title, rows, qtyKey = 'qty', amountKey = 'total' }) {
  if (!rows?.length) return null;
  return (
    <div className="card">
      <h3>{title}</h3>
      <div className="table-wrap">
        <table className="report-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>Category</th>
              <th>Qty</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={`${row.item}-${idx}`}>
                <td>{idx + 1}</td>
                <td>{row.item}</td>
                <td>{row.category}</td>
                <td>{row[qtyKey]}</td>
                <td>{formatCurrency(row[amountKey])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CafeReport() {
  const fileRef = useRef(null);
  const [months, setMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [pushSuccess, setPushSuccess] = useState('');
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState('');

  const loadMonths = () => fetchCafeMonths().then((rows) => {
    setMonths(rows);
    if (rows.length && !selectedMonth) {
      setSelectedMonth(rows[0].month_key);
    }
    return rows;
  });

  useEffect(() => {
    loadMonths()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedMonth) {
      setReport(null);
      return;
    }
    setLoading(true);
    setError('');
    fetchCafeReport(selectedMonth)
      .then(setReport)
      .catch((err) => {
        setError(err.message);
        setReport(null);
      })
      .finally(() => setLoading(false));
  }, [selectedMonth]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg('');
    setError('');
    try {
      const csv = await file.text();
      const res = await uploadCafeReport(csv, file.name);
      setUploadMsg(res.message || 'Upload successful');
      const rows = await loadMonths();
      setSelectedMonth(res.month_key || rows[0]?.month_key || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    if (!selectedMonth || !confirm(`Delete cafe report for ${selectedMonth}?`)) return;
    try {
      await deleteCafeReport(selectedMonth);
      const rows = await loadMonths();
      setSelectedMonth(rows[0]?.month_key || '');
      if (!rows.length) setReport(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSendToOwner = async () => {
    if (!selectedMonth) return alert('Select a month first');
    setPushing(true);
    setPushSuccess('');
    setError('');
    try {
      const res = await pushCafeToOwner(selectedMonth);
      const note = res.mongo_note ? ` — ${res.mongo_note}` : '';
      const errNote = res.cloud_error ? ` Cloud: ${res.cloud_error}` : '';
      if (res.cloud_synced || res.mongo_synced) {
        setPushSuccess((res.message || `Cafe report sent for ${selectedMonth}`) + note);
      } else {
        setError((res.message || 'Send to Owner failed') + errNote + note);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setPushing(false);
    }
  };

  const analysis = report?.analysis;
  const categoryChart = analysis?.category_chart || [];
  const topRevenue = analysis?.top_by_revenue || [];
  const topQty = analysis?.top_by_qty || [];
  const bottomRevenue = analysis?.bottom_by_revenue || [];

  return (
    <div className="page">
      <h2>Cafe Analysis</h2>
      <p className="hint">Upload monthly item summary CSV. Separate from turf/gym cash reports.</p>

      <div className="card">
        <div className="card-title-row">
          <h3>Upload Monthly Report</h3>
          <label className="btn small primary cafe-upload-btn">
            {uploading ? 'Uploading...' : 'Choose CSV File'}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              disabled={uploading}
              onChange={handleUpload}
              hidden
            />
          </label>
        </div>
        <p className="hint">Expected format: Item Report with Category, Item, Code, Qty., Total columns.</p>
        {uploadMsg && <div className="alert success">{uploadMsg}</div>}
      </div>

      <div className="card">
        <div className="card-title-row">
          <label>
            Select Month
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} disabled={!months.length}>
              {!months.length && <option value="">No reports uploaded</option>}
              {months.map((m) => (
                <option key={m.month_key} value={m.month_key}>{m.label}</option>
              ))}
            </select>
          </label>
          {selectedMonth && (
            <button type="button" className="btn small danger" onClick={handleDelete}>Delete Month</button>
          )}
        </div>
        {selectedMonth && (
          <>
            <button type="button" className="btn owner-push-btn" disabled={pushing} onClick={handleSendToOwner}>
              {pushing ? 'Sending...' : 'Send to Owner'}
            </button>
            <p className="hint">Owner opens mobile app → Cafe tab → selects this month.</p>
            {pushSuccess && <div className="alert success owner-push-success">{pushSuccess}</div>}
          </>
        )}
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading && <p className="muted">Loading...</p>}

      {report && !loading && (
        <>
          <p className="range-label">
            {report.business_name || 'Cafe'} · {report.label}
            {' '}({report.period_from} to {report.period_to})
          </p>

          <div className="stat-grid">
            <StatCard label="Total Revenue" value={formatCurrency(report.grand_total)} />
            <StatCard label="Total Qty Sold" value={report.grand_qty?.toLocaleString('en-IN')} />
            <StatCard label="Categories" value={report.categories?.length || 0} />
            <StatCard label="Items" value={report.items?.length || 0} />
          </div>

          <div className="card">
            <h3>Revenue by Category</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={categoryChart} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {categoryChart.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h3>Top 10 Items by Revenue</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topRevenue} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="item" width={120} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Legend />
                <Bar dataKey="total" name="Revenue" fill="#4472c4" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h3>Top 10 Items by Quantity</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topQty} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="item" width={120} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="qty" name="Quantity" fill="#92d050" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <ItemTable title="Best Sellers (Top 10 by Revenue)" rows={topRevenue} />
          <ItemTable title="Most Quantity Sold (Top 10)" rows={topQty} />
          <ItemTable title="Lowest Sellers (Bottom 10 by Revenue)" rows={bottomRevenue} />

          <div className="card">
            <h3>Category Breakdown</h3>
            <div className="table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Qty</th>
                    <th>Total</th>
                    <th>Items</th>
                    <th>% of Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {report.categories?.map((cat) => (
                    <tr key={cat.name}>
                      <td><strong>{cat.name}</strong></td>
                      <td>{cat.qty}</td>
                      <td>{formatCurrency(cat.total)}</td>
                      <td>{cat.items?.length || 0}</td>
                      <td>{report.grand_total ? `${((cat.total / report.grand_total) * 100).toFixed(1)}%` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h3>All Items</h3>
            <div className="table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Item</th>
                    <th>Code</th>
                    <th>Qty</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(analysis?.all_items || report.items || []).map((row, idx) => (
                    <tr key={`${row.code}-${idx}`}>
                      <td>{row.category}</td>
                      <td>{row.item}</td>
                      <td>{row.code}</td>
                      <td>{row.qty}</td>
                      <td>{formatCurrency(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
