import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TabBar } from '../components/BookingForm';
import { fetchBulkPackages, formatCurrency } from '../api';

const TABS = [
  { id: '', label: 'All' },
  { id: 'turf', label: 'Turf' },
  { id: 'online', label: 'Online' },
  { id: 'gym', label: 'Gym' },
];

export default function BulkList() {
  const [tab, setTab] = useState('');
  const [status, setStatus] = useState('PENDING');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const params = { status };
    if (tab) params.category = tab;
    fetchBulkPackages(params).then(setItems).finally(() => setLoading(false));
  };

  useEffect(load, [tab, status]);

  return (
    <div className="page">
      <div className="card-title-row">
        <h2>Bulk Packages</h2>
        <Link to="/bulk/add" className="btn small primary">+ New Bulk</Link>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      <div className="filter-bar">
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="PENDING">Pending</option>
            <option value="CLOSED">Closed</option>
          </select>
        </label>
      </div>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : items.length === 0 ? (
        <p className="muted">No bulk packages found.</p>
      ) : (
        <div className="booking-list">
          {items.map((item) => (
            <Link key={item.id} to={`/bulk/${item.id}`} className={`booking-card status-${item.status.toLowerCase()} bulk-card`}>
              <div className="card-top">
                <strong>#{item.id} — {item.name}</strong>
                <span className={`badge ${item.status.toLowerCase()}`}>{item.status}</span>
              </div>
              <div className="card-meta">
                <span>{item.category}</span>
                {item.sport && <span>{item.sport}</span>}
                <span>{item.used_hours || 0} / {item.total_hours} hrs</span>
                <span>{item.session_count || 0} sessions</span>
              </div>
              {item.total_amount > 0 && (
                <div className="card-amounts">
                  <span>Amount: {formatCurrency(item.total_amount)}</span>
                </div>
              )}
              <p className="remarks">{item.remarks || 'bulk'}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
