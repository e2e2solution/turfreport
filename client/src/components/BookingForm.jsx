import { useState, useEffect, useCallback } from 'react';
import TimeSlotPicker from './TimeSlotPicker';
import NameHistoryInput from './NameHistoryInput';
import { PLAN_OPTIONS, calcGymEndDate, planLabel, COACHING_PERIOD_OPTIONS } from '../utils/dates';
import { SPORTS, sportLabel } from '../utils/sports';
import {
  todayISO,
  searchBookingNames,
  searchOnlineNames,
  searchGymNames,
  searchFootballCoachingNames,
  fetchBookings,
  fetchGymEntries,
} from '../api';

const STATUSES = ['PENDING', 'CLOSED'];

function applyHistory(setForm, autofill = {}) {
  setForm((current) => ({
    ...current,
    ...autofill,
  }));
}

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

const ONLINE_PAYMENT_METHODS = [
  { value: 'DIRECT_GPAY', label: 'Direct GPay' },
  { value: 'MPAY', label: 'mPay' },
  { value: 'ONLINE_PAY', label: 'Online Pay' },
];

function expectedOnlineCreditDate(paymentDate, method) {
  if (!paymentDate) return '';
  if (method === 'DIRECT_GPAY') return paymentDate;
  const date = new Date(`${paymentDate}T00:00:00`);
  if (method === 'MPAY') date.setDate(date.getDate() + 2);
  if (method === 'ONLINE_PAY') date.setMonth(date.getMonth() + 1, 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function OnlinePaymentSection({
  title,
  className,
  amountField,
  dateField,
  methodField,
  expectedField,
  form,
  set,
}) {
  const method = form[methodField] || 'DIRECT_GPAY';
  const updateDate = (value) => {
    set(dateField, value);
    set(expectedField, expectedOnlineCreditDate(value, method));
  };
  const updateMethod = (value) => {
    set(methodField, value);
    set(expectedField, expectedOnlineCreditDate(form[dateField], value));
  };

  return (
    <div className={`form-section ${className}`}>
      <h3>{title}</h3>
      <label>
        Payment Method
        <select value={method} onChange={(e) => updateMethod(e.target.value)}>
          {ONLINE_PAYMENT_METHODS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <div className="row-2">
        <label>
          Amount
          <input
            type="number"
            value={form[amountField]}
            onChange={(e) => set(amountField, e.target.value)}
            min="0"
            placeholder="0"
          />
        </label>
        <label>
          Payment Date
          <input type="date" value={form[dateField]} onChange={(e) => updateDate(e.target.value)} />
        </label>
      </div>
      <label>
        {method === 'DIRECT_GPAY' ? 'Bank Credit Date' : 'Expected Credit Date'}
        <input
          type="date"
          value={form[expectedField] || ''}
          onChange={(e) => set(expectedField, e.target.value)}
        />
      </label>
      {method === 'MPAY' && <p className="hint">mPay normally credits after 2 days. You can adjust the expected date.</p>}
      {method === 'ONLINE_PAY' && <p className="hint">Online Pay normally credits at the start of next month. You can adjust the expected date.</p>}
      {method === 'DIRECT_GPAY' && <p className="hint">Direct GPay is counted in collection on the payment date.</p>}
    </div>
  );
}

export function BookingForm({ initial, onSubmit, submitLabel = 'Save', enableNameHistory = false }) {
  const empty = {
    name: '', sport: 'cricket', match_date: '', total: '', time_slot: '',
    advance_gpay: '', advance_cash: '', advance_date: '',
    balance_gpay: '', balance_cash: '', balance_date: '',
    status: 'PENDING', remarks: '',
    link_booking_id: '',
  };
  const [form, setForm] = useState({ ...empty, ...initial, link_booking_id: initial?.link_booking_id || '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [linkOptions, setLinkOptions] = useState([]);
  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));
  const searchNames = useCallback((q) => searchBookingNames(q), []);

  useEffect(() => {
    let cancelled = false;
    async function loadLinkOptions() {
      if (!form.match_date) {
        setLinkOptions([]);
        return;
      }
      try {
        const rows = await fetchBookings({
          match_date: form.match_date,
          ...(initial?.id ? { exclude_id: initial.id } : {}),
        });
        if (cancelled) return;
        setLinkOptions(rows || []);
        // Prefill linked partner when editing an already-linked booking
        if (initial?.link_group_id && !form.link_booking_id) {
          const partner = (rows || []).find((r) => r.link_group_id === initial.link_group_id);
          if (partner) setForm((f) => ({ ...f, link_booking_id: String(partner.id) }));
        }
      } catch {
        if (!cancelled) setLinkOptions([]);
      }
    }
    loadLinkOptions();
    return () => { cancelled = true; };
  }, [form.match_date, initial?.id, initial?.link_group_id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.match_date) { setError('Match date is required'); return; }
    if (!form.time_slot) { setError('Please select both start and end time'); return; }
    if (form.total === '' || form.total == null) { setError('Total amount is required (use 0 if amount is on the linked booking)'); return; }
    setSaving(true);
    try {
      await onSubmit({
        ...form,
        link_booking_id: form.link_booking_id === '' ? '' : form.link_booking_id,
      });
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      {error && <div className="alert error">{error}</div>}
      <div className="form-section">
        <h3>Match Details</h3>
        {enableNameHistory ? (
          <NameHistoryInput
            label="Name *"
            value={form.name}
            onChange={(v) => set('name', v)}
            onPick={(hint) => applyHistory(setForm, hint.autofill)}
            searchFn={searchNames}
            required
            placeholder="Customer name"
          />
        ) : (
          <label>Name *<input value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="Customer name" /></label>
        )}
        <label>Sport *
          <select value={form.sport} onChange={(e) => set('sport', e.target.value)}>
            {SPORTS.map((s) => <option key={s} value={s}>{sportLabel(s)}</option>)}
          </select>
        </label>
        <label>Match Date *<input type="date" value={form.match_date} onChange={(e) => set('match_date', e.target.value)} required /></label>
        <label>Total Amount *<input type="number" value={form.total} onChange={(e) => set('total', e.target.value)} required min="0" /></label>
        <TimeSlotPicker value={form.time_slot} onChange={(v) => set('time_slot', v)} />
        <label>
          Link to booking (same day)
          <select
            value={form.link_booking_id || ''}
            onChange={(e) => set('link_booking_id', e.target.value)}
          >
            <option value="">— None —</option>
            {linkOptions.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.id} · {r.name} · {r.sport} · {r.time_slot}
                {(Number(r.total) || 0) > 0 ? ` · ₹${r.total}` : ' · no amount'}
              </option>
            ))}
          </select>
        </label>
        <p className="hint">
          For combined pay (e.g. football + badminton): enter the full amount on one booking,
          leave total 0 on the other, and link them. Daily report highlights both in the same colour;
          collection uses only the booking where amount/payment is entered.
        </p>
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

export function OnlineForm({ initial, onSubmit, submitLabel = 'Save', enableNameHistory = false }) {
  const empty = {
    name: '', sport: 'cricket', match_date: '', total: '', time_slot: '',
    advance_gpay: '', advance_cash: '', advance_date: '',
    advance_method: 'DIRECT_GPAY', advance_expected_credit_date: '',
    balance_gpay: '', balance_cash: '', balance_date: '',
    balance_method: 'DIRECT_GPAY', balance_expected_credit_date: '',
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
  const searchNames = useCallback((q) => searchOnlineNames(q), []);

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
        {enableNameHistory ? (
          <NameHistoryInput
            label="Name *"
            value={form.name}
            onChange={(v) => set('name', v)}
            onPick={(hint) => applyHistory(setForm, hint.autofill)}
            searchFn={searchNames}
            required
          />
        ) : (
          <label>Name *<input value={form.name} onChange={(e) => set('name', e.target.value)} required /></label>
        )}
        <label>Sport *
          <select value={form.sport} onChange={(e) => set('sport', e.target.value)}>
            {SPORTS.map((s) => <option key={s} value={s}>{sportLabel(s)}</option>)}
          </select>
        </label>
        <label>Match Date *<input type="date" value={form.match_date} onChange={(e) => set('match_date', e.target.value)} required /></label>
        <label>Total Amount *<input type="number" value={form.total} onChange={(e) => set('total', e.target.value)} required min="0" /></label>
        <TimeSlotPicker value={form.time_slot} onChange={(v) => set('time_slot', v)} />
      </div>
      <OnlinePaymentSection
        title="Advance Payment (optional)"
        className="advance"
        amountField="advance_gpay"
        dateField="advance_date"
        methodField="advance_method"
        expectedField="advance_expected_credit_date"
        form={form}
        set={set}
      />
      <OnlinePaymentSection
        title="Balance Payment"
        className="balance"
        amountField="balance_gpay"
        dateField="balance_date"
        methodField="balance_method"
        expectedField="balance_expected_credit_date"
        form={form}
        set={set}
      />
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

export function GymForm({ initial, onSubmit, submitLabel = 'Save', enableNameHistory = false }) {
  const empty = {
    name: '', plan_months: 1, start_date: todayISO(), end_date: '',
    total: '', personal_training_amount: '',
    advance_gpay: '', advance_cash: '', advance_date: '',
    balance_gpay: '', balance_cash: '', balance_date: '',
    status: 'PENDING', remarks: '',
    link_gym_id: '',
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
  const [linkOptions, setLinkOptions] = useState([]);
  const searchNames = useCallback((q) => searchGymNames(q), []);

  useEffect(() => {
    let cancelled = false;
    fetchGymEntries()
      .then((rows) => {
        if (cancelled) return;
        const list = (rows || []).filter((r) => !initial?.id || r.id !== initial.id);
        setLinkOptions(list);
        if (initial?.link_group_id && !form.link_gym_id) {
          const partner = list.find((r) => r.link_group_id === initial.link_group_id);
          if (partner) setForm((f) => ({ ...f, link_gym_id: String(partner.id) }));
        }
      })
      .catch(() => {
        if (!cancelled) setLinkOptions([]);
      });
    return () => { cancelled = true; };
  }, [initial?.id, initial?.link_group_id]);

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
        {enableNameHistory ? (
          <NameHistoryInput
            label="Name *"
            value={form.name}
            onChange={(v) => set('name', v)}
            onPick={(hint) => applyHistory(setForm, hint.autofill)}
            searchFn={searchNames}
            required
          />
        ) : (
          <label>Name *<input value={form.name} onChange={(e) => set('name', e.target.value)} required /></label>
        )}
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
        <label>
          Link previous package
          <select value={form.link_gym_id || ''} onChange={(e) => set('link_gym_id', e.target.value)}>
            <option value="">— None —</option>
            {linkOptions.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.id} · {r.name} · {planLabel(r.plan_months)} · {r.start_date}
                {r.status === 'PENDING' ? ' · pending' : ''}
              </option>
            ))}
          </select>
        </label>
        <p className="hint">
          If today’s payment includes an old balance plus this month’s fee (example: June 3-month balance ₹2000 + this month 1-month = ₹3000),
          put ₹2000 as balance on the old record with today’s date, put this month’s fee on this record with today’s date, then link them.
          Daily report shows both. This month’s 1-month list also shows the linked old balance.
        </p>
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

export function FootballCoachingForm({ initial, onSubmit, submitLabel = 'Save', enableNameHistory = false }) {
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
  const searchNames = useCallback((q) => searchFootballCoachingNames(q), []);

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
        {enableNameHistory ? (
          <NameHistoryInput
            label="Child's Name *"
            value={form.name}
            onChange={(v) => set('name', v)}
            onPick={(hint) => applyHistory(setForm, hint.autofill)}
            searchFn={searchNames}
            required
            placeholder="Child name"
          />
        ) : (
          <label>Child&apos;s Name *<input value={form.name} onChange={(e) => set('name', e.target.value)} required /></label>
        )}
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
