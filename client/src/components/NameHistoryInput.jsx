import { useEffect, useRef, useState } from 'react';

export default function NameHistoryInput({
  value,
  onChange,
  onPick,
  searchFn,
  placeholder = 'Customer name',
  required = false,
  label = 'Name *',
}) {
  const [hints, setHints] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);
  const skipSearch = useRef(false);

  useEffect(() => {
    if (skipSearch.current) {
      skipSearch.current = false;
      setHints([]);
      setOpen(false);
      return undefined;
    }

    const q = String(value || '').trim();
    if (!searchFn || q.length < 1) {
      setHints([]);
      setOpen(false);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const rows = await searchFn(q);
        if (!cancelled) {
          setHints(Array.isArray(rows) ? rows : []);
          setOpen(true);
        }
      } catch {
        if (!cancelled) {
          setHints([]);
          setOpen(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, searchFn]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pick = (hint) => {
    skipSearch.current = true;
    setOpen(false);
    setHints([]);
    onPick?.(hint);
  };

  return (
    <div className="name-history-field" ref={wrapRef}>
      <label>
        {label}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (hints.length) setOpen(true);
          }}
          required={required}
          placeholder={placeholder}
          autoComplete="off"
        />
      </label>
      {open && (hints.length > 0 || loading) && (
        <div className="name-history-list">
          {loading && !hints.length && <div className="name-history-empty">Searching history...</div>}
          {hints.map((hint) => (
            <button
              key={`${hint.id}-${hint.name}`}
              type="button"
              className="name-history-item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(hint)}
            >
              <strong>{hint.name}</strong>
              <small>{hint.label}</small>
            </button>
          ))}
        </div>
      )}
      {searchFn && (
        <p className="hint">Type a known name — click a hint below to autofill from history.</p>
      )}
    </div>
  );
}
