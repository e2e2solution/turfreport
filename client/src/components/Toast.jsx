import { useEffect } from 'react';

export default function Toast({ message, type = 'success', onClose, duration = 3500 }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  return (
    <div className={`app-toast app-toast-${type}`} role="status" aria-live="polite">
      <span className="app-toast-icon" aria-hidden="true">
        {type === 'success' ? '✓' : '!'}
      </span>
      <span className="app-toast-text">{message}</span>
    </div>
  );
}
