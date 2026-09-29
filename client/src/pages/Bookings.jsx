import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TabBar } from '../components/BookingForm';
import { planLabel, formatCoachingMonth, coachingPeriodLabel, PLAN_OPTIONS } from '../utils/dates';
import {
  fetchBookings, deleteBooking,
  fetchOnlineBookings, deleteOnlineBooking,
  fetchGymEntries, deleteGymEntry, downloadGymExcel,
  fetchFootballCoachingEntries, deleteFootballCoachingEntry,
  formatDateDMY, formatCurrency,
} from '../api';
import { ImageActionButtons } from '../components/ImageActionButtons';
import {
  buildGymFilterAnalysis,
  gymPeopleJoinedForName,
} from '../components/GymFilterReportCapture';
import {
  downloadGymFilterReportImage,
  shareGymFilterReportImage,
} from '../utils/gymReportImage';

const TABS = [
  { id: 'turf', label: 'Turf' },
  { id: 'online', label: 'Online' },
  { id: 'gym', label: 'Gym' },
  { id: 'football_coaching', label: 'Football Coaching' },
];

const FILTER_TYPES = [
  { id: 'match', label: 'Match / Start Date' },
  { id: 'payment', label: 'Payment Date (Advance or Balance)' },
];

function RecordCard({ item, type, onDelete }) {
  const isGym = type === 'gym';
  const isCoaching = type === 'football_coaching';
  const isOnline = type === 'online';
  const methodLabel = (value) => ({
    DIRECT_GPAY: 'Direct GPay',
    MPAY: 'mPay',
    ONLINE_PAY: 'Online Pay',
  }[value] || value || 'Direct GPay');

  return (
    <div className={`booking-card status-${item.status.toLowerCase()}`}>
      <div className="card-top">
        <strong>{item.name}</strong>
        <span className={`badge ${item.status.toLowerCase()}`}>{item.status}</span>
      </div>
      <div className="card-meta">
        {!isGym && !isCoaching && <span>{item.sport}</span>}
        {isGym ? (
          <>
            <span>{planLabel(item.plan_months)}</span>
            <span>{formatDateDMY(item.start_date)} – {formatDateDMY(item.end_date)}</span>
            <span>{gymPeopleJoinedForName(item.name)} people</span>
            {item.is_linked_carryover && <span>Linked previous balance</span>}
            {item.is_linked_booking && !item.is_linked_carryover && <span>Linked payment</span>}
          </>
        ) : isCoaching ? (
          <>
            <span>{formatCoachingMonth(item.coaching_month)}</span>
            <span>{coachingPeriodLabel(item.period)}</span>
            {item.parent_name && <span>Parent: {item.parent_name}</span>}
            {item.phone && <span>{item.phone}</span>}
          </>
        ) : (
          <>
            <span>{formatDateDMY(item.match_date)}</span>
            <span>{item.time_slot}</span>
          </>
        )}
        {isGym && item.personal_training_amount > 0 && <span>PT: {formatCurrency(item.personal_training_amount)}</span>}
      </div>
      <div className="card-amounts">
        <span>Total: {formatCurrency(item.total)}</span>
        <span>Adv: {formatCurrency((item.advance_gpay || 0) + (item.advance_cash || 0))}</span>
        <span>Bal: {formatCurrency((item.balance_gpay || 0) + (item.balance_cash || 0))}</span>
      </div>
      {isOnline && (
        <div className="card-meta">
          {(item.advance_gpay || 0) > 0 && (
            <span>
              Advance: {methodLabel(item.advance_method)}
              {item.advance_expected_credit_date && ` · expected ${formatDateDMY(item.advance_expected_credit_date)}`}
            </span>
          )}
          {(item.balance_gpay || 0) > 0 && (
            <span>
              Balance: {methodLabel(item.balance_method)}
              {item.balance_expected_credit_date && ` · expected ${formatDateDMY(item.balance_expected_credit_date)}`}
            </span>
          )}
        </div>
      )}
      {item.remarks && <p className="remarks">{item.remarks}</p>}
      <div className="card-actions">
        <Link to={`/edit/${type}/${item.id}`} className="btn small">Edit</Link>
        <button className="btn small danger" onClick={() => onDelete(item.id)}>Delete</button>
      </div>
    </div>
  );
}

