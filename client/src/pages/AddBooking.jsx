import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TabBar, BookingForm, OnlineForm, GymForm, FootballCoachingForm } from '../components/BookingForm';
import { createBooking, createOnlineBooking, createGymEntry, createFootballCoachingEntry } from '../api';

const TABS = [
  { id: 'turf', label: 'Turf' },
  { id: 'online', label: 'Online' },
  { id: 'gym', label: 'Gym' },
  { id: 'football_coaching', label: 'Football Coaching' },
];

export default function AddBooking() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'turf');
  const navigate = useNavigate();

  return (
    <div className="page">
      <h2>Add Entry</h2>
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'turf' && (
        <BookingForm
          enableNameHistory
          onSubmit={async (f) => { await createBooking(f); navigate('/bookings'); }}
          submitLabel="Add Turf Entry"
        />
      )}
      {tab === 'online' && (
        <OnlineForm
          enableNameHistory
          onSubmit={async (f) => { await createOnlineBooking(f); navigate('/bookings?tab=online'); }}
          submitLabel="Add Online Entry"
        />
      )}
      {tab === 'gym' && (
        <GymForm
          enableNameHistory
          onSubmit={async (f) => { await createGymEntry(f); navigate('/bookings?tab=gym'); }}
          submitLabel="Add Gym Entry"
        />
      )}
      {tab === 'football_coaching' && (
        <FootballCoachingForm
          enableNameHistory
          onSubmit={async (f) => { await createFootballCoachingEntry(f); navigate('/bookings?tab=football_coaching'); }}
          submitLabel="Add Football Coaching Entry"
        />
      )}
    </div>
  );
}
