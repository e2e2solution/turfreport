import { formatCurrency } from '../api';

function StatCard({ label, value, sub }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

export function TurfSummaryCapture({ data, rangeLabel, period }) {
  return (
    <div className="summary-image-export">
      <div className="report-image-header">
        <h1>Vathiyayath Sports Hub</h1>
        <h2>Turf Hours &amp; Payment</h2>
        <p>{rangeLabel} · {period}</p>
      </div>
      <div className="stat-grid summary-stat-grid">
        {['cricket', 'football', 'badminton'].map((s) => (
          <StatCard
            key={s}
            label={s.charAt(0).toUpperCase() + s.slice(1)}
            value={`${data.turf[s].hours} hrs`}
            sub={formatCurrency(data.turf[s].payment)}
          />
        ))}
        <StatCard
          label="Overall"
          value={`${data.turf.overall.hours} hrs`}
          sub={formatCurrency(data.turf.overall.payment)}
        />
      </div>
      <p className="summary-image-footer">{data.turf.overall.bookings} total bookings</p>
    </div>
  );
}

export function GymSummaryCapture({ data, rangeLabel, period }) {
  return (
    <div className="summary-image-export">
      <div className="report-image-header gym-header">
        <h1>Vathiyayath Sports Hub</h1>
        <h2>Gym Admissions &amp; Payment</h2>
        <p>{rangeLabel} · {period}</p>
      </div>
      <div className="stat-grid summary-stat-grid">
        {[1, 3, 6].map((p) => (
          <StatCard
            key={p}
            label={`${p} Month`}
            value={`${data.gym.byPlan[p]?.count || 0} admissions`}
            sub={formatCurrency(data.gym.byPlan[p]?.payment || 0)}
          />
        ))}
        <StatCard
          label="Overall"
          value={`${data.gym.overall.count} admissions`}
          sub={formatCurrency(data.gym.overall.payment)}
        />
      </div>
    </div>
  );
}