export default function Bookings() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'turf');
  const [items, setItems] = useState([]);
  const [filterType, setFilterType] = useState('match');
  const [filterDate, setFilterDate] = useState('');
  const [nameQuery, setNameQuery] = useState('');
  const [debouncedName, setDebouncedName] = useState('');
  const [status, setStatus] = useState('');
  const [planMonths, setPlanMonths] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);

  const isCoachingMonthFilter = tab === 'football_coaching'
    && (filterType === 'match' || filterType === 'payment');
  const isGymStartMonthFilter = tab === 'gym' && filterType === 'match';
  const useMonthInput = isCoachingMonthFilter || isGymStartMonthFilter;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedName(nameQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [nameQuery]);

  const buildGymParams = () => {
    const params = {};
    if (filterDate) {
      if (filterType === 'payment') {
        params.date = filterDate;
        params.filter_type = 'payment';
      } else {
        params.start_month = filterDate.slice(0, 7);
      }
    }
    if (status) params.status = status;
    if (debouncedName) params.name = debouncedName;
    if (planMonths) params.plan_months = planMonths;
    return params;
  };

  const load = () => {
    setLoading(true);
    let params = {};
    if (tab === 'gym') {
      params = buildGymParams();
    } else if (filterDate) {
      if (filterType === 'payment') {
        params = { date: filterDate, filter_type: 'payment' };
      } else if (tab === 'football_coaching') {
        params = { coaching_month: filterDate.slice(0, 7) };
      } else {
        params = { match_date: filterDate };
      }
      if (status) params.status = status;
      if (debouncedName) params.name = debouncedName;
    } else {
      if (status) params.status = status;
      if (debouncedName) params.name = debouncedName;
    }

    const fetchers = {
      turf: fetchBookings,
      online: fetchOnlineBookings,
      gym: fetchGymEntries,
      football_coaching: fetchFootballCoachingEntries,
    };
    const fetcher = fetchers[tab] || fetchBookings;
    fetcher(params).then(setItems).finally(() => setLoading(false));
  };

  useEffect(load, [tab, filterDate, filterType, status, debouncedName, planMonths]);

  const handleTabChange = (next) => {
    setTab(next);
    if (next !== 'gym') setPlanMonths('');
    if (next === 'gym' && filterType === 'match' && filterDate.length > 7) {
      setFilterDate(filterDate.slice(0, 7));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this entry?')) return;
    const deleters = {
      turf: deleteBooking,
      online: deleteOnlineBooking,
      gym: deleteGymEntry,
      football_coaching: deleteFootballCoachingEntry,
    };
    const del = deleters[tab] || deleteBooking;
    await del(id);
    load();
  };

  const filterLabel = () => {
    if (tab === 'football_coaching' && filterType === 'payment') return 'Payment Month';
    if (filterType === 'payment') return 'Payment Date';
    if (tab === 'gym') return 'Start Month';
    if (tab === 'football_coaching') return 'Coaching Month';
    return 'Match Date';
  };

  const onFilterChange = (value) => {
    setFilterDate(value);
  };

  const filterInputValue = () => {
    if (!filterDate) return '';
    if (useMonthInput) return filterDate.slice(0, 7);
    return filterDate;
  };

  const hasActiveFilters = Boolean(filterDate || status || nameQuery.trim() || planMonths);

  const clearFilters = () => {
    setFilterDate('');
    setStatus('');
    setNameQuery('');
    setDebouncedName('');
    setPlanMonths('');
  };

  const gymAnalysis = useMemo(
    () => (tab === 'gym' ? buildGymFilterAnalysis(items) : null),
    [tab, items],
  );

  const gymReportTitle = () => {
    const bits = ['Gym members'];
    if (filterDate && filterType === 'match') bits.push(`from ${formatCoachingMonth(filterDate.slice(0, 7))}`);
    if (filterDate && filterType === 'payment') bits.push(`paid ${formatDateDMY(filterDate)}`);
    if (planMonths) bits.push(planLabel(planMonths));
    if (status) bits.push(status);
    if (debouncedName) bits.push(`“${debouncedName}”`);
    return bits.join(' · ');
  };

  const gymImageFilename = () => {
    const parts = ['gym'];
    if (filterDate && filterType === 'match') parts.push(filterDate.slice(0, 7));
    if (planMonths) parts.push(`${planMonths}m`);
    if (status) parts.push(status.toLowerCase());
    return `${parts.join('-')}.png`;
  };

  const handleDownloadGymExcel = async () => {
    setDownloading(true);
    try {
      await downloadGymExcel(buildGymParams());
    } catch (err) {
      alert(err.message);
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadGymImage = async () => {
    if (!items.length) return;
    setImageBusy(true);
    try {
      await downloadGymFilterReportImage(gymReportTitle(), items, gymImageFilename());
    } catch (err) {
      alert(err.message);
    } finally {
      setImageBusy(false);
    }
  };

  const handleShareGymImage = async () => {
    if (!items.length) return;
    setImageBusy(true);
    try {
      await shareGymFilterReportImage(gymReportTitle(), items, gymImageFilename());
    } catch (err) {
      alert(err.message);
    } finally {
      setImageBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="card-title-row">
        <h2>All Records</h2>
        {tab === 'football_coaching' && (
          <Link to="/football-coaching" className="btn small primary">Month Report + Image</Link>
        )}
        {tab === 'online' && (
          <Link to="/online-report" className="btn small primary">Month Report + Image</Link>
        )}
        {tab === 'turf' && (
          <Link to="/turf-report" className="btn small primary">Month Report + Image</Link>
        )}
        {tab === 'gym' && (
          <Link to="/gym-pending" className="btn small">Pending dues report</Link>
        )}
      </div>
      <TabBar tabs={TABS} active={tab} onChange={handleTabChange} />

      <div className="filter-bar">
        <label className="filter-name">
          Search name
          <input
            type="search"
            placeholder={tab === 'football_coaching' ? 'Name or parent…' : 'Type a name…'}
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="PENDING">Pending</option>
            <option value="CLOSED">Closed</option>
          </select>
        </label>
        {tab === 'gym' && (
          <label>
            Package
            <select value={planMonths} onChange={(e) => setPlanMonths(e.target.value)}>
              <option value="">All packages</option>
              {PLAN_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          Filter by
          <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setFilterDate(''); }}>
            {FILTER_TYPES.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {tab === 'gym' && opt.id === 'match'
                  ? 'Start Month'
                  : tab === 'football_coaching' && opt.id === 'match'
                    ? 'Coaching Month'
                    : tab === 'football_coaching' && opt.id === 'payment'
                      ? 'Paid in Month'
                      : opt.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {filterLabel()}
          <input
            type={useMonthInput ? 'month' : 'date'}
            value={filterInputValue()}
            onChange={(e) => onFilterChange(e.target.value)}
          />
        </label>
        {hasActiveFilters && (
          <button type="button" className="btn small" onClick={clearFilters}>Clear</button>
        )}
      </div>
      {filterType === 'payment' && filterDate && (
        <p className="hint filter-hint">
          {tab === 'football_coaching'
            ? `Showing coaching entries with advance or balance paid in ${formatCoachingMonth(filterDate.slice(0, 7))}`
            : 'Showing entries with advance or balance paid on this date'}
        </p>
      )}
      {tab === 'gym' && filterType === 'match' && filterDate && (
        <p className="hint filter-hint">
          Showing gym members whose package starts in {formatCoachingMonth(filterDate.slice(0, 7))}
          {planMonths ? ` · ${planLabel(planMonths)}` : ''}
        </p>
      )}

      {tab === 'gym' && !loading && (
        <div className="cafe-action-row" style={{ marginBottom: 12 }}>
          <button
            type="button"
            className="btn small secondary"
            disabled={downloading || items.length === 0}
            onClick={handleDownloadGymExcel}
          >
            {downloading ? '...' : 'Download Excel'}
          </button>
          <ImageActionButtons
            small
            disabled={imageBusy || items.length === 0}
            onDownload={handleDownloadGymImage}
            onWhatsApp={handleShareGymImage}
          />
        </div>
      )}

      {loading ? (
        <p className="muted">Loading...</p>
      ) : items.length === 0 ? (
        <p className="muted">No records found.</p>
      ) : tab === 'gym' ? (
        <>
          {gymAnalysis && (
            <div className="card">
              <div className="gym-report-analysis" style={{ marginTop: 0, border: 'none', padding: 0, background: 'transparent' }}>
                <h3>Analysis</h3>
                <div className="gym-analysis-grid">
                  <div className="gym-analysis-item">
                    <span>People joined</span>
                    <strong>{gymAnalysis.peopleJoined}</strong>
                  </div>
                  <div className="gym-analysis-item">
                    <span>Records</span>
                    <strong>{gymAnalysis.records}</strong>
                  </div>
                  <div className="gym-analysis-item">
                    <span>Pending</span>
                    <strong>{gymAnalysis.pending}</strong>
                  </div>
                  <div className="gym-analysis-item">
                    <span>Closed</span>
                    <strong>{gymAnalysis.closed}</strong>
                  </div>
                </div>
                <ul className="gym-analysis-list">
                  {PLAN_OPTIONS.map((opt) => {
                    const pack = gymAnalysis.byPackage[opt.value] || { records: 0, people: 0 };
                    if (!pack.records) return null;
                    return (
                      <li key={opt.value}>
                        <strong>{opt.label}:</strong> {pack.people} people joined ({pack.records} record{pack.records === 1 ? '' : 's'})
                      </li>
                    );
                  })}
                  <li>
                    <strong>Plan total:</strong> {formatCurrency(gymAnalysis.total)}
                    {gymAnalysis.pt > 0 ? ` · PT ${formatCurrency(gymAnalysis.pt)}` : ''}
                  </li>
                  <li>
                    <strong>Collected:</strong> Adv {formatCurrency(gymAnalysis.adv)} · Bal {formatCurrency(gymAnalysis.bal)}
                  </li>
                </ul>
              </div>
            </div>
          )}

          <div className="card">
            <h3>{gymReportTitle()}</h3>
            <div className="table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Package</th>
                    <th>People</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r, i) => (
                    <tr key={r.id} className={r.is_linked_booking ? `linked-booking-row linked-hue-${r.link_hue || 0}` : undefined}>
                      <td>{i + 1}</td>
                      <td>
                        {r.name}
                        {r.is_linked_carryover && (
                          <div><small>Linked previous {planLabel(r.plan_months)} balance</small></div>
                        )}
                        {r.is_linked_booking && !r.is_linked_carryover && (
                          <div><small>Linked payment</small></div>
                        )}
                      </td>
                      <td>{planLabel(r.plan_months)}</td>
                      <td>{gymPeopleJoinedForName(r.name)}</td>
                      <td>{formatDateDMY(r.start_date)}</td>
                      <td>{formatDateDMY(r.end_date)}</td>
                      <td>{formatCurrency(r.total)}</td>
                      <td>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="booking-list">
            {items.map((item) => (
              <RecordCard key={item.id} item={item} type="gym" onDelete={handleDelete} />
            ))}
          </div>
        </>
      ) : (
        <div className="booking-list">
          {items.map((item) => (
            <RecordCard key={item.id} item={item} type={tab} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
