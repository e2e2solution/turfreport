import { formatDateDMY, formatCurrency } from '../api';
import { planLabel, formatCoachingMonth, coachingPeriodLabel } from '../utils/dates';

function StatusBadge({ status }) {
  return <span className={`badge ${status?.toLowerCase()}`}>{status}</span>;
}

function bulkRowClass(r) {
  return r.is_bulk ? 'bulk-pending-row' : '';
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
  const sports = ['cricket', 'football', 'badminton'];
  return sports
    .map((sport) => ({
      sport,
      label: sport.charAt(0).toUpperCase() + sport.slice(1),
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
              <td>{r.name}{r.is_bulk ? ` (#${r.bulk_id})` : ''}</td>
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
  return <TurfTable rows={rows} onDeleteBulk={onDeleteBulk} />;
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
