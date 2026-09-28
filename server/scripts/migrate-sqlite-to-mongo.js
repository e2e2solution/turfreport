/**
 * One-time migration: SQLite data.db + optional vsh_owner Mongo → vsh_app Mongo.
 *
 * Usage (from server/):
 *   node scripts/migrate-sqlite-to-mongo.js
 *
 * Requires MONGODB_URI and MONGODB_DB=vsh_app in server/.env
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import dns from 'dns';
import Database from 'better-sqlite3';
import { MongoClient } from 'mongodb';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch { /* ignore */ }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const SQLITE_PATH = path.join(__dirname, '../data.db');
const TABLES = [
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
];

function uriLooksValid(uri) {
  return uri
    && !uri.includes('YOUR_MONGODB_PASSWORD')
    && !uri.includes('<db_password>')
    && (uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://'));
}

function rowToDoc(table, row) {
  const doc = { ...row };
  if (table === 'owner_daily_reports') return null;
  if (table === 'cafe_reports' && typeof doc.data === 'string') {
    try {
      const parsed = JSON.parse(doc.data);
      Object.assign(doc, parsed);
      delete doc.data;
    } catch { /* keep raw */ }
  }
  if (table === 'pt_trainers') {
    doc.trainer_id = doc.id;
    doc.name_lower = String(doc.name || '').toLowerCase().trim();
  }
  if (table === 'customer_reviews') {
    doc.review_id = doc.id;
    doc.read_by_owner = Boolean(doc.read_by_owner);
  }
  if (table === 'pt_cycles' && typeof doc.sessions_json === 'string') {
    try { doc.sessions_json = JSON.parse(doc.sessions_json); } catch { /* keep */ }
  }
  if (table === 'pt_cycles' && typeof doc.freezes_json === 'string') {
    try { doc.freezes_json = JSON.parse(doc.freezes_json); } catch { /* keep */ }
  }
  return doc;
}

async function upsertById(col, doc) {
  if (doc.id == null) {
    await col.insertOne(doc);
    return;
  }
  const { _id, ...payload } = doc;
  await col.updateOne({ id: doc.id }, { $set: payload }, { upsert: true });
}

async function migrateSqlite(db) {
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const counts = {};

  for (const table of TABLES) {
    const exists = sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    ).get(table);
    if (!exists) {
      counts[table] = 0;
      continue;
    }
    const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
    const col = db.collection(table);
    let n = 0;
    for (const row of rows) {
      const doc = rowToDoc(table, row);
      if (!doc) continue;
      await upsertById(col, doc);
      n += 1;
    }
    counts[table] = n;

    if (rows.length) {
      const maxId = Math.max(...rows.map((r) => Number(r.id) || 0));
      await db.collection('counters').updateOne(
        { _id: table },
        { $max: { seq: maxId } },
        { upsert: true },
      );
    }
  }

  // owner_daily_reports → daily_reports
  const ownerExists = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='owner_daily_reports'",
  ).get();
  if (ownerExists) {
    const rows = sqlite.prepare('SELECT * FROM owner_daily_reports').all();
    let n = 0;
    for (const row of rows) {
      let snapshot;
      try {
        snapshot = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      } catch {
        snapshot = { payment_date: row.payment_date, raw: row.data };
      }
      if (!snapshot.payment_date) snapshot.payment_date = row.payment_date;
      if (row.pushed_at && !snapshot.pushed_at) snapshot.pushed_at = row.pushed_at;
      await db.collection('daily_reports').updateOne(
        { payment_date: snapshot.payment_date },
        { $set: snapshot },
        { upsert: true },
      );
      n += 1;
    }
    counts.daily_reports_from_sqlite = n;
  }

  sqlite.close();
  return counts;
}

async function mergeOwnerDb(client, targetDb) {
  const sourceName = 'vsh_owner';
  const source = client.db(sourceName);
  const cols = ['daily_reports', 'cafe_reports', 'customer_reviews', 'pt_client_drafts', 'pt_trainers'];
  const counts = {};
  for (const name of cols) {
    let n = 0;
    try {
      const docs = await source.collection(name).find({}).toArray();
      for (const doc of docs) {
        const { _id, ...payload } = doc;
        if (name === 'daily_reports' && payload.payment_date) {
          await targetDb.collection(name).updateOne(
            { payment_date: payload.payment_date },
            { $set: payload },
            { upsert: true },
          );
        } else if (name === 'cafe_reports' && payload.month_key) {
          await targetDb.collection(name).updateOne(
            { month_key: payload.month_key },
            { $set: payload },
            { upsert: true },
          );
        } else if (name === 'customer_reviews' && (payload.review_id != null || payload.id != null)) {
          const key = payload.review_id ?? payload.id;
          await targetDb.collection(name).updateOne(
            { $or: [{ review_id: key }, { id: key }] },
            { $set: { ...payload, review_id: key, id: payload.id ?? key } },
            { upsert: true },
          );
        } else if (name === 'pt_client_drafts' && payload.draft_id) {
          await targetDb.collection(name).updateOne(
            { draft_id: payload.draft_id },
            { $set: payload },
            { upsert: true },
          );
        } else if (name === 'pt_trainers') {
          const tid = payload.trainer_id ?? payload.id;
          if (tid == null) continue;
          await targetDb.collection(name).updateOne(
            { $or: [{ trainer_id: tid }, { id: tid }] },
            { $set: { ...payload, trainer_id: tid, id: payload.id ?? tid } },
            { upsert: true },
          );
        } else {
          await targetDb.collection(name).insertOne(payload);
        }
        n += 1;
      }
    } catch (err) {
      counts[`${name}_error`] = err.message;
    }
    counts[`merge_${name}`] = n;
  }
  return counts;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uriLooksValid(uri)) {
    console.error('Invalid or missing MONGODB_URI in server/.env');
    process.exit(1);
  }
  const dbName = process.env.MONGODB_DB || 'vsh_app';
  console.log(`Connecting to MongoDB db=${dbName}…`);
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const db = client.db(dbName);

  console.log(`Reading SQLite: ${SQLITE_PATH}`);
  const sqliteCounts = await migrateSqlite(db);
  console.log('SQLite → Mongo counts:', sqliteCounts);

  console.log('Merging from vsh_owner (if present)…');
  const mergeCounts = await mergeOwnerDb(client, db);
  console.log('Merge counts:', mergeCounts);

  console.log('Verification:');
  for (const table of [...TABLES, 'daily_reports', 'pt_client_drafts', 'counters']) {
    const n = await db.collection(table).countDocuments();
    console.log(`  ${table}: ${n}`);
  }

  await client.close();
  console.log('Migration complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
