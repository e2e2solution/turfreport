import { useState, useEffect } from 'react';
import TimeSlotPicker from './TimeSlotPicker';
import { PLAN_OPTIONS, calcGymEndDate, planLabel, COACHING_PERIOD_OPTIONS } from '../utils/dates';
import { todayISO } from '../api';

const SPORTS = ['cricket', 'football', 'badminton'];
const STATUSES = ['PENDING', 'CLOSED'];

export function TabBar({ tabs, active, onChange }) {
  return (
    <div className="tab-bar">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`tab${active === t.id ? ' active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function PaymentSection({ title, className, gpayField, cashField, dateField, form, set }) {
  return (
    <div className={`form-section ${className}`}>
      <h3>{title}</h3>
      <div className="row-2">
        <label>
          GPay
          <input type="number" value={form[gpayField]} onChange={(e) => set(gpayField, e.target.value)} min="0" placeholder="0" />
        </label>
        <label>
          Cash
          <input type="number" value={form[cashField]} onChange={(e) => set(cashField, e.target.value)} min="0" placeholder="0" />
        </label>
      </div>
      <label>
        Date
        <input type="date" value={form[dateField]} onChange={(e) => set(dateField, e.target.value)} />
      </label>
    </div>
  );
}

export function BookingForm({ initial, onSubmit, submitLabel = 'Save' }) {
  const empty = {
    name: '', sport: 'cricket', match_date: '', total: '', time_slot: '',
    advance_gpay: '', advance_cash: '', advance_date: '',
    balance_gpay: '', balance_cash: '', balance_date: '',
    status: 'PENDING', remarks: '',
  };
  const [form, setForm] = useState({ ...empty, ...initial });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.match_date) { setError('Match date is required'); return; }
    if (!form.time_slot) { setError('Please select both start and end time'); return; }
    setSaving(true);
    try { await onSubmit(form); } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      {error && <div className="alert error">{error}</div>}
      <div className="form-section">
        <h3>Match Details</h3>
        <label>Name *<input value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="Customer name" /></label>
        <label>Sport *
          <select value={form.sport} onChange={(e) => set('sport', e.target.value)}>
            {SPORTS.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </label>
        <label>Match Date *<input type="date" value={form.match_date} onChange={(e) => set('match_date', e.target.value)} required /></label>
        <label>Total Amount *<input type="number" value={form.total} onChange={(e) => set('total', e.target.value)} required min="0" /></label>
        <TimeSlotPicker value={form.time_slot} onChange={(v) => set('time_slot', v)} />
      </div>
      <PaymentSection title="Advance Paid (optional)" className="advance" gpayField="advance_gpay" cashField="advance_cash" dateField="advance_date" form={form} set={set} />
      <PaymentSection title="Balance Paid" className="balance" gpayField="balance_gpay" cashField="balance_cash" dateField="balance_date" form={form} set={set} />
      <div className="form-section">
        <label>Status
          <select value={form.status} onChange={(e) => set('status', e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>Remarks<textarea value={form.remarks} onChange={(e) => set('remarks', e.target.value)} rows={2} /></label>
      </div>
      <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving...' : submitLabel}</button>
    </form>
  );
}

export function OnlineForm({ initial, onSubmit, submitLabel = 'Save' }) {
  const empty = {
    name: '', sport: 'cricket', match_date: '', total: '', time_slot: '',
    advance_gpay: '', advance_cash: '', advance_date: '',
    balance_gpay: '', balance_cash: '', balance_date: '',
    status: 'PENDING', remarks: '',
  };
  const merged = { ...empty, ...initial };
  if (initial?.online_gpay && !initial.advance_gpay) {
    merged.advance_gpay = initial.online_gpay;
    merged.advance_cash = initial.online_cash || '';
    merged.advance_date = initial.online_date || '';
  }
  const [form, setForm] = useState(merged);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.match_date) { setError('Match date is required'); return; }
    if (!form.time_slot) { setError('Please select start and end time'); return; }
    setSaving(true);
    try { await onSubmit(form); } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      {error && <div className="alert error">{error}</div>}
      <div className="form-section">
        <h3>Online Booking Details</h3>
        <label>Name *<input value={form.name} onChange={(e) => set('name', e.target.value)} required /></label>
        <label>Sport *
          <select value={form.sport} onChange={(e) => set('sport', e.target.value)}>
            {SPORTS.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </label>
        <label>Match Date *<input type="date" value={form.match_date} onChange={(e) => set('match_date', e.target.value)} required /></label>
        <label>Total Amount *<input type="number" value={form.total} onChange={(e) => set('total', e.target.value)} required min="0" /></label>
        <TimeSlotPicker value={form.time_slot} onChange={(v) => set('time_slot', v)} />
      </div>
      <PaymentSection title="Advance Paid (optional)" className="advance" gpayField="advance_gpay" cashField="advance_cash" dateField="advance_date" form={form} set={set} />
      <PaymentSection title="Balance Paid" className="balance" gpayField="balance_gpay" cashField="balance_cash" dateField="balance_date" form={form} set={set} />
      <div className="form-section">
        <label>Status
          <select value={form.status} onChange={(e) => set('status', e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>Remarks<textarea value={form.remarks} onChange={(e) => set('remarks', e.target.value)} rows={2} /></label>
      </div>
      <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving...' : submitLabel}</button>
    </form>
  );
}

export function GymForm({ initial, onSubmit, submitLabel = 'Save' }) {
  const empty = {
    name: '', plan_months: 1, start_date: todayISO(), end_date: '',
    total: '', personal_training_amount: '',
    advance_gpay: '', advance_cash: '', advance_date: '',
    balance_gpay: '', balance_cash: '', balance_date: '',
    status: 'PENDING', remarks: '',
  };
  const merged = { ...empty, ...initial };
  if (initial?.gym_date && !initial.start_date) {
    merged.start_date = initial.gym_date;
  }
  if (!merged.end_date && merged.start_date) {
    merged.end_date = calcGymEndDate(merged.start_date, merged.plan_months || 1);
  }
  const [form, setForm] = useState(merged);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (form.start_date && form.plan_months) {
      const end = calcGymEndDate(form.start_date, form.plan_months);
      setForm((f) => (f.end_date === end ? f : { ...f, end_date: end }));
    }
  }, [form.start_date, form.plan_months]);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.start_date) { setError('Start date is required'); return; }
    setSaving(true);
    try { await onSubmit(form); } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      {error && <div className="alert error">{error}</div>}
      <div className="form-section">
        <h3>Gym Details</h3>
        <label>Name *<input value={form.name} onChange={(e) => set('name', e.target.value)} required /></label>
        <label>Plan *
          <select value={form.plan_months} onChange={(e) => set('plan_months', Number(e.target.value))}>
            {PLAN_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
        <label>Start Date *
          <input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} required />
        </label>
        <label>End Date (auto)
          <input type="date" value={form.end_date} readOnly className="readonly" />
        </label>
        <p className="hint">End date is the last day of the {planLabel(form.plan_months)} period.</p>
        <label>Total Amount *<input type="number" value={form.total} onChange={(e) => set('total', e.target.value)} required min="0" /></label>
        <label>Personal Training Amount<input type="number" value={form.personal_training_amount} onChange={(e) => set('personal_training_amount', e.target.value)} min="0" placeholder="0" /></label>
      </div>
      <PaymentSection title="Advance Paid (optional)" className="advance" gpayField="advance_gpay" cashField="advance_cash" dateField="advance_date" form={form} set={set} />
      <PaymentSection title="Balance Paid" className="balance" gpayField="balance_gpay" cashField="balance_cash" dateField="balance_date" form={form} set={set} />
      <div className="form-section">
        <label>Status
          <select value={form.status} onChange={(e) => set('status', e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>Remarks<textarea value={form.remarks} onChange={(e) => set('remarks', e.target.value)} rows={2} /></label>
      </div>
      <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving...' : submitLabel}</button>
    </form>
  );
}

function currentMonthISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function FootballCoachingForm({ initial, onSubmit, submitLabel = 'Save' }) {
  const empty = {
    name: '', parent_name: '', phone: '', coaching_month: currentMonthISO(), period: 'full', total: '',
    advance_gpay: '', advance_cash: '', advance_date: '',
    balance_gpay: '', balance_cash: '', balance_date: '',
    status: 'PENDING', remarks: '',
  };
  const [form, setForm] = useState({ ...empty, ...initial });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.coaching_month) { setError('Coaching month is required'); return; }
    setSaving(true);
    try { await onSubmit(form); } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      {error && <div className="alert error">{error}</div>}
      <div className="form-section">
        <h3>Football Coaching Details</h3>
        <label>Child&apos;s Name *<input value={form.name} onChange={(e) => set('name', e.target.value)} required /></label>
        <label>Parent Name<input value={form.parent_name} onChange={(e) => set('parent_name', e.target.value)} placeholder="Parent / guardian name" /></label>
        <label>Phone Number<input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="10-digit mobile" /></label>
        <label>Coaching Month *
          <input type="month" value={form.coaching_month} onChange={(e) => set('coaching_month', e.target.value)} required />
        </label>
        <label>Period *
          <select value={form.period} onChange={(e) => set('period', e.target.value)}>
            {COACHING_PERIOD_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
        <p className="hint">Choose 1st or 2nd half if the child joins mid-month.</p>
        <label>Total Amount *<input type="number" value={form.total} onChange={(e) => set('total', e.target.value)} required min="0" /></label>
      </div>
      <PaymentSection title="Advance Paid (optional)" className="advance" gpayField="advance_gpay" cashField="advance_cash" dateField="advance_date" form={form} set={set} />
      <PaymentSection title="Balance Paid" className="balance" gpayField="balance_gpay" cashField="balance_cash" dateField="balance_date" form={form} set={set} />
      <div className="form-section">
        <label>Status
          <select value={form.status} onChange={(e) => set('status', e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>Remarks<textarea value={form.remarks} onChange={(e) => set('remarks', e.target.value)} rows={2} /></label>
      </div>
      <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving...' : submitLabel}</button>
    </form>
  );
}
