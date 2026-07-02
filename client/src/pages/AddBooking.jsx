import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TabBar, BookingForm, OnlineForm, GymForm, FootballCoachingForm } from '../components/BookingForm';
import { createBooking, createOnlineBooking, createGymEntry, createFootballCoachingEntry } from '../api';

const TABS = [
  { id: 'turf', label: 'Turf' },
  { id: 'online', label: 'Online' },
  { id: 'gym', label: 'Gym' },
  { id: 'football_coaching', label: 'Football Coaching' },
];

export default function AddBooking() {
  const [tab, setTab] = useState('turf');
  const navigate = useNavigate();

  return (
    <div className="page">
      <h2>Add Entry</h2>
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'turf' && (
        <BookingForm onSubmit={async (f) => { await createBooking(f); navigate('/bookings'); }} submitLabel="Add Turf Entry" />
      )}
      {tab === 'online' && (
        <OnlineForm onSubmit={async (f) => { await createOnlineBooking(f); navigate('/bookings?tab=online'); }} submitLabel="Add Online Entry" />
      )}
      {tab === 'gym' && (
        <GymForm onSubmit={async (f) => { await createGymEntry(f); navigate('/bookings?tab=gym'); }} submitLabel="Add Gym Entry" />
      )}
      {tab === 'football_coaching' && (
        <FootballCoachingForm
          onSubmit={async (f) => { await createFootballCoachingEntry(f); navigate('/bookings?tab=football_coaching'); }}
          submitLabel="Add Football Coaching Entry"
        />
      )}
    </div>
  );
}
