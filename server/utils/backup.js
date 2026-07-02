import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { dbPath } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_ROOT = path.join(__dirname, '..', 'backups');
const DAILY_DIR = path.join(BACKUP_ROOT, 'daily');
const WEEKLY_DIR = path.join(BACKUP_ROOT, 'weekly');
const STATE_FILE = path.join(BACKUP_ROOT, '.backup-state.json');

const DAILY_KEEP = 30;
const WEEKLY_KEEP = 12;

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

function copyDatabase(destPath) {
  db.backup(destPath);
}

function pruneDir(dir, keep) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => ({ name: f, time: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time);

  for (const file of files.slice(keep)) {
    fs.unlinkSync(path.join(dir, file.name));
  }
}

export function runBackups() {
  if (!fs.existsSync(dbPath)) {
    console.log('Backup skipped: database file not found');
    return { daily: false, weekly: false };
  }

  ensureDirs();
  const today = todayISO();
  const weekKey = weekStartISO(today);
  const state = readState();
  const result = { daily: false, weekly: false, dailyFile: null, weeklyFile: null };

  if (state.lastDaily !== today) {
    const dailyFile = path.join(DAILY_DIR, `data_${today}.db`);
    copyDatabase(dailyFile);
    state.lastDaily = today;
    result.daily = true;
    result.dailyFile = dailyFile;
    console.log(`Daily backup saved: ${dailyFile}`);
    pruneDir(DAILY_DIR, DAILY_KEEP);
  }

  if (state.lastWeekly !== weekKey) {
    const weeklyFile = path.join(WEEKLY_DIR, `data_week_${weekKey}.db`);
    copyDatabase(weeklyFile);
    state.lastWeekly = weekKey;
    result.weekly = true;
    result.weeklyFile = weeklyFile;
    console.log(`Weekly backup saved: ${weeklyFile}`);
    pruneDir(WEEKLY_DIR, WEEKLY_KEEP);
  }

  writeState(state);
  return result;
}

export function listBackups() {
  ensureDirs();
  const list = (dir) => fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort().reverse()
    : [];

  return {
    root: BACKUP_ROOT,
    daily: list(DAILY_DIR),
    weekly: list(WEEKLY_DIR),
    state: readState(),
  };
}

let checkedToday = null;

export function backupMiddleware(req, res, next) {
  const today = todayISO();
  if (checkedToday !== today) {
    checkedToday = today;
    try {
      runBackups();
    } catch (err) {
      console.error('Backup error:', err.message);
    }
  }
  next();
}
