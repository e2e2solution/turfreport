import { formatDateDMY, formatCurrency } from '../api';
import { planLabel, formatCoachingMonth, coachingPeriodLabel } from '../utils/dates';
import { SPORTS, sportLabel } from '../utils/sports';

function StatusBadge({ status }) {
  return <span className={`badge ${status?.toLowerCase()}`}>{status}</span>;
}

function bulkRowClass(r) {
  if (r.is_bulk) return 'bulk-pending-row';
  if (r.link_group_id != null && r.link_group_id !== '') {
    const hue = typeof r.link_hue === 'number' ? r.link_hue : 0;
    return `linked-booking-row linked-hue-${hue}`;
  }
  return '';
}

function formatMatchDate(r) {
  if (r.is_bulk_payment) return '—';
  const end = r.match_date_end || r.end_date;
  const start = r.match_date || r.start_date;
  if (!start) return '—';
  if (end && start !== end) {
    return `${formatDateDMY(start)} – ${formatDateDMY(end)}`;
  }
  return formatDateDMY(start);
}

function formatTotal(r) {
  if (r.is_bulk && !r.is_bulk_payment && (r.total === 0 || r.total == null)) return '—';
  if (r.is_linked_booking && !r.is_link_amount_row && (r.total === 0 || r.total == null)) return '—';
  return formatCurrency(r.total);
}

function payCell(val) {
  if (val === null || val === undefined || val === '') return '-';
  return val;
}

function isPendingBulk(r) {
  if (!r.is_bulk || r.is_bulk_payment) return false;
  if (r.status === 'CLOSED') return false;
  const paid = (r.advance_gpay || 0) + (r.advance_cash || 0) + (r.balance_gpay || 0) + (r.balance_cash || 0);
  return paid === 0;
}

function canEditBulkSession(r) {
  return Boolean(r.is_bulk && !r.is_bulk_payment && r.bulk_session_id && r.bulk_pkg_status === 'PENDING');
}

function canRemoveBulkSession(r) {
  return Boolean(r.is_bulk && !r.is_bulk_payment && r.bulk_session_id && r.bulk_pkg_status === 'PENDING');
}

function groupTurfBySport(rows) {
  return SPORTS
    .map((sport) => ({
      sport,
      label: sportLabel(sport),
      rows: rows.filter((r) => r.sport === sport),
    }))
    .filter((g) => g.rows.length > 0);
}

export function SportGroupedTurfTable({ rows, onDeleteBulk, onEditBulk, emptyLabel = 'No records' }) {
  const groups = groupTurfBySport(rows);
  if (!groups.length) return <p className="muted">{emptyLabel}</p>;
  return (
    <div className="sport-grouped-report">
      {groups.map((g) => (
        <div key={g.sport} className="sport-report-block">
          <h5 className="sport-report-title">{g.label}</h5>
          <TurfTable rows={g.rows} onDeleteBulk={onDeleteBulk} onEditBulk={onEditBulk} />
        </div>
      ))}
    </div>
  );
}

