import { MongoClient } from 'mongodb';

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
