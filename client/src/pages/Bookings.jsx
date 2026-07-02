import { useEffect, useState } from 'react';

import { Link, useSearchParams } from 'react-router-dom';

import { TabBar } from '../components/BookingForm';

import { planLabel, formatCoachingMonth, coachingPeriodLabel } from '../utils/dates';

import {

  fetchBookings, deleteBooking,

  fetchOnlineBookings, deleteOnlineBooking,

  fetchGymEntries, deleteGymEntry,

  fetchFootballCoachingEntries, deleteFootballCoachingEntry,

  formatDateDMY, formatCurrency,

} from '../api';



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

  const [loading, setLoading] = useState(true);



  const load = () => {

    setLoading(true);

    let params = {};

    if (filterDate) {

      if (filterType === 'payment') {

        params = { date: filterDate, filter_type: 'payment' };

      } else if (tab === 'gym') {

        params = { start_date: filterDate };

      } else if (tab === 'football_coaching') {

        params = { coaching_month: filterDate.slice(0, 7) };

      } else {

        params = { match_date: filterDate };

      }

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



  useEffect(load, [tab, filterDate, filterType]);



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

    if (filterType === 'payment') return 'Payment Date';

    if (tab === 'gym') return 'Start Date';

    if (tab === 'football_coaching') return 'Coaching Month';

    return 'Match Date';

  };



  return (

    <div className="page">

      <h2>All Records</h2>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />



      <div className="filter-bar">

        <label>

          Filter by

          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>

            {FILTER_TYPES.map((opt) => (

              <option key={opt.id} value={opt.id}>{opt.label}</option>

            ))}

          </select>

        </label>

        <label>

          {filterLabel()}

          <input

            type={tab === 'football_coaching' && filterType === 'match' ? 'month' : 'date'}

            value={tab === 'football_coaching' && filterType === 'match' && filterDate

              ? filterDate.slice(0, 7)

              : filterDate}

            onChange={(e) => setFilterDate(

              tab === 'football_coaching' && filterType === 'match'

                ? `${e.target.value}-01`

                : e.target.value

            )}

          />

        </label>

        {filterDate && (

          <button className="btn small" onClick={() => setFilterDate('')}>Clear</button>

        )}

      </div>

      {filterType === 'payment' && filterDate && (

        <p className="hint filter-hint">Showing entries with advance or balance paid on this date</p>

      )}



      {loading ? (

        <p className="muted">Loading...</p>

      ) : items.length === 0 ? (

        <p className="muted">No records found.</p>

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

