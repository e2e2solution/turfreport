const HAPPINESS_EMOJI = {
  1: '😢',
  2: '😕',
  3: '😐',
  4: '🙂',
  5: '😊',
};

export function happinessEmoji(score) {
  return HAPPINESS_EMOJI[score] || '😐';
}

export function happinessLabel(score) {
  const labels = {
    1: 'Very unhappy',
    2: 'Unhappy',
    3: 'Okay',
    4: 'Happy',
    5: 'Very happy',
  };
  return labels[score] || 'Feedback';
}

export default function OwnerReviewPopup({ review, onClose, onRead }) {
  if (!review) return null;

  const emoji = happinessEmoji(review.happiness);
  const name = review.customer_name?.trim() || 'A customer';

  const close = async () => {
    try {
      await onRead(review.review_id);
    } catch {
      /* still close */
    }
    onClose();
  };

  return (
    <div className="owner-review-overlay" onClick={close} role="presentation">
      <div
        className="owner-review-popup"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-review-title"
      >
        <button type="button" className="owner-review-close" onClick={close} aria-label="Close">
          ×
        </button>
        <p className="owner-review-greeting">Sebi, you have a good message!</p>
        <div className="owner-review-smile-wrap">
          <span className="owner-review-smile" aria-hidden="true">{emoji}</span>
        </div>
        <p className="owner-review-happiness">{happinessLabel(review.happiness)}</p>
        <h3 id="owner-review-title" className="owner-review-title">{name} says</h3>
        <blockquote className="owner-review-comment">&ldquo;{review.comment}&rdquo;</blockquote>
        <button type="button" className="btn primary owner-btn owner-review-done" onClick={close}>
          Got it
        </button>
      </div>
    </div>
  );
}
