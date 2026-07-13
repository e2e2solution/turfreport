import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TabBar } from '../components/BookingForm';
import TimeSlotPicker from '../components/TimeSlotPicker';
import { GymTable, SportGroupedTurfTable, FootballCoachingTable } from '../components/ReportTables';
import { DownloadButtons } from '../components/ImageActionButtons';
import {
  downloadReport, fetchReportPreview, todayISO,
  fetchBulkPackages, addBulkSession, deleteBulkSession, updateBulkSession,
  reopenBulkPackage, closeBulkPackage,
  pushOwnerReport,
} from '../api';
import { downloadReportImage, shareReportImage } from '../utils/reportImage';

const MATCH_TABS = [
  { id: 'turf', label: 'Turf' },
  { id: 'online', label: 'Online' },
  { id: 'gym', label: 'Gym' },
  { id: 'football_coaching', label: 'Football Coaching' },
];

const PAYMENT_TABS = [
  { id: 'turf', label: 'Turf' },
  { id: 'online', label: 'Online' },
];

export default function Report() {
  const [dailyDate, setDailyDate] = useState(todayISO());
  const [paymentPreviewTab, setPaymentPreviewTab] = useState('turf');
  const [dailyReport, setDailyReport] = useState(null);
  const [previewDate, setPreviewDate] = useState(todayISO());
  const [previewTab, setPreviewTab] = useState('turf');
  const [matchPreview, setMatchPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [bulkId, setBulkId] = useState('');
  const [bulkTimeSlot, setBulkTimeSlot] = useState('');
  const [bulkRemarks, setBulkRemarks] = useState('');
  const [pendingBulks, setPendingBulks] = useState([]);
  const [closedBulks, setClosedBulks] = useState([]);
  const [addingBulk, setAddingBulk] = useState(false);
  const [editingBulkSession, setEditingBulkSession] = useState(null);
  const [bulkEditForm, setBulkEditForm] = useState({ session_date: '', time_slot: '', remarks: '' });
  const [savingBulkEdit, setSavingBulkEdit] = useState(false);
  const [pushingOwner, setPushingOwner] = useState(false);
  const [ownerPushSuccess, setOwnerPushSuccess] = useState('');

  const [matchDate, setMatchDate] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [gymDate, setGymDate] = useState('');

  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [paymentFrom, setPaymentFrom] = useState('');
  const [paymentTo, setPaymentTo] = useState('');
  const [paymentPreview, setPaymentPreview] = useState(null);

  const [gymPaymentDate, setGymPaymentDate] = useState(todayISO());
  const [gymPaymentFrom, setGymPaymentFrom] = useState('');
  const [gymPaymentTo, setGymPaymentTo] = useState('');
  const [gymPaymentPreview, setGymPaymentPreview] = useState(null);

  const loadPendingBulks = () => {
    Promise.all([
      fetchBulkPackages({ status: 'PENDING' }),
      fetchBulkPackages({ status: 'CLOSED' }),
    ])
      .then(([pending, closed]) => {
        setPendingBulks(pending);
        setClosedBulks(closed);
      })
      .catch(() => {
        setPendingBulks([]);
        setClosedBulks([]);
      });
  };

  useEffect(loadPendingBulks, []);

  const loadDailyReport = async () => {
    if (!dailyDate) return alert('Select a date');
    setLoading(true);
    try {
      const data = await fetchReportPreview({
        match_date: dailyDate,
        filter_type: 'payment',
        section: 'all',
        include_bulk_pending: '1',
      });
      setDailyReport(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadMatchPreview = async () => {
    if (!previewDate) return alert('Select a date');
    setLoading(true);
    try {
      const data = await fetchReportPreview({ match_date: previewDate, section: 'all' });
      setMatchPreview(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddBulkToReport = async () => {
    if (!bulkId) return alert('Select a bulk package');
    if (!bulkTimeSlot) return alert('Select start and end time');
    setAddingBulk(true);
    try {
      const selected = [...pendingBulks, ...closedBulks].find((b) => String(b.id) === String(bulkId));
      const wasClosed = selected?.status === 'CLOSED';
      if (wasClosed) {
        await reopenBulkPackage(bulkId);
      }
      await addBulkSession(bulkId, {
        session_date: dailyDate,
        time_slot: bulkTimeSlot,
        remarks: bulkRemarks,
      });
      if (wasClosed) {
        await closeBulkPackage(bulkId);
      }
      setBulkTimeSlot('');
      setBulkRemarks('');
      loadPendingBulks();
      await loadDailyReport();
    } catch (err) {
      alert(err.message);
    } finally {
      setAddingBulk(false);
    }
  };

  const handleDeleteBulkSession = async (sessionId) => {
    if (!confirm('Remove this bulk entry from the daily report?')) return;
    try {
      await deleteBulkSession(sessionId);
      loadPendingBulks();
      await loadDailyReport();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEditBulkSession = (row) => {
    setEditingBulkSession(row);
    setBulkEditForm({
      session_date: row.match_date || row.start_date || dailyDate,
      time_slot: row.time_slot || '',
      remarks: row.remarks?.startsWith('bulk #') ? '' : (row.remarks || ''),
    });
  };

  const handleSaveBulkSessionEdit = async (e) => {
    e.preventDefault();
    if (!editingBulkSession?.bulk_session_id) return;
    if (!bulkEditForm.time_slot) return alert('Select time slot');
    setSavingBulkEdit(true);
    try {
      await updateBulkSession(editingBulkSession.bulk_session_id, bulkEditForm);
      setEditingBulkSession(null);
      loadPendingBulks();
      await loadDailyReport();
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingBulkEdit(false);
    }
  };

  const handlePushToOwner = async () => {
    if (!dailyDate) return alert('Select payment date');
    setPushingOwner(true);
    setOwnerPushSuccess('');
    try {
      const res = await pushOwnerReport(dailyDate);
      const note = res.mongo_note ? ` — ${res.mongo_note}` : '';
      setOwnerPushSuccess((res.message || `Report sent for ${dailyDate}`) + note);
    } catch (err) {
      alert(err.message);
    } finally {
      setPushingOwner(false);
    }
  };

  const loadPaymentPreview = async () => {
    if (!paymentDate) return alert('Select a date');
    setLoading(true);
    try {
      const data = await fetchReportPreview({
        match_date: paymentDate,
        filter_type: 'payment',
        section: 'turf_online',
      });
      setPaymentPreview(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadGymPaymentPreview = async () => {
    if (!gymPaymentDate) return alert('Select a date');
    setLoading(true);
    try {
      const data = await fetchReportPreview({
        match_date: gymPaymentDate,
        filter_type: 'payment',
        section: 'gym',
      });
      setGymPaymentPreview(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (params) => {
    setDownloading(true);
    try {
      await downloadReport(params);
    } catch (err) {
      alert(err.message);
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadImage = async (params, existingData = null) => {
    setDownloading(true);
    try {
      await downloadReportImage(params, existingData);
    } catch (err) {
      alert(err.message);
    } finally {
      setDownloading(false);
    }
  };

  const handleShareImage = async (params, existingData = null) => {
    setDownloading(true);
    try {
      await shareReportImage(params, existingData);
    } catch (err) {
      alert(err.message);
    } finally {
      setDownloading(false);
    }
  };

  const paymentParams = (extra = {}) => ({
    match_date: paymentDate,
    filter_type: 'payment',
    section: 'turf_online',
    ...extra,
  });

  const gymPaymentParams = (extra = {}) => ({
    match_date: gymPaymentDate,
    filter_type: 'payment',
    section: 'gym',
    ...extra,
  });

  const dailyCombined = dailyReport;
  const turfOnlineRows = dailyReport
    ? [...(dailyReport.turf || []), ...(dailyReport.online || [])]
    : [];
  const pendingBulkCount = turfOnlineRows.filter(
    (r) => r.is_bulk && r.bulk_session_id && !r.is_bulk_payment
  ).length;

  return (
    <div className="page">
      <h2>Generate Report</h2>

      <div className="card highlight-daily">
        <h3>Daily Report</h3>
        <p className="hint">Advance &amp; balance paid on this date — Turf, Online, Gym, Football Coaching — plus pending bulk entries</p>
        <label>
          Payment Date
          <input type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} />
        </label>
        <button type="button" className="btn primary" disabled={loading} onClick={loadDailyReport}>
          {loading ? 'Loading...' : 'Show Daily Report'}
        </button>
        <button
          type="button"
          className="btn owner-push-btn"
          disabled={pushingOwner || !dailyDate}
          onClick={handlePushToOwner}
        >
          {pushingOwner ? 'Sending...' : 'Send Report to Owner'}
        </button>
        {ownerPushSuccess && (
          <div className="alert success owner-push-success">{ownerPushSuccess}</div>
        )}
        <p className="hint">Owner installs mobile app from cloud URL → <strong>/owner.html</strong> (PIN: 123)</p>

        <div className="daily-bulk-add">
          <h4>Add Bulk to This Day</h4>
          <p className="hint">
            Log bulk session for this date. Closed bulks are reopened automatically, session added, then closed again (payment unchanged).
          </p>
          <label>
            Bulk Package *
            <select value={bulkId} onChange={(e) => setBulkId(e.target.value)}>
              <option value="">— Select bulk ID —</option>
              {pendingBulks.length > 0 && (
                <optgroup label="Open (Pending)">
                  {pendingBulks.map((b) => (
                    <option key={b.id} value={b.id}>
                      #{b.id} — {b.name} ({b.category}{b.sport ? `, ${b.sport}` : ''}) — {b.used_hours || 0}/{b.total_hours}h
                    </option>
                  ))}
                </optgroup>
              )}
              {closedBulks.length > 0 && (
                <optgroup label="Closed (reopen &amp; add)">
                  {closedBulks.map((b) => (
                    <option key={b.id} value={b.id}>
                      #{b.id} — {b.name} ({b.category}{b.sport ? `, ${b.sport}` : ''}) — {b.used_hours || 0}/{b.total_hours}h — CLOSED
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          {pendingBulks.length === 0 && closedBulks.length === 0 && (
            <p className="hint"><Link to="/bulk/add">Create a bulk package</Link> first.</p>
          )}
          <TimeSlotPicker value={bulkTimeSlot} onChange={setBulkTimeSlot} />
          <label>
            Remarks
            <input value={bulkRemarks} onChange={(e) => setBulkRemarks(e.target.value)} placeholder="Optional" />
          </label>
          <button type="button" className="btn small primary" disabled={addingBulk} onClick={handleAddBulkToReport}>
            {addingBulk ? 'Adding...' : 'Add Bulk to Report'}
          </button>
        </div>

        {dailyReport && (
          <>
            <div className="preview-section highlight-payment-inline">
              <h4>Turf + Online — Payments Received (Advance or Balance)</h4>
              <p className="hint">
                Paid on {dailyDate}
                {pendingBulkCount > 0 && (
                  <> · <strong>{pendingBulkCount} pending bulk</strong> (no payment — shown below)</>
                )}
              </p>
              <SportGroupedTurfTable
                rows={turfOnlineRows}
                onDeleteBulk={handleDeleteBulkSession}
                onEditBulk={handleEditBulkSession}
                emptyLabel="No turf or online records for this date"
              />
            </div>

            <div className="preview-section">
              <h4>Gym — Payments Received (Advance or Balance)</h4>
              <p className="hint">
                Paid on {dailyDate}
                {dailyReport.gym_members_joined != null && (
                  <> · <strong>{dailyReport.gym_members_joined} gym members joined</strong></>
                )}
                {' '}· includes pending bulk
              </p>
              <GymTable
                rows={dailyReport.gym}
                onDeleteBulk={handleDeleteBulkSession}
                onEditBulk={handleEditBulkSession}
              />
            </div>

            <div className="preview-section">
              <h4>Football Coaching — Payments Received (Advance or Balance)</h4>
              <p className="hint">Paid on {dailyDate}</p>
              <FootballCoachingTable rows={dailyReport.football_coaching || []} />
            </div>

            <div className="preview-actions">
              <DownloadButtons
                disabled={downloading}
                onExcel={() => handleDownload({
                  match_date: dailyDate,
                  filter_type: 'payment',
                  section: 'all',
                  include_bulk_pending: '1',
                })}
                onImage={() => handleDownloadImage({
                  match_date: dailyDate,
                  filter_type: 'payment',
                  section: 'all',
                  include_bulk_pending: '1',
                }, dailyCombined)}
                onWhatsApp={() => handleShareImage({
                  match_date: dailyDate,
                  filter_type: 'payment',
                  section: 'all',
                  include_bulk_pending: '1',
                }, dailyCombined)}
              />
            </div>
          </>
        )}
      </div>

      {editingBulkSession && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Edit Bulk Session — {editingBulkSession.name} (#{editingBulkSession.bulk_id})</h3>
          <form className="form" onSubmit={handleSaveBulkSessionEdit}>
            <label>
              Date
              <input
                type="date"
                value={bulkEditForm.session_date}
                onChange={(e) => setBulkEditForm((f) => ({ ...f, session_date: e.target.value }))}
                required
              />
            </label>
            <TimeSlotPicker
              value={bulkEditForm.time_slot}
              onChange={(v) => setBulkEditForm((f) => ({ ...f, time_slot: v }))}
            />
            <label>
              Remarks
              <input
                value={bulkEditForm.remarks}
                onChange={(e) => setBulkEditForm((f) => ({ ...f, remarks: e.target.value }))}
                placeholder="Optional"
              />
            </label>
            <div className="row-2">
              <button type="submit" className="btn primary" disabled={savingBulkEdit}>
                {savingBulkEdit ? 'Saving...' : 'Save Session'}
              </button>
              <button type="button" className="btn secondary" onClick={() => setEditingBulkSession(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h3>Table Preview — All (by match / start date)</h3>
        <p className="hint">Turf, Online, Gym &amp; Football Coaching by match / coaching month</p>
        <label>
          Date
          <input type="date" value={previewDate} onChange={(e) => setPreviewDate(e.target.value)} />
        </label>
        <button type="button" className="btn primary" disabled={loading} onClick={loadMatchPreview}>
          {loading ? 'Loading...' : 'Show Preview'}
        </button>
        {matchPreview && (
          <div className="preview-section">
            <TabBar tabs={MATCH_TABS} active={previewTab} onChange={setPreviewTab} />
            {previewTab === 'turf' && (
              <SportGroupedTurfTable rows={matchPreview.turf} emptyLabel="No turf records" />
            )}
            {previewTab === 'online' && (
              <SportGroupedTurfTable rows={matchPreview.online} emptyLabel="No online records" />
            )}
            {previewTab === 'gym' && <GymTable rows={matchPreview.gym} />}
            {previewTab === 'football_coaching' && (
              <FootballCoachingTable rows={matchPreview.football_coaching || []} />
            )}
            <div className="preview-actions">
              <button type="button" className="btn small" disabled={downloading} onClick={() => handleDownload({ match_date: previewDate, section: 'turf_online' })}>
                Excel: Turf + Online
              </button>
              <button type="button" className="btn small secondary" disabled={downloading} onClick={() => handleDownloadImage({ match_date: previewDate, section: 'turf_online' }, matchPreview)}>
                Image: Turf + Online
              </button>
              <button type="button" className="btn small whatsapp" disabled={downloading} onClick={() => handleShareImage({ match_date: previewDate, section: 'turf_online' }, matchPreview)}>
                WhatsApp: Turf + Online
              </button>
              <button type="button" className="btn small" disabled={downloading} onClick={() => handleDownload({ match_date: previewDate, section: 'gym' })}>
                Excel: Gym only
              </button>
              <button type="button" className="btn small secondary" disabled={downloading} onClick={() => handleDownloadImage({ match_date: previewDate, section: 'gym' }, matchPreview)}>
                Image: Gym only
              </button>
              <button type="button" className="btn small whatsapp" disabled={downloading} onClick={() => handleShareImage({ match_date: previewDate, section: 'gym' }, matchPreview)}>
                WhatsApp: Gym only
              </button>
              <button type="button" className="btn small" disabled={downloading} onClick={() => handleDownload({ match_date: previewDate, section: 'football_coaching' })}>
                Excel: Football Coaching
              </button>
              <button type="button" className="btn small secondary" disabled={downloading} onClick={() => handleDownloadImage({ match_date: previewDate, section: 'football_coaching' }, matchPreview)}>
                Image: Football Coaching
              </button>
              <button type="button" className="btn small whatsapp" disabled={downloading} onClick={() => handleShareImage({ match_date: previewDate, section: 'football_coaching' }, matchPreview)}>
                WhatsApp: Football Coaching
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card highlight-payment">
        <h3>Turf + Online — Payments Received (Advance or Balance)</h3>
        <p className="hint">All entries with at least one payment on this day — advance and/or balance</p>
        <label>
          Payment Date
          <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        </label>
        <div className="row-2">
          <button type="button" className="btn primary" disabled={loading} onClick={loadPaymentPreview}>
            {loading ? 'Loading...' : 'Preview Table'}
          </button>
          <DownloadButtons
            disabled={downloading}
            onExcel={() => paymentDate ? handleDownload(paymentParams()) : alert('Select date')}
            onImage={() => paymentDate ? handleDownloadImage(paymentParams(), paymentPreview) : alert('Select date')}
            onWhatsApp={() => paymentDate ? handleShareImage(paymentParams(), paymentPreview) : alert('Select date')}
          />
        </div>
        {paymentPreview && (
          <div className="preview-section">
            <TabBar tabs={PAYMENT_TABS} active={paymentPreviewTab} onChange={setPaymentPreviewTab} />
            {paymentPreviewTab === 'turf' && (
              <SportGroupedTurfTable rows={paymentPreview.turf} emptyLabel="No turf payments" />
            )}
            {paymentPreviewTab === 'online' && (
              <SportGroupedTurfTable rows={paymentPreview.online} emptyLabel="No online payments" />
            )}
          </div>
        )}
        <p className="hint" style={{ marginTop: 16 }}>Date range:</p>
        <div className="row-2">
          <label>From<input type="date" value={paymentFrom} onChange={(e) => setPaymentFrom(e.target.value)} /></label>
          <label>To<input type="date" value={paymentTo} onChange={(e) => setPaymentTo(e.target.value)} /></label>
        </div>
        <DownloadButtons
          disabled={downloading}
          onExcel={() => paymentFrom && paymentTo
            ? handleDownload(paymentParams({ match_date: undefined, from: paymentFrom, to: paymentTo }))
            : alert('Select dates')}
          onImage={() => paymentFrom && paymentTo
            ? handleDownloadImage(paymentParams({ match_date: undefined, from: paymentFrom, to: paymentTo }))
            : alert('Select dates')}
          onWhatsApp={() => paymentFrom && paymentTo
            ? handleShareImage(paymentParams({ match_date: undefined, from: paymentFrom, to: paymentTo }))
            : alert('Select dates')}
        />
      </div>

      <div className="card highlight-payment gym-highlight">
        <h3>Gym — Payments Received (Advance or Balance)</h3>
        <p className="hint">Gym only — entries with advance or balance paid on this day</p>
        <label>
          Payment Date
          <input type="date" value={gymPaymentDate} onChange={(e) => setGymPaymentDate(e.target.value)} />
        </label>
        <div className="row-2">
          <button type="button" className="btn primary" disabled={loading} onClick={loadGymPaymentPreview}>
            {loading ? 'Loading...' : 'Preview Table'}
          </button>
          <DownloadButtons
            disabled={downloading}
            onExcel={() => gymPaymentDate ? handleDownload(gymPaymentParams()) : alert('Select date')}
            onImage={() => gymPaymentDate ? handleDownloadImage(gymPaymentParams(), gymPaymentPreview) : alert('Select date')}
            onWhatsApp={() => gymPaymentDate ? handleShareImage(gymPaymentParams(), gymPaymentPreview) : alert('Select date')}
          />
        </div>
        {gymPaymentPreview && (
          <div className="preview-section">
            {gymPaymentPreview.gym_members_joined != null && (
              <p className="hint"><strong>{gymPaymentPreview.gym_members_joined} gym members joined</strong> on this payment date</p>
            )}
            <GymTable rows={gymPaymentPreview.gym} />
          </div>
        )}
        <p className="hint" style={{ marginTop: 16 }}>Date range:</p>
        <div className="row-2">
          <label>From<input type="date" value={gymPaymentFrom} onChange={(e) => setGymPaymentFrom(e.target.value)} /></label>
          <label>To<input type="date" value={gymPaymentTo} onChange={(e) => setGymPaymentTo(e.target.value)} /></label>
        </div>
        <DownloadButtons
          disabled={downloading}
          onExcel={() => gymPaymentFrom && gymPaymentTo
            ? handleDownload(gymPaymentParams({ match_date: undefined, from: gymPaymentFrom, to: gymPaymentTo }))
            : alert('Select dates')}
          onImage={() => gymPaymentFrom && gymPaymentTo
            ? handleDownloadImage(gymPaymentParams({ match_date: undefined, from: gymPaymentFrom, to: gymPaymentTo }))
            : alert('Select dates')}
          onWhatsApp={() => gymPaymentFrom && gymPaymentTo
            ? handleShareImage(gymPaymentParams({ match_date: undefined, from: gymPaymentFrom, to: gymPaymentTo }))
            : alert('Select dates')}
        />
      </div>

      <div className="card highlight-payment">
        <h3>Football Coaching — Month Report</h3>
        <p className="hint">
          Separate coaching list with month filter and image download.
          Open the full page for paid-in-month vs coaching-month views.
        </p>
        <Link to="/football-coaching" className="btn primary">
          Open Football Coaching Report
        </Link>
      </div>

      <div className="card highlight-payment">
        <h3>Online Match — Month Report</h3>
        <p className="hint">
          Online bookings for a full month — by match date or payments — with image / Excel download.
        </p>
        <Link to="/online-report" className="btn primary">
          Open Online Match Report
        </Link>
      </div>

      <div className="card highlight-payment">
        <h3>Turf Match — Month Report</h3>
        <p className="hint">
          Turf bookings for a full month — by match date or payments — with image / Excel download.
        </p>
        <Link to="/turf-report" className="btn primary">
          Open Turf Match Report
        </Link>
      </div>

      <div className="card">
        <h3>Turf + Online — By Match Date</h3>
        <label>Match Date<input type="date" value={matchDate} onChange={(e) => setMatchDate(e.target.value)} /></label>
        <DownloadButtons
          disabled={downloading}
          onExcel={() => matchDate ? handleDownload({ match_date: matchDate, section: 'turf_online' }) : alert('Select date')}
          onImage={() => matchDate ? handleDownloadImage({ match_date: matchDate, section: 'turf_online' }) : alert('Select date')}
          onWhatsApp={() => matchDate ? handleShareImage({ match_date: matchDate, section: 'turf_online' }) : alert('Select date')}
        />
      </div>

      <div className="card">
        <h3>Gym — By Start Date</h3>
        <label>Start Date<input type="date" value={gymDate} onChange={(e) => setGymDate(e.target.value)} /></label>
        <DownloadButtons
          disabled={downloading}
          onExcel={() => gymDate ? handleDownload({ match_date: gymDate, section: 'gym' }) : alert('Select date')}
          onImage={() => gymDate ? handleDownloadImage({ match_date: gymDate, section: 'gym' }) : alert('Select date')}
          onWhatsApp={() => gymDate ? handleShareImage({ match_date: gymDate, section: 'gym' }) : alert('Select date')}
        />
      </div>

      <div className="card">
        <h3>Turf + Online — Date Range</h3>
        <div className="row-2">
          <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <DownloadButtons
          disabled={downloading}
          onExcel={() => from && to ? handleDownload({ from, to, section: 'turf_online' }) : alert('Select dates')}
          onImage={() => from && to ? handleDownloadImage({ from, to, section: 'turf_online' }) : alert('Select dates')}
          onWhatsApp={() => from && to ? handleShareImage({ from, to, section: 'turf_online' }) : alert('Select dates')}
        />
      </div>

      <div className="card">
        <h3>Gym — Date Range</h3>
        <div className="row-2">
          <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <DownloadButtons
          disabled={downloading}
          onExcel={() => from && to ? handleDownload({ from, to, section: 'gym' }) : alert('Select dates')}
          onImage={() => from && to ? handleDownloadImage({ from, to, section: 'gym' }) : alert('Select dates')}
          onWhatsApp={() => from && to ? handleShareImage({ from, to, section: 'gym' }) : alert('Select dates')}
        />
      </div>
    </div>
  );
}
