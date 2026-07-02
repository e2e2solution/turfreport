import { TurfTable, OnlineTable, GymTable, FootballCoachingTable } from './ReportTables';

export default function ReportImageCapture({ title, subtitle, sections, data }) {
  const showTurf = sections.includes('turf');
  const showOnline = sections.includes('online');
  const showGym = sections.includes('gym');
  const showFootballCoaching = sections.includes('football_coaching');

  return (
    <div className="report-image-export">
      <div className="report-image-header">
        <h1>Vathiyayath Sports Hub</h1>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {showTurf && (
        <section className="report-image-section">
          <h3>Turf</h3>
          <TurfTable rows={data.turf || []} />
        </section>
      )}
      {showOnline && (
        <section className="report-image-section">
          <h3>Online Booking</h3>
          <OnlineTable rows={data.online || []} />
        </section>
      )}
      {showGym && (
        <section className="report-image-section">
          <h3>Gym</h3>
          <GymTable rows={data.gym || []} />
        </section>
      )}
      {showFootballCoaching && (
        <section className="report-image-section">
          <h3>Football Coaching</h3>
          <FootballCoachingTable rows={data.football_coaching || []} />
        </section>
      )}
    </div>
  );
}
