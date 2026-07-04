import { happinessEmoji, happinessLabel } from './OwnerReviewPopup';

function formatReviewDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function OwnerReviewListPopup({
  reviews, loading, onClose, onMarkRead,
}) {
  const unread = reviews.filter((r) => !r.read_by_owner);

  const markOne = async (reviewId) => {
    await onMarkRead(reviewId);
  };

  const markAll = async () => {
    await Promise.all(unread.map((r) => onMarkRead(r.review_id)));
    onClose();
  };

  return (
    <div className="owner-review-overlay" onClick={onClose} role="presentation">
      <div
        className="owner-review-popup owner-review-list-popup"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-review-list-title"
      >
        <button type="button" className="owner-review-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <p className="owner-review-greeting">Sebi, you have good messages!</p>
        <h3 id="owner-review-list-title" className="owner-review-title">
          Customer Reviews
          {unread.length > 0 && (
            <span className="owner-review-list-badge">{unread.length} new</span>
          )}
        </h3>

        {loading && <p className="owner-review-list-loading">Loading reviews...</p>}

        {!loading && reviews.length === 0 && (
          <p className="owner-review-list-empty">No customer reviews yet.</p>
        )}

        {!loading && reviews.length > 0 && (
          <ul className="owner-review-list">
            {reviews.map((review) => {
              const name = review.customer_name?.trim() || 'A customer';
              const isUnread = !review.read_by_owner;
              return (
                <li
                  key={review.review_id}
                  className={`owner-review-list-item${isUnread ? ' unread' : ''}`}
                >
                  <div className="owner-review-list-item-head">
                    <span className="owner-review-list-emoji" aria-hidden="true">
                      {happinessEmoji(review.happiness)}
                    </span>
                    <div className="owner-review-list-meta">
                      <strong>{name}</strong>
                      <span>{happinessLabel(review.happiness)}</span>
                      {review.created_at && (
                        <small>{formatReviewDate(review.created_at)}</small>
                      )}
                    </div>
                    {isUnread && <span className="owner-review-list-new-dot" aria-label="Unread" />}
                  </div>
                  <blockquote className="owner-review-list-comment">
                    &ldquo;{review.comment}&rdquo;
                  </blockquote>
                  {isUnread && (
                    <button
                      type="button"
                      className="btn small owner-review-list-read-btn"
                      onClick={() => markOne(review.review_id)}
                    >
                      Mark read
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {!loading && unread.length > 0 && (
          <button type="button" className="btn primary owner-btn owner-review-done" onClick={markAll}>
            Mark all read
          </button>
        )}

        {!loading && reviews.length > 0 && unread.length === 0 && (
          <button type="button" className="btn primary owner-btn owner-review-done" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}
