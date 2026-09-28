import { getOwnerDb, isMongoReady, connectMongo } from './mongo.js';

export const COLLECTIONS = [
  'bookings',
  'online_bookings',
  'online_settlements',
  'online_settlement_allocations',
  'gym_entries',
  'bulk_packages',
  'bulk_sessions',
  'football_coaching',
  'pt_trainers',
  'pt_clients',
  'pt_sessions',
  'pt_freezes',
  'pt_cycles',
  'cafe_reports',
  'customer_reviews',
  'daily_reports',
  'pt_client_drafts',
  'counters',
];

export async function requireDb() {
  if (!isMongoReady()) {
    const db = await connectMongo();
    if (!db) throw new Error('MongoDB is not connected');
  }
  return getOwnerDb();
}

export function col(name) {
  const db = getOwnerDb();
  if (!db) throw new Error('MongoDB is not connected');
  return db.collection(name);
}

/** Strip Mongo `_id` for API responses that historically used SQLite rows. */
export function clean(doc) {
  if (!doc) return null;
  if (Array.isArray(doc)) return doc.map(clean);
  const { _id, ...rest } = doc;
  return rest;
}

export async function nextId(collectionName) {
  const db = await requireDb();
  const result = await db.collection('counters').findOneAndUpdate(
    { _id: collectionName },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  // Driver 6+: returns document directly; older drivers return { value }
  const doc = result && result.seq != null ? result : result?.value;
  if (!doc?.seq) {
    throw new Error(`Failed to allocate next id for ${collectionName}`);
  }
  return doc.seq;
}

export async function setCounterMin(collectionName, minValue) {
  const db = await requireDb();
  const current = await db.collection('counters').findOne({ _id: collectionName });
  const seq = Math.max(Number(minValue) || 0, current?.seq || 0);
  await db.collection('counters').updateOne(
    { _id: collectionName },
    { $set: { seq } },
    { upsert: true },
  );
  return seq;
}

export async function findMany(name, filter = {}, options = {}) {
  await requireDb();
  let cursor = col(name).find(filter);
  if (options.sort) cursor = cursor.sort(options.sort);
  if (options.limit) cursor = cursor.limit(options.limit);
  if (options.projection) cursor = cursor.project(options.projection);
  return clean(await cursor.toArray());
}

export async function findOne(name, filter) {
  await requireDb();
  return clean(await col(name).findOne(filter));
}

export async function insertOne(name, doc) {
  await requireDb();
  const id = doc.id != null ? Number(doc.id) : await nextId(name);
  const row = { ...doc, id };
  await col(name).insertOne(row);
  return clean(row);
}

export async function updateOne(name, filter, patch) {
  await requireDb();
  await col(name).updateOne(filter, { $set: patch });
  return findOne(name, filter);
}

export async function replaceOne(name, filter, doc, { upsert = false } = {}) {
  await requireDb();
  const { _id, ...payload } = doc;
  await col(name).replaceOne(filter, payload, { upsert });
  return findOne(name, filter);
}

export async function deleteOne(name, filter) {
  await requireDb();
  const result = await col(name).deleteOne(filter);
  return result.deletedCount > 0;
}

export async function deleteMany(name, filter) {
  await requireDb();
  const result = await col(name).deleteMany(filter);
  return result.deletedCount;
}

export async function count(name, filter = {}) {
  await requireDb();
  return col(name).countDocuments(filter);
}

/** Match advance/balance payment dates (replaces SQL appendAnyPayment). */
export function paymentDateFilter(from, to, singleDate) {
  if (singleDate) {
    return {
      $or: [
        {
          $and: [
            { advance_date: singleDate },
            { $or: [{ advance_gpay: { $gt: 0 } }, { advance_cash: { $gt: 0 } }] },
          ],
        },
        {
          $and: [
            { balance_date: singleDate },
            { $or: [{ balance_gpay: { $gt: 0 } }, { balance_cash: { $gt: 0 } }] },
          ],
        },
      ],
    };
  }
  if (from && to) {
    return {
      $or: [
        {
          $and: [
            { advance_date: { $gte: from, $lte: to } },
            { $or: [{ advance_gpay: { $gt: 0 } }, { advance_cash: { $gt: 0 } }] },
          ],
        },
        {
          $and: [
            { balance_date: { $gte: from, $lte: to } },
            { $or: [{ balance_gpay: { $gt: 0 } }, { balance_cash: { $gt: 0 } }] },
          ],
        },
      ],
    };
  }
  return {};
}

export function nameLikeFilter(name) {
  const q = String(name || '').trim();
  if (!q) return {};
  return { name: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } };
}

