import { formatDateDMY, formatCurrency } from '../api';
import { planLabel, PLAN_OPTIONS } from '../utils/dates';

/** Same rule as server: "Name AND Name" = 2 people joined. */
export function gymPeopleJoinedForName(name) {
  if (name == null || name === '') return 1;
  if (/\band\b/i.test(String(name))) return 2;
  return 1;
}

export function buildGymFilterAnalysis(rows) {
  const counted = rows.filter((r) => !r.is_linked_carryover);
  const analysis = {
    records: counted.length,
    peopleJoined: 0,
    pending: 0,
    closed: 0,
    byPackage: Object.fromEntries(PLAN_OPTIONS.map((p) => [p.value, { records: 0, people: 0 }])),
    total: 0,
    pt: 0,
    adv: 0,
    bal: 0,
  };

  for (const r of rows) {
    if (r.is_linked_carryover) continue;
    const people = gymPeopleJoinedForName(r.name);
    analysis.peopleJoined += people;
    analysis.total += Number(r.total) || 0;
    analysis.pt += Number(r.personal_training_amount) || 0;
    analysis.adv += (Number(r.advance_gpay) || 0) + (Number(r.advance_cash) || 0);
    analysis.bal += (Number(r.balance_gpay) || 0) + (Number(r.balance_cash) || 0);
    if (r.status === 'CLOSED') analysis.closed += 1;
    else analysis.pending += 1;

    const plan = Number(r.plan_months) || 1;
    if (!analysis.byPackage[plan]) analysis.byPackage[plan] = { records: 0, people: 0 };
    analysis.byPackage[plan].records += 1;
    analysis.byPackage[plan].people += people;
  }

  return analysis;
}

export function GymFilterReportCapture({ title, rows }) {
  const analysis = buildGymFilterAnalysis(rows);

  return (
    <div className="report-image-export gym-filter-report-export">
      <div className="report-image-header">
        <h2>{title}</h2>
        <p>
          {analysis.records} record{analysis.records === 1 ? '' : 's'}
          {' · '}
          <strong>{analysis.peopleJoined} people joined</strong>
        </p>
      </div>

      <div className="table-wrap">
        <table className="report-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Package</th>
              <th>People</th>
              <th>Start</th>
              <th>End</th>
              <th>Total</th>
              <th>PT</th>
              <th>Adv</th>
              <th>Bal</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.id}
                className={[
                  Number(r.personal_training_amount) > 0 ? 'pt-client-row' : '',
                  r.is_linked_booking ? `linked-booking-row linked-hue-${r.link_hue || 0}` : '',
                ].filter(Boolean).join(' ') || undefined}
              >
                <td>{i + 1}</td>
                <td>
                  {r.name}
                  {r.is_linked_carryover && (
                    <div><small>Linked previous {planLabel(r.plan_months)} balance</small></div>
                  )}
                  {r.is_linked_booking && !r.is_linked_carryover && (
                    <div><small>Linked payment</small></div>
                  )}
                </td>
                <td>{planLabel(r.plan_months)}</td>
                <td>{gymPeopleJoinedForName(r.name)}</td>
                <td>{formatDateDMY(r.start_date)}</td>
                <td>{formatDateDMY(r.end_date)}</td>
                <td>{formatCurrency(r.total)}</td>
                <td>{formatCurrency(r.personal_training_amount)}</td>
                <td>{formatCurrency((r.advance_gpay || 0) + (r.advance_cash || 0))}</td>
                <td>{formatCurrency((r.balance_gpay || 0) + (r.balance_cash || 0))}</td>
                <td>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="gym-report-analysis">
        <h3>Analysis</h3>
        <div className="gym-analysis-grid">
          <div className="gym-analysis-item">
            <span>People joined</span>
            <strong>{analysis.peopleJoined}</strong>
          </div>
          <div className="gym-analysis-item">
            <span>Records</span>
            <strong>{analysis.records}</strong>
          </div>
          <div className="gym-analysis-item">
            <span>Pending</span>
            <strong>{analysis.pending}</strong>
          </div>
          <div className="gym-analysis-item">
            <span>Closed</span>
            <strong>{analysis.closed}</strong>
          </div>
        </div>
        <ul className="gym-analysis-list">
          {PLAN_OPTIONS.map((opt) => {
            const pack = analysis.byPackage[opt.value] || { records: 0, people: 0 };
            if (!pack.records) return null;
            return (
              <li key={opt.value}>
                <strong>{opt.label}:</strong> {pack.people} people joined ({pack.records} record{pack.records === 1 ? '' : 's'})
              </li>
            );
          })}
          <li>
            <strong>Plan total:</strong> {formatCurrency(analysis.total)}
            {analysis.pt > 0 ? ` · PT ${formatCurrency(analysis.pt)}` : ''}
          </li>
          <li>
            <strong>Collected:</strong> Adv {formatCurrency(analysis.adv)} · Bal {formatCurrency(analysis.bal)}
          </li>
        </ul>
      </div>
    </div>
  );
}
