import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createOnlineSettlement,
  deleteOnlineSettlement,
  fetchOnlineSettlementCandidates,
  fetchOnlineSettlements,
  formatCurrency,
  formatDateDMY,
  pushOwnerReport,
  todayISO,
  updateOnlineSettlement,
} from '../api';
import { downloadElementImage } from '../utils/captureImage';

function monthBounds() {
  const today = todayISO();
  const month = today.slice(0, 7);
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

const defaultBounds = monthBounds();

function methodLabel(value) {
  return {
    MPAY: 'mPay',
    ONLINE_PAY: 'Online Pay',
    MIXED: 'Mixed',
  }[value] || value;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export default function OnlineSettlements() {
  const [from, setFrom] = useState(defaultBounds.from);
  const [to, setTo] = useState(defaultBounds.to);
  const [candidates, setCandidates] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [selected, setSelected] = useState({});
  const [creditDate, setCreditDate] = useState(todayISO());
  const [creditedTotal, setCreditedTotal] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [error, setError] = useState('');
  const reportRef = useRef(null);
  const settlementRefs = useRef({});

  const setSettlementRef = (id, node) => {
    if (node) settlementRefs.current[id] = node;
    else delete settlementRefs.current[id];
  };

  const load = async () => {
    if (!from || !to) return;
    setLoading(true);
    setError('');
    try {
      const [candidateRows, settlementRows] = await Promise.all([
        fetchOnlineSettlementCandidates({ from, to }),
        // Settlements by credit date: include match range + current credit date window.
        fetchOnlineSettlements({
          from: [from, creditDate].sort()[0],
          to: [to, creditDate].sort()[1],
        }),
      ]);
      setCandidates(candidateRows);
      setSettlements(settlementRows);
    } catch (err) {
      setError(err.message);
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Initial current-month load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedRows = useMemo(
    () => candidates.filter((row) => selected[row.candidate_id]?.checked),
    [candidates, selected],
  );
  const grossSelected = useMemo(
    () => roundMoney(selectedRows.reduce(
      (sum, row) => sum + Number(selected[row.candidate_id]?.expected_amount || 0),
      0,
    )),
    [selectedRows, selected],
  );
  const splitTotal = useMemo(
    () => roundMoney(selectedRows.reduce(
      (sum, row) => sum + Number(selected[row.candidate_id]?.received_amount || 0),
      0,
    )),
    [selectedRows, selected],
  );
  const creditedNumber = Number(creditedTotal);
  const commission = Number.isFinite(creditedNumber) && creditedTotal !== ''
    ? Math.max(0, roundMoney(grossSelected - creditedNumber))
    : Math.max(0, roundMoney(grossSelected - splitTotal));
  const settlementTotals = useMemo(
    () => settlements.reduce(
      (sum, item) => ({
        gross: sum.gross + (Number(item.gross_amount) || 0),
        received: sum.received + (Number(item.received_amount) || 0),
        commission: sum.commission + (Number(item.commission_amount) || 0),
      }),
      { gross: 0, received: 0, commission: 0 },
    ),
    [settlements],
  );
  const splitMatchesCredit = creditedTotal !== ''
    && Number.isFinite(creditedNumber)
    && Math.abs(creditedNumber - splitTotal) <= 0.01;

  const applySplit = (rows, nextSelected, total) => {
    const safeTotal = roundMoney(total);
    const gross = roundMoney(rows.reduce(
      (sum, row) => sum + Number(nextSelected[row.candidate_id]?.expected_amount || 0),
      0,
    ));
    if (!rows.length || gross <= 0) return nextSelected;

    const capped = Math.min(safeTotal, gross);
    let remaining = capped;
    rows.forEach((row, index) => {
      const expected = Number(nextSelected[row.candidate_id]?.expected_amount || 0);
      const value = index === rows.length - 1
        ? remaining
        : roundMoney((capped * expected) / gross);
      nextSelected[row.candidate_id] = {
        ...nextSelected[row.candidate_id],
        checked: true,
        received_amount: Math.max(0, value),
      };
      remaining = roundMoney(remaining - value);
    });
    return nextSelected;
  };

  const toggleCandidate = (row, checked) => {
    setSelected((current) => {
      const next = {
        ...current,
        [row.candidate_id]: {
          checked,
          expected_amount: checked ? row.outstanding_amount : 0,
          received_amount: checked ? row.outstanding_amount : 0,
        },
      };
      if (!checked) return next;

      const rows = candidates.filter((item) => (
        item.candidate_id === row.candidate_id || next[item.candidate_id]?.checked
      ));
      if (creditedTotal !== '' && Number.isFinite(Number(creditedTotal))) {
        return applySplit(rows, next, Number(creditedTotal));
      }
      return next;
    });
    setError('');
  };

  const selectAll = () => {
    const next = {};
    candidates.forEach((row) => {
      next[row.candidate_id] = {
        checked: true,
        expected_amount: row.outstanding_amount,
        received_amount: row.outstanding_amount,
      };
    });
    if (creditedTotal !== '' && Number.isFinite(Number(creditedTotal))) {
      setSelected(applySplit(candidates, next, Number(creditedTotal)));
    } else {
      setSelected(next);
      setCreditedTotal(String(roundMoney(candidates.reduce((sum, row) => sum + row.outstanding_amount, 0))));
    }
    setError('');
  };

  const clearSelection = () => {
    setSelected({});
    setError('');
  };

  const setAllocation = (row, field, value) => {
    setSelected((current) => {
      const prev = current[row.candidate_id] || {};
      return {
        ...current,
        [row.candidate_id]: {
          expected_amount: prev.expected_amount ?? row.outstanding_amount,
          received_amount: prev.received_amount ?? row.outstanding_amount,
          ...prev,
          checked: true,
          [field]: value,
        },
      };
    });
    setError('');
  };

  const autoSplit = () => {
    const total = Number(creditedTotal);
    if (!selectedRows.length) {
      setError('Select at least one payment first (or click Select All).');
      return;
    }
    if (!Number.isFinite(total) || creditedTotal === '' || total < 0) {
      setError('Enter the Total Amount Credited (bank amount after commission).');
      return;
    }
    if (grossSelected <= 0 || total > grossSelected + 0.01) {
      setError(`Credited total (${formatCurrency(total)}) cannot exceed selected gross (${formatCurrency(grossSelected)}).`);
      return;
    }
    setSelected((current) => applySplit(selectedRows, { ...current }, total));
    setError('');
  };

  const onCreditedTotalChange = (value) => {
    setCreditedTotal(value);
    setError('');
    const total = Number(value);
    if (!selectedRows.length || value === '' || !Number.isFinite(total) || total < 0) return;
    if (total > grossSelected + 0.01) return;
    setSelected((current) => applySplit(selectedRows, { ...current }, total));
  };

  const resetForm = () => {
    setSelected({});
    setCreditedTotal('');
    setCreditDate(todayISO());
    setReference('');
    setNotes('');
    setEditingId(null);
    setError('');
  };

  const save = async (e) => {
    e.preventDefault();
    setError('');

    if (!selectedRows.length) {
      setError('Select at least one mPay / Online Pay payment.');
      return;
    }
    if (creditedTotal === '' || !Number.isFinite(Number(creditedTotal))) {
      setError('Enter Total Amount Credited (what the bank actually sent).');
      return;
    }
    if (Number(creditedTotal) > grossSelected + 0.01) {
      setError('Credited total cannot be more than selected gross.');
      return;
    }

    let workingSelected = { ...selected };
    if (!splitMatchesCredit) {
      workingSelected = applySplit(selectedRows, workingSelected, Number(creditedTotal));
      setSelected(workingSelected);
    }

    const allocations = selectedRows.map((row) => ({
      online_booking_id: row.online_booking_id,
      payment_stage: row.payment_stage,
      expected_amount: Number(workingSelected[row.candidate_id].expected_amount),
      received_amount: Number(workingSelected[row.candidate_id].received_amount),
    }));
    const receivedSum = roundMoney(allocations.reduce((sum, item) => sum + item.received_amount, 0));
    if (Math.abs(Number(creditedTotal) - receivedSum) > 0.01) {
      setError('Could not split the credited total across selected matches. Adjust amounts manually.');
      return;
    }

    const payload = {
      from_date: from,
      to_date: to,
      credit_date: creditDate,
      received_amount: receivedSum,
      reference,
      notes,
      allocations,
    };

    setSaving(true);
    try {
      if (editingId) {
        await updateOnlineSettlement(editingId, payload);
      } else {
        await createOnlineSettlement(payload);
      }
      let ownerNote = '';
      try {
        await pushOwnerReport(creditDate);
        ownerNote = ' Owner report updated for the credit date.';
      } catch {
        ownerNote = ' Saved locally; use Send Report to Owner for this credit date.';
      }
      alert(`Saved. Commission: ${formatCurrency(Math.max(0, grossSelected - receivedSum))}.${ownerNote}`);
      resetForm();
      await load();
    } catch (err) {
      setError(err.message);
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const editSettlement = async (settlement) => {
    const existingCandidates = new Map(candidates.map((row) => [row.candidate_id, row]));
    const additions = [];
    const nextSelected = {};
    for (const allocation of settlement.allocations || []) {
      const candidateId = `${allocation.online_booking_id}:${allocation.payment_stage}`;
      if (!existingCandidates.has(candidateId)) {
        additions.push({
          candidate_id: candidateId,
          online_booking_id: allocation.online_booking_id,
          payment_stage: allocation.payment_stage,
          name: allocation.name,
          sport: allocation.sport,
          match_date: allocation.match_date,
          time_slot: allocation.time_slot,
          method: allocation.method || (settlement.source === 'MIXED' ? 'MPAY' : settlement.source),
          paid_date: null,
          expected_credit_date: settlement.credit_date,
          payment_amount: allocation.expected_amount,
          already_settled_gross: 0,
          outstanding_amount: allocation.expected_amount,
        });
      }
      nextSelected[candidateId] = {
        checked: true,
        expected_amount: allocation.expected_amount,
        received_amount: allocation.received_amount,
      };
    }
    setCandidates((rows) => [...additions, ...rows]);
    setSelected(nextSelected);
    setEditingId(settlement.id);
    setCreditDate(settlement.credit_date);
    setCreditedTotal(String(settlement.received_amount));
    setReference(settlement.reference || '');
    setNotes(settlement.notes || '');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const removeSettlement = async (settlement) => {
    if (!confirm(`Delete settlement #${settlement.id}? Its matches become available again.`)) return;
    try {
      await deleteOnlineSettlement(settlement.id);
      await load();
    } catch (err) {
      alert(err.message);
    }
  };

  const captureSettlementImage = async (settlement) => {
    const el = settlementRefs.current[settlement.id];
    if (!el) throw new Error('Settlement block not ready');
    el.classList.add('online-credit-report-export');
    try {
      await downloadElementImage(
        el,
        `online-credit-${settlement.credit_date}-received-${Math.round(Number(settlement.received_amount) || 0)}.png`,
      );
    } finally {
      el.classList.remove('online-credit-report-export');
    }
  };

  const downloadSettlement = async (settlement) => {
    setDownloadingId(settlement.id);
    try {
      await captureSettlementImage(settlement);
    } catch (err) {
      alert(err.message);
    } finally {
      setDownloadingId(null);
    }
  };

  const downloadEachAmount = async () => {
    if (!settlements.length) return;
    setDownloading(true);
    try {
      for (const settlement of settlements) {
        await captureSettlementImage(settlement);
        // Small pause so browsers finish each download cleanly.
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setDownloading(false);
    }
  };

  const downloadFullReport = async () => {
    if (!reportRef.current) return;
    setDownloading(true);
    const el = reportRef.current;
    el.classList.add('online-credit-report-export');
    try {
      await downloadElementImage(
        el,
        `online-credit-report-${from}-to-${to}.png`,
      );
    } catch (err) {
      alert(err.message);
    } finally {
      el.classList.remove('online-credit-report-export');
      setDownloading(false);
    }
  };

  return (
    <div className="page">
      <div className="card-title-row">
        <h2>Online Credits &amp; Commission</h2>
        <div className="card-actions">
          <Link to="/add?tab=online" className="btn small">Add Online Match</Link>
          <Link to="/online-report" className="btn small">Online Match Report</Link>
        </div>
      </div>

      <div className="card">
        <h3>1. Choose online matches</h3>
        <p className="hint">
          Load unsettled mPay / Online Pay by match date. Direct GPay is already in totals and will not appear here.
        </p>
        <div className="row-2">
          <label>Match From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>Match To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <button type="button" className="btn primary" disabled={loading} onClick={load}>
          {loading ? 'Loading...' : 'Load Online Payments'}
        </button>
      </div>

      <form className="card form" onSubmit={save}>
        <h3>2. Enter bank credit, then split</h3>
        <p className="hint">
          Enter the amount bank credited (after commission). Tick matches (or Select All). Split fills automatically.
          Commission = Selected Gross − Bank Credited.
        </p>
        <div className="row-2">
          <label>Actual Credit Date *
            <input type="date" value={creditDate} onChange={(e) => setCreditDate(e.target.value)} required />
          </label>
          <label>Total Amount Credited (after commission) *
            <input
              type="number"
              min="0"
              step="0.01"
              value={creditedTotal}
              onChange={(e) => onCreditedTotalChange(e.target.value)}
              placeholder="e.g. 1700"
              required
            />
          </label>
        </div>
        <div className="row-2">
          <label>Bank / Settlement Reference
            <input value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
          <label>Notes
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>

        {error && <div className="alert error">{error}</div>}

        {!candidates.length ? (
          <p className="muted">No unsettled mPay or Online Pay payments in this match range.</p>
        ) : (
          <>
            <div className="card-actions" style={{ marginBottom: 8 }}>
              <button type="button" className="btn small" onClick={selectAll}>Select All</button>
              <button type="button" className="btn small" onClick={clearSelection}>Clear</button>
              <button type="button" className="btn small" onClick={autoSplit}>Auto Split Now</button>
            </div>
            <div className="table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Select</th><th>Match</th><th>Method</th><th>Payment</th>
                    <th>Expected Gross</th><th>Split Received</th><th>Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((row) => {
                    const allocation = selected[row.candidate_id] || {};
                    const checked = Boolean(allocation.checked);
                    const expected = checked
                      ? Number(allocation.expected_amount || 0)
                      : Number(row.outstanding_amount || 0);
                    const received = checked ? Number(allocation.received_amount || 0) : 0;
                    const rowCommission = checked ? Math.max(0, roundMoney(expected - received)) : 0;
                    return (
                      <tr key={row.candidate_id} className={checked ? 'bulk-pending-row' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => toggleCandidate(row, e.target.checked)}
                          />
                        </td>
                        <td>
                          <strong>{row.name}</strong><br />
                          <small>{formatDateDMY(row.match_date)} · {row.time_slot}</small>
                        </td>
                        <td>{methodLabel(row.method)}<br /><small>{row.payment_stage}</small></td>
                        <td>
                          {formatCurrency(row.payment_amount)}<br />
                          <small>Paid {formatDateDMY(row.paid_date)}</small><br />
                          <small>Expected {formatDateDMY(row.expected_credit_date)}</small>
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max={row.outstanding_amount}
                            step="0.01"
                            value={checked ? (allocation.expected_amount ?? '') : ''}
                            placeholder={String(row.outstanding_amount)}
                            onFocus={() => {
                              if (!checked) toggleCandidate(row, true);
                            }}
                            onChange={(e) => setAllocation(row, 'expected_amount', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={checked ? (allocation.received_amount ?? '') : ''}
                            placeholder="0"
                            onFocus={() => {
                              if (!checked) toggleCandidate(row, true);
                            }}
                            onChange={(e) => setAllocation(row, 'received_amount', e.target.value)}
                          />
                        </td>
                        <td>{formatCurrency(rowCommission)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="stat-grid">
          <div className="stat-card"><span className="stat-label">Selected Gross</span><strong>{formatCurrency(grossSelected)}</strong></div>
          <div className="stat-card"><span className="stat-label">Split Received</span><strong>{formatCurrency(splitTotal)}</strong></div>
          <div className="stat-card"><span className="stat-label">Commission</span><strong>{formatCurrency(commission)}</strong></div>
        </div>
        {!splitMatchesCredit && selectedRows.length > 0 && creditedTotal !== '' && (
          <p className="hint" style={{ color: '#b45309' }}>
            Split ({formatCurrency(splitTotal)}) does not match credited total ({formatCurrency(creditedNumber)}).
            Click Save and it will auto-split, or press Auto Split Now.
          </p>
        )}
        <div className="card-actions">
          <button type="button" className="btn" onClick={autoSplit}>Auto Split Credited Total</button>
          <button type="submit" className="btn primary" disabled={saving || !selectedRows.length}>
            {saving ? 'Saving...' : (editingId ? 'Update Settlement' : 'Save Credit & Update Owner')}
          </button>
          {editingId && <button type="button" className="btn" onClick={resetForm}>Cancel Edit</button>}
        </div>
      </form>

      <div className="card">
        <div className="card-title-row">
          <h3>Settlement Report</h3>
          <div className="card-actions">
            <button
              type="button"
              className="btn small primary"
              disabled={downloading || downloadingId != null || !settlements.length}
              onClick={downloadEachAmount}
            >
              {downloading ? 'Downloading...' : 'Download Each Amount'}
            </button>
            <button
              type="button"
              className="btn small secondary"
              disabled={downloading || downloadingId != null || !settlements.length}
              onClick={downloadFullReport}
            >
              Download Full Image
            </button>
          </div>
        </div>
        <p className="hint">
          Use <strong>Download Each Amount</strong> for short images (one bank credit / amount per file).
          Full image is only if you need everything in one file.
        </p>
        <div ref={reportRef} className="pt-ready-image-wrap online-credit-report">
          <div className="pt-ready-image-header">
            <h4>Vathiyayath Sports Hub — Online Payment Credit Report</h4>
            <p>Match period: {formatDateDMY(from)} to {formatDateDMY(to)}</p>
          </div>
          <div className="stat-grid" style={{ marginBottom: 12 }}>
            <div className="stat-card online-amt-gross">
              <span className="stat-label">Gross Payment</span>
              <strong>{formatCurrency(settlementTotals.gross)}</strong>
            </div>
            <div className="stat-card online-amt-received">
              <span className="stat-label">Bank Received</span>
              <strong>{formatCurrency(settlementTotals.received)}</strong>
            </div>
            <div className="stat-card online-amt-commission">
              <span className="stat-label">Commission</span>
              <strong>{formatCurrency(settlementTotals.commission)}</strong>
            </div>
          </div>
          {!settlements.length ? (
            <p className="muted">No online settlements saved yet for this period.</p>
          ) : settlements.map((settlement) => (
            <div
              key={settlement.id}
              ref={(node) => setSettlementRef(settlement.id, node)}
              className="online-credit-block online-credit-amount-card"
            >
              <div className="online-credit-amount-title">
                <h4>Online Credit — Received {formatCurrency(settlement.received_amount)}</h4>
                <p>
                  Credit date {formatDateDMY(settlement.credit_date)} · {methodLabel(settlement.source)}
                </p>
              </div>
              <div className="online-credit-block-head">
                <div>
                  <strong>Bank Credit Date: {formatDateDMY(settlement.credit_date)}</strong>
                  <div className="online-credit-block-meta">
                    <span>Payment type: {methodLabel(settlement.source)}</span>
                    {settlement.reference && <span>Ref: {settlement.reference}</span>}
                  </div>
                </div>
                <div className="online-credit-block-totals">
                  <span className="online-amt-gross">Gross {formatCurrency(settlement.gross_amount)}</span>
                  <span className="online-amt-received">Received {formatCurrency(settlement.received_amount)}</span>
                  <span className="online-amt-commission">Commission {formatCurrency(settlement.commission_amount)}</span>
                </div>
              </div>

              {(settlement.allocations || []).map((allocation) => (
                <div key={allocation.id} className="online-credit-row">
                  <div className="online-credit-main">
                    <strong>{allocation.name}</strong>
                    <small>{allocation.sport} · {allocation.time_slot || '—'}</small>
                  </div>
                  <div className="online-credit-grid">
                    <div>
                      <span className="online-credit-label">Match Date</span>
                      <strong>{formatDateDMY(allocation.match_date)}</strong>
                    </div>
                    <div>
                      <span className="online-credit-label">Payment Date</span>
                      <strong>{formatDateDMY(allocation.payment_date || allocation.match_date)}</strong>
                    </div>
                    <div>
                      <span className="online-credit-label">Payment Type</span>
                      <strong>{methodLabel(allocation.method)} ({allocation.payment_stage})</strong>
                    </div>
                    <div className="online-amt-cell online-amt-gross">
                      <span className="online-credit-label">Payment Amount (Gross)</span>
                      <strong>{formatCurrency(allocation.payment_amount || allocation.expected_amount)}</strong>
                    </div>
                    <div className="online-amt-cell online-amt-received">
                      <span className="online-credit-label">Bank Received</span>
                      <strong>{formatCurrency(allocation.received_amount)}</strong>
                    </div>
                    <div className="online-amt-cell online-amt-commission">
                      <span className="online-credit-label">Commission</span>
                      <strong>{formatCurrency(allocation.commission_amount)}</strong>
                    </div>
                  </div>
                </div>
              ))}

              {settlement.notes && <p className="hint">Notes: {settlement.notes}</p>}
              <div className="card-actions" data-html2canvas-ignore>
                <button
                  type="button"
                  className="btn small primary"
                  disabled={downloading || downloadingId != null}
                  onClick={() => downloadSettlement(settlement)}
                >
                  {downloadingId === settlement.id
                    ? 'Saving...'
                    : `Download ₹${Math.round(Number(settlement.received_amount) || 0)}`}
                </button>
                <button type="button" className="btn small" onClick={() => editSettlement(settlement)}>Edit</button>
                <button type="button" className="btn small danger" onClick={() => removeSettlement(settlement)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
