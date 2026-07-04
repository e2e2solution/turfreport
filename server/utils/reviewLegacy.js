/** Wrap review for cloud relay via existing /api/owner/sync (works on older Render deploys). */
export function reviewToLegacySyncPayload(review) {
  return {
    payment_date: `review-${review.review_id}`,
    report_type: 'customer_review',
    review_id: review.review_id,
    customer_name: review.customer_name || '',
    happiness: review.happiness,
    comment: review.comment,
    read_by_owner: Boolean(review.read_by_owner),
    created_at: review.created_at || new Date().toISOString(),
  };
}

export function legacyReportToReview(doc) {
  if (!doc) return null;
  const id = doc.review_id || Number(String(doc.payment_date || '').replace(/^review-/, ''));
  if (!id || !doc.comment) return null;
  return {
    review_id: id,
    customer_name: doc.customer_name || '',
    happiness: doc.happiness || 5,
    comment: doc.comment,
    read_by_owner: Boolean(doc.read_by_owner),
    created_at: doc.created_at,
    payment_date: doc.payment_date,
  };
}

export function isLegacyReviewReport(doc) {
  return String(doc?.payment_date || '').startsWith('review-')
    || doc?.report_type === 'customer_review';
}
