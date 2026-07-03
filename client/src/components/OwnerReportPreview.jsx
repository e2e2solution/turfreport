import { formatCurrency, formatDateDMY } from '../api';
import { planLabel, formatCoachingMonth, coachingPeriodLabel } from '../utils/dates';

function OwnerMiniTable({ headers, rows, empty }) {
  if (!rows?.length) return <p className="muted owner-mini-empty">{empty}</p>;
  return (
    <div className="owner-mini-table-wrap">
      <table className="owner-mini-table">
        <thead>
          <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OwnerReportPreview({ report, exportRef }) {
  const pr = report?.payment_report;
  if (!pr) return null;

  const turfRows = (pr.turf_online || []).map((r) => [
    r.name,
    r.sport,
    r.time_slot || '—',
    formatCurrency(r.total),
  ]);

  const gymRows = (pr.gym || [])
    .filter((r) => !r.is_bulk_session)
    .map((r) => [
      r.name,
      formatDateDMY(r.start_date),
      planLabel(r.plan_months),
      r.members > 1 ? `${r.members}` : '1',
      formatCurrency(r.total),
    ]);

  const coachingRows = (pr.football_coaching || []).map((r) => [
    r.child_name,
    r.parent_name || '—',
    formatCoachingMonth(r.coaching_month),
    coachingPeriodLabel(r.period),
    formatCurrency(r.total),
  ]);

  return (
    <div className="owner-card owner-report-export" ref={exportRef}>
      <h3>Payment Report — {formatDateDMY(report.payment_date)}</h3>
      <p className="hint owner-gym-count-line">
        Gym members joined: <strong>{report.gym_members_joined ?? pr.gym_members_joined ?? 0}</strong>
      </p>

      <h4>Turf + Online</h4>
      <OwnerMiniTable
        headers={['Name', 'Sport', 'Time', 'Paid']}
        rows={turfRows}
        empty="No turf/online payments"
      />

      <h4>Gym</h4>
      <OwnerMiniTable
        headers={['Name', 'Start', 'Plan', 'Members', 'Paid']}
        rows={gymRows}
        empty="No gym payments"
      />

      <h4>Football Coaching</h4>
      <OwnerMiniTable
        headers={['Child', 'Parent', 'Month', 'Period', 'Paid']}
        rows={coachingRows}
        empty="No coaching payments"
      />
    </div>
  );
}
