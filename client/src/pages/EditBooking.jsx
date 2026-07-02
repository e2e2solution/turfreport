import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BookingForm, OnlineForm, GymForm, FootballCoachingForm } from '../components/BookingForm';
import {
  fetchBooking, updateBooking,
  fetchOnlineBooking, updateOnlineBooking,
  fetchGymEntry, updateGymEntry,
  fetchFootballCoachingEntry, updateFootballCoachingEntry,
} from '../api';

const loaders = {
  turf: { fetch: fetchBooking, update: updateBooking },
  online: { fetch: fetchOnlineBooking, update: updateOnlineBooking },
  gym: { fetch: fetchGymEntry, update: updateGymEntry },
  football_coaching: { fetch: fetchFootballCoachingEntry, update: updateFootballCoachingEntry },
};

const forms = {
  turf: BookingForm,
  online: OnlineForm,
  gym: GymForm,
  football_coaching: FootballCoachingForm,
};
const labels = {
  turf: 'Turf',
  online: 'Online',
  gym: 'Gym',
  football_coaching: 'Football Coaching',
};

export default function EditBooking() {
  const { type = 'turf', id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);

  const api = loaders[type] || loaders.turf;
  const Form = forms[type] || BookingForm;

  useEffect(() => {
    api.fetch(id)
      .then(setItem)
      .catch(() => navigate('/bookings'))
      .finally(() => setLoading(false));
  }, [id, type, navigate]);

  if (loading) return <div className="page"><p className="muted">Loading...</p></div>;
  if (!item) return null;

  return (
    <div className="page">
      <h2>Update {labels[type] || 'Turf'} Entry</h2>
      <Form
        initial={item}
        onSubmit={async (form) => {
          await api.update(id, form);
          navigate(`/bookings?tab=${type || 'turf'}`);
        }}
        submitLabel="Update Entry"
      />
    </div>
  );
}
