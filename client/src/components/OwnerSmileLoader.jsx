const QUOTE = 'Problems can be solved with a smile..';

export default function OwnerSmileLoader({ label }) {
  return (
    <div className="owner-smile-loader" role="status" aria-live="polite" aria-label={label || 'Loading'}>
      <div className="owner-smile-face" aria-hidden="true">
        <div className="owner-smile-ring" />
        <div className="owner-smile-emoji">😊</div>
      </div>
      <p className="owner-smile-quote">{QUOTE}</p>
      {label && <p className="owner-smile-label">{label}</p>}
    </div>
  );
}
