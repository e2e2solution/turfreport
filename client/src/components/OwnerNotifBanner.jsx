const OWNER_NAME = 'Sebi';

export default function OwnerNotifBanner({ onOpen, onDismiss, ownerName = OWNER_NAME }) {
  return (
    <div className="owner-notif-banner" role="alert" aria-live="assertive">
      <button type="button" className="owner-notif-banner-body" onClick={onOpen}>
        <span className="owner-notif-banner-app-icon" aria-hidden="true">V</span>
        <div className="owner-notif-banner-text">
          <span className="owner-notif-banner-app">Vathiyayath Sports Hub</span>
          <strong>{ownerName}, you have a good message!</strong>
          <small>Tap to read customer feedback</small>
        </div>
      </button>
      <button
        type="button"
        className="owner-notif-banner-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}

export { OWNER_NAME };
