import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { COLLECTIONS, findMany, requireDb } from '../db/collections.js';
import { isMongoReady } from '../db/mongo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_ROOT = path.join(__dirname, '..', 'backups');
const DAILY_DIR = path.join(BACKUP_ROOT, 'daily');
const WEEKLY_DIR = path.join(BACKUP_ROOT, 'weekly');
const STATE_FILE = path.join(BACKUP_ROOT, '.backup-state.json');

const DAILY_KEEP = 30;
const WEEKLY_KEEP = 12;

const DUMP_COLLECTIONS = COLLECTIONS.filter((c) => c !== 'counters');

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function weekStartISO(dateStr = todayISO()) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function ensureDirs() {
  fs.mkdirSync(DAILY_DIR, { recursive: true });
  fs.mkdirSync(WEEKLY_DIR, { recursive: true });
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastDaily: null, lastWeekly: null };
  }
}

function writeState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function exportMongoDump(destPath) {
  await requireDb();
  const dump = {
    exported_at: new Date().toISOString(),
    collections: {},
  };
  for (const name of DUMP_COLLECTIONS) {
    dump.collections[name] = await findMany(name, {});
  }
  fs.writeFileSync(destPath, JSON.stringify(dump, null, 2));
  return destPath;
}

function pruneDir(dir, keep, ext = '.json') {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => ({ name: f, time: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time);

  for (const file of files.slice(keep)) {
    fs.unlinkSync(path.join(dir, file.name));
  }
}

export async function runBackups() {
  if (!isMongoReady()) {
    console.log('Backup skipped: MongoDB not connected');
    return { daily: false, weekly: false, skipped: true };
  }

  ensureDirs();
  const today = todayISO();
  const weekKey = weekStartISO(today);
  const state = readState();
  const result = { daily: false, weekly: false, dailyFile: null, weeklyFile: null };

  if (state.lastDaily !== today) {
    const dailyFile = path.join(DAILY_DIR, `mongo_${today}.json`);
    await exportMongoDump(dailyFile);
    state.lastDaily = today;
    result.daily = true;
    result.dailyFile = dailyFile;
    console.log(`Daily Mongo dump saved: ${dailyFile}`);
    pruneDir(DAILY_DIR, DAILY_KEEP);
  }

  if (state.lastWeekly !== weekKey) {
    const weeklyFile = path.join(WEEKLY_DIR, `mongo_week_${weekKey}.json`);
    await exportMongoDump(weeklyFile);
    state.lastWeekly = weekKey;
    result.weekly = true;
    result.weeklyFile = weeklyFile;
    console.log(`Weekly Mongo dump saved: ${weeklyFile}`);
    pruneDir(WEEKLY_DIR, WEEKLY_KEEP);
  }

  writeState(state);
  return result;
}

export function listBackups() {
  ensureDirs();
  const list = (dir) => fs.existsSync(dir)
    ? fs.readdirSync(dir)
      .filter((f) => f.endsWith('.json') || f.endsWith('.db'))
      .sort()
      .reverse()
    : [];

  return {
    root: BACKUP_ROOT,
    daily: list(DAILY_DIR),
    weekly: list(WEEKLY_DIR),
    state: readState(),
  };
}

let checkedToday = null;
let backupInFlight = false;

export function backupMiddleware(req, res, next) {
  const today = todayISO();
  if (checkedToday !== today && !backupInFlight) {
    checkedToday = today;
    backupInFlight = true;
    runBackups()
      .catch((err) => console.error('Backup error:', err.message))
      .finally(() => { backupInFlight = false; });
  }
  next();
}
