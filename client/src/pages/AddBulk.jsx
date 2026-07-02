import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TabBar } from '../components/BookingForm';
import { createBulkPackage } from '../api';

const CATEGORY_TABS = [
  { id: 'turf', label: 'Turf' },
  { id: 'online', label: 'Online' },
  { id: 'gym', label: 'Gym' },
];

const SPORTS = ['cricket', 'football', 'badminton'];

export default function AddBulk() {
  const [category, setCategory] = useState('turf');
  const [form, setForm] = useState({
    name: '', sport: 'cricket', total_hours: '', total_amount: '', plan_months: 1,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    try {
      const data = await createBulkPackage({ ...form, category });
      navigate(`/bulk/${data.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <h2>New Bulk Package</h2>
      <p className="hint">Creates a PENDING package with remarks &quot;bulk&quot;. Add daily sessions from Report or package detail.</p>

      <TabBar tabs={CATEGORY_TABS} active={category} onChange={setCategory} />

      <form className="form" onSubmit={handleSubmit}>
        {error && <div className="alert error">{error}</div>}
        <div className="form-section">
          <label>
            Customer Name *
            <input value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="Customer name" />
          </label>
          {category !== 'gym' && (
            <label>
              Sport
              <select value={form.sport} onChange={(e) => set('sport', e.target.value)}>
                {SPORTS.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </label>
          )}
          {category === 'gym' && (
            <label>
              Plan (months)
              <select value={form.plan_months} onChange={(e) => set('plan_months', Number(e.target.value))}>
                <option value={1}>1 Month</option>
                <option value={3}>3 Months</option>
                <option value={6}>6 Months</option>
              </select>
            </label>
          )}
          <label>
            Total Hours (package) *
            <input type="number" value={form.total_hours} onChange={(e) => set('total_hours', e.target.value)} min="0" step="0.5" placeholder="e.g. 18" />
          </label>
          <label>
            Total Amount (optional — set at close)
            <input type="number" value={form.total_amount} onChange={(e) => set('total_amount', e.target.value)} min="0" placeholder="0" />
          </label>
        </div>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Creating...' : 'Create Bulk Package'}
        </button>
      </form>
    </div>
  );
}
