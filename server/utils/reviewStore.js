import db from '../db.js';

export function reviewToSnapshot(row) {
  return {
    review_id: row.id,
    customer_name: row.customer_name || '',
    happiness: row.happiness,
    comment: row.comment,
    read_by_owner: Boolean(row.read_by_owner),
    created_at: row.created_at,
  };
}

export function createReview({ customer_name, happiness, comment }) {
  const stmt = db.prepare(`
    INSERT INTO customer_reviews (customer_name, happiness, comment)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(
    (customer_name || '').trim(),
    happiness,
    (comment || '').trim(),
  );
  return getReviewById(result.lastInsertRowid);
}

export function getReviewById(id) {
  return db.prepare('SELECT * FROM customer_reviews WHERE id = ?').get(id);
}

export function getLatestUnreadReview() {
  return db.prepare(`
    SELECT * FROM customer_reviews
    WHERE read_by_owner = 0
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT 1
  `).get();
}

export function markReviewRead(id) {
  db.prepare('UPDATE customer_reviews SET read_by_owner = 1 WHERE id = ?').run(id);
  return getReviewById(id);
}

export function listAllReviews(limit = 50) {
  return db.prepare(`
    SELECT * FROM customer_reviews
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ?
  `).all(limit);
}
