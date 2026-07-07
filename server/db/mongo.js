import { MongoClient } from 'mongodb';
import { legacyReportToReview } from '../utils/reviewLegacy.js';

let client;
let db;
let lastError = '';

function uriLooksValid(uri) {
  if (!uri || uri.includes('YOUR_MONGODB_PASSWORD') || uri.includes('<db_password>')) {
    return false;
  }
  return uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://');
}

export async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uriLooksValid(uri)) {
    lastError = 'MONGODB_URI missing or still has placeholder password in server/.env';
    console.warn(lastError);
    return null;
  }
  try {
    if (client) {
      try { await client.close(); } catch { /* ignore */ }
    }
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    db = client.db(process.env.MONGODB_DB || 'vsh_owner');
    lastError = '';
    console.log('MongoDB connected for owner reports');
    return db;
  } catch (err) {
    lastError = err.message;
    console.error('MongoDB connection failed:', err.message);
    db = null;
    return null;
  }
}

export function getOwnerDb() {
  return db;
}

export function isMongoReady() {
  return Boolean(db);
}

export function getMongoError() {
  return lastError;
}

export async function syncReportToMongo(snapshot) {
  if (!isMongoReady()) {
    const connected = await connectMongo();
    if (!connected) return { ok: false, error: lastError };
  }
  try {
    await getOwnerDb().collection('daily_reports').updateOne(
      { payment_date: snapshot.payment_date },
      { $set: snapshot },
      { upsert: true },
    );
    return { ok: true };
  } catch (err) {
    lastError = err.message;
    return { ok: false, error: err.message };
  }
}

export async function listReportsFromMongo(limit = 60) {
  if (!isMongoReady()) {
    const connected = await connectMongo();
    if (!connected) return null;
  }
  try {
    return getOwnerDb().collection('daily_reports')
      .find({})
      .sort({ payment_date: -1 })
      .limit(limit)
      .toArray();
  } catch (err) {
    lastError = err.message;
    return null;
  }
}

export async function getReportFromMongo(date) {
  if (!isMongoReady()) {
    const connected = await connectMongo();
    if (!connected) return null;
  }
  try {
    return getOwnerDb().collection('daily_reports').findOne({ payment_date: date });
  } catch (err) {
    lastError = err.message;
    return null;
  }
}

export async function countReportsFromMongo() {
  if (!isMongoReady()) {
    const connected = await connectMongo();
    if (!connected) return null;
  }
  try {
    return getOwnerDb().collection('daily_reports').countDocuments();
  } catch (err) {
    lastError = err.message;
    return null;
  }
}

export async function syncCafeToMongo(snapshot) {
  if (!isMongoReady()) {
    const connected = await connectMongo();
    if (!connected) return { ok: false, error: lastError };
  }
  try {
    await getOwnerDb().collection('cafe_reports').updateOne(
      { month_key: snapshot.month_key },
      { $set: snapshot },
      { upsert: true },
    );
    return { ok: true };
  } catch (err) {
    lastError = err.message;
    return { ok: false, error: err.message };
  }
}

export async function listCafeMonthsFromMongo() {
  if (!isMongoReady()) {
    const connected = await connectMongo();
    if (!connected) return null;
  }
  try {
    return getOwnerDb().collection('cafe_reports')
      .find({}, {
        projection: {
          month_key: 1,
          period_from: 1,
          period_to: 1,
          business_name: 1,
          grand_qty: 1,
          grand_total: 1,
          source_filename: 1,
          uploaded_at: 1,
          label: 1,
        },
      })
      .sort({ month_key: -1 })
      .toArray();
  } catch (err) {
    lastError = err.message;
    return null;
  }
}

export async function getCafeReportFromMongo(monthKey) {
  if (!isMongoReady()) {
    const connected = await connectMongo();
    if (!connected) return null;
  }
  try {
    return getOwnerDb().collection('cafe_reports').findOne({ month_key: monthKey });
  } catch (err) {
    lastError = err.message;
    return null;
  }
}

export async function syncReviewToMongo(review) {
  if (!isMongoReady()) {
    const connected = await connectMongo();
    if (!connected) return { ok: false, error: lastError };
  }
  try {
    await getOwnerDb().collection('customer_reviews').updateOne(
      { review_id: review.review_id },
      { $set: review },
      { upsert: true },
    );
    return { ok: true };
  } catch (err) {
    lastError = err.message;
    return { ok: false, error: err.message };
  }
}

export async function getLatestUnreadReviewFromMongo() {
  if (!isMongoReady()) {
    const connected = await connectMongo();
    if (!connected) return null;
  }
  try {
    const fromReviews = await getOwnerDb().collection('customer_reviews').findOne(
      { read_by_owner: { $ne: true } },
      { sort: { created_at: -1, review_id: -1 } },
    );
    if (fromReviews) return fromReviews;

    const legacy = await getOwnerDb().collection('daily_reports').findOne(
      {
        payment_date: { $regex: /^review-/ },
        read_by_owner: { $ne: true },
      },
      { sort: { created_at: -1, payment_date: -1 } },
    );
    return legacyReportToReview(legacy);
  } catch (err) {
    lastError = err.message;
    return null;
  }
}

