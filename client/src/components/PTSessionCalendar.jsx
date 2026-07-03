import { useMemo } from 'react';
import { addDaysISO } from '../utils/pt';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function isFrozenOn(dateISO, freezes = []) {
  return freezes.some((f) => dateISO >= f.freeze_from && dateISO <= f.freeze_to);
}

function monthKeysInRange(startISO, endISO) {
  const keys = new Set();
  let cur = startISO;
  while (cur && endISO && cur <= endISO) {
    keys.add(cur.slice(0, 7));
    cur = addDaysISO(cur, 1);
  }
  return [...keys].sort();
}

function buildMonthCells(yearMonth, rangeStart, rangeEnd) {
  const [y, m] = yearMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lastDay = new Date(y, m, 0).getDate();
  const cells = [];

  for (let i = 0; i < first.getDay(); i += 1) {
    cells.push({ type: 'pad' });
  }

  for (let day = 1; day <= lastDay; day += 1) {
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({
      type: 'day',
      iso,
      day,
      inRange: iso >= rangeStart && iso <= rangeEnd,
    });
  }

  return cells;
}

export default function PTSessionCalendar({
  startDate,
  endDate,
  sessions = [],
  freezes = [],
  planType,
  sessionTarget,
  disabled = false,
  saving = false,
  onToggle,
}) {
  const sessionByDate = useMemo(() => {
    const map = new Map();
    sessions.forEach((s) => map.set(s.session_date, s));
    return map;
  }, [sessions]);

  const completedCount = sessions.length;
  const months = useMemo(
    () => monthKeysInRange(startDate, endDate),
    [startDate, endDate],
  );

  const handleToggle = (dateISO, checked) => {
    if (disabled || saving || !onToggle) return;
    onToggle(dateISO, checked, sessionByDate.get(dateISO));
  };

  return (
    <div className="pt-session-calendar">
      <div className="pt-calendar-summary">
        <span>
          <strong>{completedCount}</strong>
          {sessionTarget ? ` / ${sessionTarget} sessions marked` : ' sessions marked'}
        </span>
        <span className="pt-calendar-legend">
          <span className="pt-legend-item"><span className="pt-legend-box done" /> Done</span>
          <span className="pt-legend-item"><span className="pt-legend-box frozen" /> Frozen</span>
        </span>
      </div>

      {planType === '22_sessions' && (
        <p className="hint">Check up to 22 training days on the calendar. Uncheck to remove a session.</p>
      )}
      {planType !== '22_sessions' && (
        <p className="hint">Tap a day to mark PT done. Tap again to unmark.</p>
      )}

      {months.map((yearMonth) => {
        const [y, m] = yearMonth.split('-').map(Number);
        const cells = buildMonthCells(yearMonth, startDate, endDate);
        const daysInRange = cells.filter((c) => c.type === 'day' && c.inRange).length;

        if (daysInRange === 0) return null;

        return (
          <div key={yearMonth} className="pt-calendar-month">
            <h4>{MONTH_NAMES[m - 1]} {y}</h4>
            <div className="pt-calendar-weekdays">
              {WEEKDAYS.map((d) => <span key={d}>{d}</span>)}
            </div>
            <div className="pt-calendar-grid">
              {cells.map((cell, idx) => {
                if (cell.type === 'pad') {
                  return <div key={`pad-${yearMonth}-${idx}`} className="pt-calendar-cell pad" />;
                }

                if (!cell.inRange) {
                  return (
                    <div key={cell.iso} className="pt-calendar-cell out-of-range">
                      <span className="pt-day-num muted">{cell.day}</span>
                    </div>
                  );
                }

                const session = sessionByDate.get(cell.iso);
                const checked = Boolean(session);
                const frozen = isFrozenOn(cell.iso, freezes);
                const atMax = planType === '22_sessions'
                  && sessionTarget
                  && completedCount >= sessionTarget
                  && !checked;

                return (
                  <label
                    key={cell.iso}
                    className={`pt-calendar-cell in-range${checked ? ' checked' : ''}${frozen ? ' frozen-day' : ''}${atMax ? ' disabled-day' : ''}`}
                    title={frozen ? 'Freeze period' : cell.iso}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled || saving || atMax}
                      onChange={() => handleToggle(cell.iso, !checked)}
                    />
                    <span className="pt-day-num">{cell.day}</span>
                    {frozen && <span className="pt-freeze-dot" />}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
