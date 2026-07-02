import { useState, useEffect } from 'react';
import { TIME_OPTIONS, buildTimeSlot, parseTimeSlot, timeToMinutes } from '../utils/time';

export default function TimeSlotPicker({ value, onChange }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  useEffect(() => {
    if (!value) return;
    const parsed = parseTimeSlot(value);
    setStart(parsed.start);
    setEnd(parsed.end);
  }, [value]);

  const endOptions = start
    ? TIME_OPTIONS.filter((t) => timeToMinutes(t.value) > timeToMinutes(start))
    : TIME_OPTIONS;

  const handleStart = (s) => {
    setStart(s);
    const validEnd = end && timeToMinutes(end) > timeToMinutes(s) ? end : '';
    setEnd(validEnd);
    if (s && validEnd) onChange(buildTimeSlot(s, validEnd));
  };

  const handleEnd = (e) => {
    setEnd(e);
    if (start && e) onChange(buildTimeSlot(start, e));
  };

  const preview = buildTimeSlot(start, end);

  return (
    <div className="time-picker">
      <label>
        Start Time *
        <select value={start} onChange={(ev) => handleStart(ev.target.value)}>
          <option value="">Select start</option>
          {TIME_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>
      <label>
        End Time *
        <select value={end} onChange={(ev) => handleEnd(ev.target.value)} disabled={!start}>
          <option value="">Select end</option>
          {endOptions.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>
      {preview && <p className="time-preview">{preview}</p>}
      {!preview && start && <p className="hint">Now select end time</p>}
    </div>
  );
}
