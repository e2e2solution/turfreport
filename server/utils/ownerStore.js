import { syncReportToMongo, getReportFromMongo, listReportsFromMongo, countReportsFromMongo } from '../db/mongo.js';

export async function saveOwnerReport(snapshot) {
  const result = await syncReportToMongo(snapshot);
  if (!result.ok) throw new Error(result.error || 'Failed to save owner report');
  return snapshot;
}

export async function listOwnerReports(limit = 60) {
  return (await listReportsFromMongo(limit)) || [];
}

export async function getOwnerReport(date) {
  return getReportFromMongo(date);
}

export async function countOwnerReports() {
  return (await countReportsFromMongo()) || 0;
}