export async function markReviewReadInMongo(reviewId) {
  if (!isMongoReady()) {
    const connected = await connectMongo();
    if (!connected) return { ok: false, error: lastError };
  }
  try {
    await getOwnerDb().collection('customer_reviews').updateOne(
      { review_id: reviewId },
      { $set: { read_by_owner: true } },
    );
    await getOwnerDb().collection('daily_reports').updateOne(
      { payment_date: `review-${reviewId}` },
      { $set: { read_by_owner: true } },
    );
    return { ok: true };
  } catch (err) {
    lastError = err.message;
    return { ok: false, error: err.message };
  }
}

export async function listReviewsFromMongo(limit = 50) {
  if (!isMongoReady()) {
    const connected = await connectMongo();
    if (!connected) return null;
  }
  try {
    const fromReviews = await getOwnerDb().collection('customer_reviews')
      .find({})
      .sort({ created_at: -1, review_id: -1 })
      .limit(limit)
      .toArray();

    const legacyRows = await getOwnerDb().collection('daily_reports')
      .find({ payment_date: { $regex: /^review-/ } })
      .sort({ created_at: -1, payment_date: -1 })
      .limit(limit)
      .toArray();

    const byId = new Map();
    for (const row of legacyRows) {
      const review = legacyReportToReview(row);
      if (review) byId.set(review.review_id, review);
    }
    for (const row of fromReviews) {
      if (row?.review_id) byId.set(row.review_id, row);
    }

    return [...byId.values()].sort(
      (a, b) => String(b.created_at || b.review_id).localeCompare(String(a.created_at || a.review_id)),
    );
  } catch (err) {
    lastError = err.message;
    return null;
  }
}

export async function syncPtDraftToMongo(draft) {
  if (!isMongoReady()) {
    const connected = await connectMongo();
    if (!connected) return { ok: false, error: lastError };
  }
  try {
    const { _id, ...payload } = draft;
    await getOwnerDb().collection('pt_client_drafts').updateOne(
      { draft_id: payload.draft_id },
      { $set: payload },
      { upsert: true },
    );
    return { ok: true };
  } catch (err) {
    lastError = err.message;
    return { ok: false, error: err.message };
  }
}

export async function listPtDraftsFromMongo({ status = 'pending', trainerId } = {}) {
  if (!isMongoReady()) {
    const connected = await connectMongo();
    if (!connected) return null;
  }
  try {
    const filter = {};
    if (status && status !== 'all') {
      filter.status = Array.isArray(status) ? { $in: status } : status;
    }
    if (trainerId) filter.trainer_id = trainerId;
    return getOwnerDb().collection('pt_client_drafts')
      .find(filter)
      .sort({ updated_at: -1, created_at: -1 })
      .toArray();
  } catch (err) {
    lastError = err.message;
    return null;
  }
}

export async function getPtDraftFromMongo(draftId) {
  if (!isMongoReady()) {
    const connected = await connectMongo();
    if (!connected) return null;
  }
  try {
    return getOwnerDb().collection('pt_client_drafts').findOne({ draft_id: draftId });
  } catch (err) {
    lastError = err.message;
    return null;
  }
}

export async function updatePtDraftStatusInMongo(draftId, status, extra = {}) {
  if (!isMongoReady()) {
    const connected = await connectMongo();
    if (!connected) return { ok: false, error: lastError };
  }
  try {
    await getOwnerDb().collection('pt_client_drafts').updateOne(
      { draft_id: draftId },
      { $set: { status, updated_at: new Date().toISOString(), ...extra } },
    );
    return { ok: true };
  } catch (err) {
    lastError = err.message;
    return { ok: false, error: err.message };
  }
}

export async function syncTrainerToMongo(trainer) {
  if (!isMongoReady()) {
    const connected = await connectMongo();
    if (!connected) return { ok: false, error: lastError };
  }
  try {
    await getOwnerDb().collection('pt_trainers').updateOne(
      { trainer_id: trainer.id },
      {
        $set: {
          trainer_id: trainer.id,
          name: trainer.name,
          name_lower: trainer.name.toLowerCase().trim(),
          phone: trainer.phone || '',
          specializations: trainer.specializations || '',
          updated_at: new Date().toISOString(),
        },
      },
      { upsert: true },
    );
    return { ok: true };
  } catch (err) {
    lastError = err.message;
    return { ok: false, error: err.message };
  }
}

export async function findTrainerInMongoByName(name) {
  if (!isMongoReady()) {
    const connected = await connectMongo();
    if (!connected) return null;
  }
  try {
    return getOwnerDb().collection('pt_trainers').findOne({
      name_lower: name.toLowerCase().trim(),
    });
  } catch (err) {
    lastError = err.message;
    return null;
  }
}
