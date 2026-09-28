import { isMongoReady, connectMongo } from '../db/mongo.js';
import { listOwnerReports, getOwnerReport, countOwnerReports } from './ownerStore.js';

export async function listOwnerReportsAsync(limit = 60) {
  return listOwnerReports(limit);
}

export async function getOwnerReportAsync(date) {
  return getOwnerReport(date);
}

export async function countOwnerReportsAsync() {
  return countOwnerReports();
}

export async function ensureMongoForOwner() {
  if (isMongoReady()) return true;
  return Boolean(await connectMongo());
}
