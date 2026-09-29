import { useEffect, useRef, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts';
import {
  deleteCafeReport,
  downloadCafeCsv,
  fetchCafeCompare,
  fetchCafeMonths,
  fetchCafeReport,
  formatCurrency,
  pushCafeToOwner,
  uploadCafeReport,
} from '../api';
import { ImageActionButtons } from '../components/ImageActionButtons';
import {
  captureElementAsBlob,
  downloadElementImage,
  shareImageBlob,
  waitForPaint,
} from '../utils/captureImage';

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

function pctLabel(pct) {
  if (pct == null || Number.isNaN(pct)) return 'n/a';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct}%`;
}

function deltaClass(pct) {
  if (pct == null) return '';
  if (pct > 5) return 'mom-up';
  if (pct < -5) return 'mom-down';
  return 'mom-flat';
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

function InsightList({ title, items, tone }) {
  if (!items?.length) return null;
  return (
    <div className={`insight-block insight-${tone}`}>
      <h4>{title}</h4>
      <ul>
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

const SECTION_EXPORT_CLASS = 'cafe-section-export';

async function captureWideSection(el, filename) {
  if (!el) throw new Error('Section not ready');
  el.classList.add(SECTION_EXPORT_CLASS);
  try {
    // Extra paint time so Recharts ResponsiveContainer can resize to full width
    await waitForPaint(350);
    window.dispatchEvent(new Event('resize'));
    await waitForPaint(200);
    await downloadElementImage(el, filename);
  } finally {
    el.classList.remove(SECTION_EXPORT_CLASS);
  }
}

export default function CafeReport() {
  const fileRef = useRef(null);
  const compareImageRef = useRef(null);
  const momOverviewRef = useRef(null);
  const categoryChangeRef = useRef(null);
  const gainersRef = useRef(null);
  const losersRef = useRef(null);
  const [months, setMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [report, setReport] = useState(null);
  const [comparePayload, setComparePayload] = useState(null);
  const [showCompare, setShowCompare] = useState(true);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [pushSuccess, setPushSuccess] = useState('');
  const [pushing, setPushing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [sectionBusy, setSectionBusy] = useState('');
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
      setComparePayload(null);
      return;
    }
    setLoading(true);
    setError('');
    Promise.all([
      fetchCafeReport(selectedMonth),
      fetchCafeCompare(selectedMonth).catch(() => null),
    ])
      .then(([rep, cmp]) => {
        setReport(rep);
        setComparePayload(cmp);
      })
      .catch((err) => {
        setError(err.message);
        setReport(null);
        setComparePayload(null);
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
      if (!rows.length) {
        setReport(null);
        setComparePayload(null);
      }
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

  const handleDownload = async (type) => {
    if (!selectedMonth) return;
    setDownloading(true);
    setError('');
    try {
      await downloadCafeCsv(selectedMonth, type);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  };

  const cafeImageFilename = () => {
    const key = selectedMonth || 'month';
    return `cafe-mom-${key}.png`;
  };

  const handleDownloadCompareImage = async () => {
    if (!compareImageRef.current) {
      setError('Compare section not ready. Turn on Compare with previous month.');
      return;
    }
    setImageBusy(true);
    setError('');
    try {
      await captureWideSection(compareImageRef.current, cafeImageFilename());
    } catch (err) {
      setError(err.message);
    } finally {
      setImageBusy(false);
    }
  };

  const handleShareCompareImage = async () => {
    if (!compareImageRef.current) {
      setError('Compare section not ready. Turn on Compare with previous month.');
      return;
    }
    setImageBusy(true);
    setError('');
    const el = compareImageRef.current;
    el.classList.add(SECTION_EXPORT_CLASS);
    try {
      await waitForPaint(350);
      window.dispatchEvent(new Event('resize'));
      await waitForPaint(200);
      const blob = await captureElementAsBlob(el);
      shareImageBlob(blob, cafeImageFilename(), 'Cafe MoM Analysis');
    } catch (err) {
      setError(err.message);
    } finally {
      el.classList.remove(SECTION_EXPORT_CLASS);
      setImageBusy(false);
    }
  };

  const handleDownloadSection = async (key, ref, slug) => {
    if (!ref.current) {
      setError('Section not ready');
      return;
    }
    setSectionBusy(key);
    setError('');
    try {
      const month = selectedMonth || 'month';
      await captureWideSection(ref.current, `cafe-${slug}-${month}.png`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSectionBusy('');
    }
  };

  const analysis = report?.analysis;
  const categoryChart = analysis?.category_chart || [];
  const topRevenue = analysis?.top_by_revenue || [];
  const topQty = analysis?.top_by_qty || [];
  const bottomRevenue = analysis?.bottom_by_revenue || [];
  const compare = comparePayload?.compare;
  const momChart = (compare?.categories || []).slice(0, 8).map((c) => ({
    name: c.name,
    current: c.current_total,
    previous: c.previous_total,
  }));

  return (
    <div className="page">
      <h2>Cafe Analysis</h2>
      <p className="hint">Upload monthly item CSV. Compare with previous month and download results.</p>

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
          <div className="cafe-action-row">
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={showCompare}
                onChange={(e) => setShowCompare(e.target.checked)}
              />
              Compare with previous month
            </label>
            <button type="button" className="btn small" disabled={downloading} onClick={() => handleDownload('results')}>
              {downloading ? 'Downloading...' : 'Download Cafe Results CSV'}
            </button>
            <button type="button" className="btn small" disabled={downloading || !compare} onClick={() => handleDownload('compare')}>
              Download Compare CSV
            </button>
            <ImageActionButtons
              small
              disabled={imageBusy || !compare || !showCompare}
              onDownload={handleDownloadCompareImage}
              onWhatsApp={handleShareCompareImage}
            />
            <button type="button" className="btn owner-push-btn" disabled={pushing} onClick={handleSendToOwner}>
              {pushing ? 'Sending...' : 'Send to Owner'}
            </button>
          </div>
        )}
        {selectedMonth && (
          <p className="hint">Owner opens mobile app → Cafe tab → selects this month.</p>
        )}
        {pushSuccess && <div className="alert success owner-push-success">{pushSuccess}</div>}
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

          {showCompare && compare && (
            <div className="card mom-card" ref={compareImageRef}>
              <div className="cafe-section-capture" ref={momOverviewRef}>
                <div className="card-title-row cafe-section-title">
                  <div className="cafe-mom-image-header">
                    <h3>Cafe — Previous Month Compare</h3>
                    <p className="hint">
                      {report.business_name || 'Cafe'} · {compare.label}
                      {compare.has_previous ? ` vs ${compare.previous_label}` : ` (no ${compare.previous_label} upload yet)`}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn small secondary"
                    data-html2canvas-ignore
                    disabled={!!sectionBusy}
                    onClick={() => handleDownloadSection('overview', momOverviewRef, 'mom-overview')}
                  >
                    {sectionBusy === 'overview' ? '...' : 'Download Image'}
                  </button>
                </div>

                <div className="stat-grid">
                  <StatCard
                    label="Revenue MoM"
                    value={formatCurrency(compare.summary.revenue.current)}
                    sub={
                      <span className={deltaClass(compare.summary.revenue.pct)}>
                        Prev {formatCurrency(compare.summary.revenue.previous)} · {pctLabel(compare.summary.revenue.pct)}
                      </span>
                    }
                  />
                  <StatCard
                    label="Qty MoM"
                    value={compare.summary.qty.current?.toLocaleString('en-IN')}
                    sub={
                      <span className={deltaClass(compare.summary.qty.pct)}>
                        Prev {compare.summary.qty.previous?.toLocaleString('en-IN')} · {pctLabel(compare.summary.qty.pct)}
                      </span>
                    }
                  />
                  <StatCard
                    label="Items"
                    value={compare.summary.items.current}
                    sub={`Prev ${compare.summary.items.previous} (${compare.summary.items.delta >= 0 ? '+' : ''}${compare.summary.items.delta})`}
                  />
                  <StatCard
                    label="Categories"
                    value={compare.summary.categories.current}
                    sub={`Prev ${compare.summary.categories.previous}`}
                  />
                </div>

                {momChart.length > 0 && compare.has_previous && (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={momChart} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => formatCurrency(v)} />
                      <Legend />
                      <Bar dataKey="previous" name={compare.previous_label} fill="#a5a5a5" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="current" name={compare.label} fill="#4472c4" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}

                <div className="insight-grid">
                  <InsightList title="Positives" items={compare.insights?.positives} tone="positive" />
                  <InsightList title="Drawbacks" items={compare.insights?.drawbacks} tone="drawback" />
                  <InsightList title="How to improve / grow market" items={compare.insights?.improve} tone="improve" />
                </div>
              </div>

              {compare.has_previous && (
                <>
                  <div className="cafe-section-capture" ref={categoryChangeRef}>
                    <div className="card-title-row cafe-section-title">
                      <h4>Category change</h4>
                      <button
                        type="button"
                        className="btn small secondary"
                        data-html2canvas-ignore
                        disabled={!!sectionBusy}
                        onClick={() => handleDownloadSection('category', categoryChangeRef, 'category-change')}
                      >
                        {sectionBusy === 'category' ? '...' : 'Download Image'}
                      </button>
                    </div>
                    <div className="table-wrap">
                      <table className="report-table">
                        <thead>
                          <tr>
                            <th>Category</th>
                            <th>This month</th>
                            <th>Previous</th>
                            <th>Change</th>
                            <th>%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {compare.categories.map((c) => (
                            <tr key={c.name}>
                              <td><strong>{c.name}</strong></td>
                              <td>{formatCurrency(c.current_total)}</td>
                              <td>{formatCurrency(c.previous_total)}</td>
                              <td className={deltaClass(c.pct)}>{formatCurrency(c.delta)}</td>
                              <td className={deltaClass(c.pct)}>{pctLabel(c.pct)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {compare.gainers?.length > 0 && (
                    <div className="cafe-section-capture" ref={gainersRef}>
                      <div className="card-title-row cafe-section-title">
                        <h4>Top gainers (revenue)</h4>
                        <button
                          type="button"
                          className="btn small secondary"
                          data-html2canvas-ignore
                          disabled={!!sectionBusy}
                          onClick={() => handleDownloadSection('gainers', gainersRef, 'top-gainers')}
                        >
                          {sectionBusy === 'gainers' ? '...' : 'Download Image'}
                        </button>
                      </div>
                      <div className="table-wrap">
                        <table className="report-table">
                          <thead>
                            <tr><th>Item</th><th>Category</th><th>This</th><th>Prev</th><th>Change</th></tr>
                          </thead>
                          <tbody>
                            {compare.gainers.slice(0, 8).map((r) => (
                              <tr key={`g-${r.item}-${r.code}`}>
                                <td>{r.item}</td>
                                <td>{r.category}</td>
                                <td>{formatCurrency(r.current_total)}</td>
                                <td>{formatCurrency(r.previous_total)}</td>
                                <td className="mom-up">{formatCurrency(r.total_delta)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {compare.losers?.length > 0 && (
                    <div className="cafe-section-capture" ref={losersRef}>
                      <div className="card-title-row cafe-section-title">
                        <h4>Top losers (revenue)</h4>
                        <button
                          type="button"
                          className="btn small secondary"
                          data-html2canvas-ignore
                          disabled={!!sectionBusy}
                          onClick={() => handleDownloadSection('losers', losersRef, 'top-losers')}
                        >
                          {sectionBusy === 'losers' ? '...' : 'Download Image'}
                        </button>
                      </div>
                      <div className="table-wrap">
                        <table className="report-table">
                          <thead>
                            <tr><th>Item</th><th>Category</th><th>This</th><th>Prev</th><th>Change</th></tr>
                          </thead>
                          <tbody>
                            {compare.losers.slice(0, 8).map((r) => (
                              <tr key={`l-${r.item}-${r.code}`}>
                                <td>{r.item}</td>
                                <td>{r.category}</td>
                                <td>{formatCurrency(r.current_total)}</td>
                                <td>{formatCurrency(r.previous_total)}</td>
                                <td className="mom-down">{formatCurrency(r.total_delta)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

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
