import { findMany, findOne, insertOne, updateOne } from '../db/collections.js';
import { syncReviewToMongo } from '../db/mongo.js';

export function reviewToSnapshot(row) {
  return {
    review_id: row.id ?? row.review_id,
    customer_name: row.customer_name || '',
    happiness: row.happiness,
    comment: row.comment,
    read_by_owner: Boolean(row.read_by_owner),
    created_at: row.created_at,
  };
}

export async function createReview({ customer_name, happiness, comment }) {
  const row = await insertOne('customer_reviews', {
    customer_name: (customer_name || '').trim(),
    happiness,
    comment: (comment || '').trim(),
    read_by_owner: false,
    created_at: new Date().toISOString(),
  });
  const snapshot = reviewToSnapshot(row);
  await syncReviewToMongo({ ...snapshot, review_id: row.id });
  return row;
}

export async function getReviewById(id) {
  return findOne('customer_reviews', { id: Number(id) });
}

export async function getLatestUnreadReview() {
  const rows = await findMany('customer_reviews', { read_by_owner: { $ne: true } }, {
    sort: { created_at: -1, id: -1 },
    limit: 1,
  });
  return rows[0] || null;
}

export async function markReviewRead(id) {
  return updateOne('customer_reviews', { id: Number(id) }, { read_by_owner: true });
}

export async function listAllReviews(limit = 50) {
  return findMany('customer_reviews', {}, {
    sort: { created_at: -1, id: -1 },
    limit,
  });
}