export async function ensureIndexes() {
  const db = await requireDb();
  const jobs = [
    db.collection('bookings').createIndexes([
      { key: { id: 1 }, unique: true },
      { key: { match_date: -1 } },
      { key: { status: 1 } },
      { key: { link_group_id: 1 } },
      { key: { advance_date: 1 } },
      { key: { balance_date: 1 } },
      { key: { name: 1 } },
    ]),
    db.collection('online_bookings').createIndexes([
      { key: { id: 1 }, unique: true },
      { key: { match_date: -1 } },
      { key: { status: 1 } },
      { key: { advance_date: 1 } },
      { key: { balance_date: 1 } },
    ]),
    db.collection('online_settlements').createIndexes([
      { key: { id: 1 }, unique: true },
      { key: { credit_date: -1 } },
    ]),
    db.collection('online_settlement_allocations').createIndexes([
      { key: { id: 1 }, unique: true },
      { key: { settlement_id: 1 } },
      { key: { online_booking_id: 1 } },
    ]),
    db.collection('gym_entries').createIndexes([
      { key: { id: 1 }, unique: true },
      { key: { start_date: -1 } },
      { key: { status: 1 } },
      { key: { link_group_id: 1 } },
    ]),
    db.collection('bulk_packages').createIndexes([
      { key: { id: 1 }, unique: true },
      { key: { category: 1 } },
      { key: { status: 1 } },
    ]),
    db.collection('bulk_sessions').createIndexes([
      { key: { id: 1 }, unique: true },
      { key: { bulk_id: 1 } },
      { key: { session_date: 1 } },
    ]),
    db.collection('football_coaching').createIndexes([
      { key: { id: 1 }, unique: true },
      { key: { coaching_month: -1 } },
    ]),
    db.collection('pt_trainers').createIndexes([
      { key: { id: 1 }, unique: true },
      { key: { trainer_id: 1 } },
      { key: { name_lower: 1 } },
    ]),
    db.collection('pt_clients').createIndexes([
      { key: { id: 1 }, unique: true },
      { key: { trainer_id: 1 } },
      { key: { status: 1 } },
    ]),
    db.collection('pt_sessions').createIndexes([
      { key: { id: 1 }, unique: true },
      { key: { client_id: 1, session_date: 1 }, unique: true },
    ]),
    db.collection('pt_freezes').createIndexes([
      { key: { id: 1 }, unique: true },
      { key: { client_id: 1 } },
    ]),
    db.collection('pt_cycles').createIndexes([
      { key: { id: 1 }, unique: true },
      { key: { client_id: 1 } },
    ]),
    db.collection('cafe_reports').createIndexes([
      { key: { month_key: 1 }, unique: true },
    ]),
    db.collection('customer_reviews').createIndexes([
      { key: { id: 1 }, unique: true },
      { key: { review_id: 1 } },
      { key: { created_at: -1 } },
    ]),
    db.collection('daily_reports').createIndexes([
      { key: { payment_date: 1 }, unique: true },
    ]),
    db.collection('pt_client_drafts').createIndexes([
      { key: { draft_id: 1 }, unique: true },
      { key: { trainer_id: 1 } },
      { key: { status: 1 } },
    ]),
  ];
  await Promise.all(jobs);
}