export function TurfTable({ rows, onDeleteBulk, onEditBulk }) {
  if (!rows.length) return <p className="muted">No turf records</p>;
  const showActions = Boolean(onDeleteBulk || onEditBulk);
  return (
    <div className="table-wrap">
      <table className="report-table">
        <thead>
          <tr>
            <th>Name</th><th>Sport</th><th>Match</th><th>Total</th><th>Time</th>
            <th>Adv GPay</th><th>Adv Cash</th><th>Adv Date</th>
            <th>Bal GPay</th><th>Bal Cash</th><th>Bal Date</th>
            <th>Status</th><th>Remarks</th>
            {showActions && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={bulkRowClass(r)}>
              <td>
                {r.name}{r.is_bulk ? ` (#${r.bulk_id})` : ''}
                {r.is_linked_booking && (
                  <>
                    {' '}
                    <span className="badge linked" title="Linked same-day booking">
                      {r.is_link_amount_row ? 'Linked · paid here' : 'Linked'}
                    </span>
                  </>
                )}
              </td>
              <td>{r.sport}</td>
              <td>{formatMatchDate(r)}</td>
              <td>{formatTotal(r)}</td>
              <td className={r.is_bulk_payment ? 'bulk-time-cell' : ''}>{r.time_slot}</td>
              <td>{payCell(r.advance_gpay)}</td>
              <td>{payCell(r.advance_cash)}</td>
              <td>{formatDateDMY(r.advance_date)}</td>
              <td>{payCell(r.balance_gpay)}</td>
              <td>{payCell(r.balance_cash)}</td>
              <td>{formatDateDMY(r.balance_date)}</td>
              <td>{isPendingBulk(r)
                ? <span className="badge pending">Pending Bulk</span>
                : <StatusBadge status={r.status} />}</td>
              <td className={r.is_bulk ? 'remarks-cell' : ''}>{r.remarks || '-'}</td>
              {showActions && (
                <td className="bulk-actions-cell">
                  {canEditBulkSession(r) && onEditBulk && (
                    <button type="button" className="btn small" onClick={() => onEditBulk(r)}>
                      Edit
                    </button>
                  )}
                  {canRemoveBulkSession(r) && onDeleteBulk && (
                    <button type="button" className="btn small danger" onClick={() => onDeleteBulk(r.bulk_session_id)}>
                      Remove
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OnlineTable({ rows, onDeleteBulk }) {
  if (!rows.length) return <p className="muted">No online records</p>;
  const methodLabel = (value) => ({
    DIRECT_GPAY: 'Direct GPay',
    MPAY: 'mPay',
    ONLINE_PAY: 'Online Pay',
    MIXED: 'Mixed',
  }[value] || value || 'Direct GPay');

  return (
    <div className="table-wrap">
      <table className="report-table">
        <thead>
          <tr>
            <th>Name</th><th>Sport</th><th>Match</th><th>Time</th><th>Total</th>
            <th>Advance</th><th>Balance</th><th>Bank Credit / Commission</th>
            <th>Status</th><th>Remarks</th>
            {onDeleteBulk && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={bulkRowClass(r)}>
              <td>{r.name}{r.is_bulk ? ` (#${r.bulk_id})` : ''}</td>
              <td>{r.sport}</td>
              <td>{formatMatchDate(r)}</td>
              <td>{r.time_slot || '—'}</td>
              <td>{formatTotal(r)}</td>
              <td>
                {r.is_online_settlement ? (
                  `${methodLabel(r.payment_method)} settlement`
                ) : (
                  <>
                    {formatCurrency((r.advance_gpay || 0) + (r.advance_cash || 0))}
                    <br />
                    <small>{methodLabel(r.advance_method)} · {formatDateDMY(r.advance_date)}</small>
                    {r.advance_expected_credit_date && (
                      <><br /><small>Expected {formatDateDMY(r.advance_expected_credit_date)}</small></>
                    )}
                  </>
                )}
              </td>
              <td>
                {r.is_online_settlement ? (
                  `${r.payment_stage || ''} payment`
                ) : (
                  <>
                    {formatCurrency((r.balance_gpay || 0) + (r.balance_cash || 0))}
                    <br />
                    <small>{methodLabel(r.balance_method)} · {formatDateDMY(r.balance_date)}</small>
                    {r.balance_expected_credit_date && (
                      <><br /><small>Expected {formatDateDMY(r.balance_expected_credit_date)}</small></>
                    )}
                  </>
                )}
              </td>
              <td>
                {r.is_online_settlement ? (
                  <>
                    <strong>{formatCurrency(r.received_amount)}</strong> received {formatDateDMY(r.credit_date)}
                    <br />
                    <small>Commission {formatCurrency(r.commission_amount)}</small>
                    <br />
                    <span className="badge closed">In sum</span>
                  </>
                ) : r.credit_status === 'PENDING_CREDIT' || r.credit_status === 'PARTIAL' ? (
                  <>
                    {(r.in_sum_amount || 0) > 0 && (
                      <>
                        <span className="badge closed">Direct GPay in sum {formatCurrency(r.in_sum_amount)}</span>
                        <br />
                      </>
                    )}
                    {(r.pending_credit_amount || 0) > 0 && (
                      <small>
                        Pending mPay / Online Pay {formatCurrency(r.pending_credit_amount)}
                        {' '}— not in total until settlement
                      </small>
                    )}
                    {(r.in_sum_amount || 0) <= 0 && (r.pending_credit_amount || 0) <= 0 && (
                      <small>Pending credit</small>
                    )}
                  </>
                ) : r.credit_status === 'IN_SUM' ? (
                  <>
                    <span className="badge closed">In sum {formatCurrency(r.in_sum_amount || 0)}</span>
                    <br />
                    <small>Direct GPay counted on payment date</small>
                  </>
                ) : (
                  <small>No bank credit yet</small>
                )}
              </td>
              <td>{isPendingBulk(r)
                ? <span className="badge pending">Pending Bulk</span>
                : r.credit_status === 'PENDING_CREDIT'
                  ? <span className="badge pending">Pending Credit</span>
                  : r.credit_status === 'PARTIAL'
                    ? <span className="badge closed">Direct GPay + Pending</span>
                    : r.credit_status === 'IN_SUM'
                      ? <span className="badge closed">In Sum</span>
                    : r.credit_status === 'CREDITED'
                      ? <span className="badge closed">Credited</span>
                      : <StatusBadge status={r.status} />}</td>
              <td>{r.remarks || '-'}</td>
              {onDeleteBulk && (
                <td>
                  {canRemoveBulkSession(r) && (
                    <button type="button" className="btn small danger" onClick={() => onDeleteBulk(r.bulk_session_id)}>
                      Remove
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FootballCoachingTable({ rows }) {
  if (!rows.length) return <p className="muted">No football coaching records</p>;
  return (
    <div className="table-wrap">
      <table className="report-table">
        <thead>
          <tr>
            <th>Child</th><th>Parent</th><th>Phone</th><th>Month</th><th>Period</th><th>Total</th>
            <th>Adv GPay</th><th>Adv Cash</th><th>Adv Date</th>
            <th>Bal GPay</th><th>Bal Cash</th><th>Bal Date</th>
            <th>Status</th><th>Remarks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{r.parent_name || '-'}</td>
              <td>{r.phone || '-'}</td>
              <td>{formatCoachingMonth(r.coaching_month)}</td>
              <td>{coachingPeriodLabel(r.period)}</td>
              <td>{formatCurrency(r.total)}</td>
              <td>{payCell(r.advance_gpay)}</td>
              <td>{payCell(r.advance_cash)}</td>
              <td>{formatDateDMY(r.advance_date)}</td>
              <td>{payCell(r.balance_gpay)}</td>
              <td>{payCell(r.balance_cash)}</td>
              <td>{formatDateDMY(r.balance_date)}</td>
              <td><StatusBadge status={r.status} /></td>
              <td>{r.remarks || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GymTable({ rows, onDeleteBulk, onEditBulk }) {
  if (!rows.length) return <p className="muted">No gym records</p>;
  const showActions = Boolean(onDeleteBulk || onEditBulk);
  return (
    <div className="table-wrap">
      <table className="report-table">
        <thead>
          <tr>
            <th>Name</th><th>Plan</th><th>Start</th><th>End</th><th>Total</th><th>Time</th><th>PT</th>
            <th>Adv GPay</th><th>Adv Cash</th><th>Adv Date</th>
            <th>Bal GPay</th><th>Bal Cash</th><th>Bal Date</th>
            <th>Status</th><th>Remarks</th>
            {showActions && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={bulkRowClass(r)}>
              <td>{r.name}{r.is_bulk ? ` (#${r.bulk_id})` : ''}</td>
              <td>{planLabel(r.plan_months)}</td>
              <td>{r.is_bulk_payment ? '—' : formatDateDMY(r.start_date)}</td>
              <td>{r.is_bulk_payment ? '—' : formatDateDMY(r.end_date)}</td>
              <td>{formatTotal(r)}</td>
              <td className={r.is_bulk_payment ? 'bulk-time-cell' : ''}>{r.time_slot || '—'}</td>
              <td>{r.personal_training_amount ? formatCurrency(r.personal_training_amount) : '-'}</td>
              <td>{payCell(r.advance_gpay)}</td>
              <td>{payCell(r.advance_cash)}</td>
              <td>{formatDateDMY(r.advance_date)}</td>
              <td>{payCell(r.balance_gpay)}</td>
              <td>{payCell(r.balance_cash)}</td>
              <td>{formatDateDMY(r.balance_date)}</td>
              <td>{isPendingBulk(r)
                ? <span className="badge pending">Pending Bulk</span>
                : <StatusBadge status={r.status} />}</td>
              <td className={r.is_bulk ? 'remarks-cell' : ''}>{r.remarks || '-'}</td>
              {showActions && (
                <td className="bulk-actions-cell">
                  {canEditBulkSession(r) && onEditBulk && (
                    <button type="button" className="btn small" onClick={() => onEditBulk(r)}>
                      Edit
                    </button>
                  )}
                  {canRemoveBulkSession(r) && onDeleteBulk && (
                    <button type="button" className="btn small danger" onClick={() => onDeleteBulk(r.bulk_session_id)}>
                      Remove
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
