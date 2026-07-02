import {
  isMongoReady, connectMongo, listReportsFromMongo, getReportFromMongo, countReportsFromMongo,
} from '../db/mongo.js';
import { listOwnerReports, getOwnerReport, countOwnerReports } from './ownerStore.js';

const mongoPrimary = () => process.env.NODE_ENV === 'production' || process.env.OWNER_MONGO_PRIMARY === 'true';

export async function listOwnerReportsAsync(limit = 60) {
  const fromMongo = await listReportsFromMongo(limit);
  if (fromMongo !== null) {
    if (fromMongo.length > 0 || mongoPrimary()) return fromMongo;
  }
  return listOwnerReports(limit);
}

export async function getOwnerReportAsync(date) {
  const fromMongo = await getReportFromMongo(date);
  if (fromMongo) return fromMongo;
  if (mongoPrimary()) return null;
  return getOwnerReport(date);
}

export async function countOwnerReportsAsync() {
  const fromMongo = await countReportsFromMongo();
  if (fromMongo !== null && (fromMongo > 0 || mongoPrimary())) return fromMongo;
  return countOwnerReports();
}

export async function ensureMongoForOwner() {
  if (isMongoReady()) return true;
  return Boolean(await connectMongo());
}
