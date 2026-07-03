import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const dbPath = path.join(__dirname, 'data.db');
const db = new Database(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sport TEXT NOT NULL CHECK(sport IN ('cricket', 'football', 'badminton')),
    match_date TEXT NOT NULL,
    total REAL NOT NULL,
    time_slot TEXT NOT NULL,
    advance_gpay REAL DEFAULT 0,
    advance_cash REAL DEFAULT 0,
    advance_date TEXT,
    balance_gpay REAL DEFAULT 0,
    balance_cash REAL DEFAULT 0,
    balance_date TEXT,
    status TEXT DEFAULT 'PENDING' CHECK(status IN ('CLOSED', 'PENDING')),
    remarks TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS online_bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sport TEXT NOT NULL CHECK(sport IN ('cricket', 'football', 'badminton')),
    match_date TEXT NOT NULL,
    total REAL NOT NULL,
    time_slot TEXT NOT NULL,
    advance_gpay REAL DEFAULT 0,
    advance_cash REAL DEFAULT 0,
    advance_date TEXT,
    balance_gpay REAL DEFAULT 0,
    balance_cash REAL DEFAULT 0,
    balance_date TEXT,
    status TEXT DEFAULT 'PENDING' CHECK(status IN ('CLOSED', 'PENDING')),
    remarks TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS gym_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    plan_months INTEGER NOT NULL DEFAULT 1 CHECK(plan_months IN (1, 3, 6)),
    total REAL NOT NULL,
    personal_training_amount REAL DEFAULT 0,
    advance_gpay REAL DEFAULT 0,
    advance_cash REAL DEFAULT 0,
    advance_date TEXT,
    balance_gpay REAL DEFAULT 0,
    balance_cash REAL DEFAULT 0,
    balance_date TEXT,
    status TEXT DEFAULT 'PENDING' CHECK(status IN ('CLOSED', 'PENDING')),
    remarks TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

const bulkTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bulk_packages'").get();
if (!bulkTables) {
  db.exec(`
    CREATE TABLE bulk_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL CHECK(category IN ('turf', 'online', 'gym')),
      name TEXT NOT NULL,
      sport TEXT CHECK(sport IS NULL OR sport IN ('cricket', 'football', 'badminton')),
      total_hours REAL NOT NULL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      plan_months INTEGER,
      advance_gpay REAL DEFAULT 0,
      advance_cash REAL DEFAULT 0,
      advance_date TEXT,
      balance_gpay REAL DEFAULT 0,
      balance_cash REAL DEFAULT 0,
      balance_date TEXT,
      status TEXT DEFAULT 'PENDING' CHECK(status IN ('CLOSED', 'PENDING')),
      remarks TEXT DEFAULT 'bulk',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE bulk_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bulk_id INTEGER NOT NULL REFERENCES bulk_packages(id) ON DELETE CASCADE,
      session_date TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      hours REAL NOT NULL DEFAULT 0,
      remarks TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  console.log('Bulk tables created');
}

const fcTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='football_coaching'").get();
if (!fcTable) {
  db.exec(`
    CREATE TABLE football_coaching (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_name TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      coaching_month TEXT NOT NULL,
      period TEXT NOT NULL DEFAULT 'full' CHECK(period IN ('full', 'first_half', 'second_half')),
      total REAL NOT NULL,
      advance_gpay REAL DEFAULT 0,
      advance_cash REAL DEFAULT 0,
      advance_date TEXT,
      balance_gpay REAL DEFAULT 0,
      balance_cash REAL DEFAULT 0,
      balance_date TEXT,
      status TEXT DEFAULT 'PENDING' CHECK(status IN ('CLOSED', 'PENDING')),
      remarks TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  console.log('Football coaching table created');
}

const fcCols = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='football_coaching'").get()
  ? db.prepare('PRAGMA table_info(football_coaching)').all().map((c) => c.name)
  : [];
if (fcCols.length && !fcCols.includes('parent_name')) {
  db.exec(`ALTER TABLE football_coaching ADD COLUMN parent_name TEXT DEFAULT ''`);
  console.log('Added parent_name to football_coaching');
}
if (fcCols.length && !fcCols.includes('phone')) {
  db.exec(`ALTER TABLE football_coaching ADD COLUMN phone TEXT DEFAULT ''`);
  console.log('Added phone to football_coaching');
}

const gymCols = db.prepare('PRAGMA table_info(gym_entries)').all().map((c) => c.name);

if (gymCols.includes('gym_date')) {
  db.exec(`
    CREATE TABLE gym_entries_migrated (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      plan_months INTEGER NOT NULL DEFAULT 1 CHECK(plan_months IN (1, 3, 6)),
      total REAL NOT NULL,
      personal_training_amount REAL DEFAULT 0,
      advance_gpay REAL DEFAULT 0,
      advance_cash REAL DEFAULT 0,
      advance_date TEXT,
      balance_gpay REAL DEFAULT 0,
      balance_cash REAL DEFAULT 0,
      balance_date TEXT,
      status TEXT DEFAULT 'PENDING' CHECK(status IN ('CLOSED', 'PENDING')),
      remarks TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    INSERT INTO gym_entries_migrated (
      id, name, start_date, end_date, plan_months, total, personal_training_amount,
      advance_gpay, advance_cash, advance_date, balance_gpay, balance_cash, balance_date,
      status, remarks, created_at
    )
    SELECT
      id, name,
      COALESCE(start_date, gym_date),
      COALESCE(end_date, gym_date),
      COALESCE(plan_months, 1),
      total, personal_training_amount,
      advance_gpay, advance_cash, advance_date,
      balance_gpay, balance_cash, balance_date,
      status, remarks, created_at
    FROM gym_entries;

    DROP TABLE gym_entries;
    ALTER TABLE gym_entries_migrated RENAME TO gym_entries;
  `);
  console.log('Gym table migrated to start_date / end_date schema');
}

const onlineCols = db.prepare('PRAGMA table_info(online_bookings)').all().map((c) => c.name);
const onlineTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('online_bookings', 'online_bookings_migrated')").all().map((t) => t.name);

if (onlineTables.includes('online_bookings_migrated') && onlineTables.includes('online_bookings')) {
  db.exec(`
    DROP TABLE online_bookings;
    ALTER TABLE online_bookings_migrated RENAME TO online_bookings;
  `);
  console.log('Online table migration completed (recovered partial state)');
} else if (onlineCols.includes('online_gpay')) {
  db.exec(`
    CREATE TABLE online_bookings_migrated (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sport TEXT NOT NULL CHECK(sport IN ('cricket', 'football', 'badminton')),
      match_date TEXT NOT NULL,
      total REAL NOT NULL,
      time_slot TEXT NOT NULL,
      advance_gpay REAL DEFAULT 0,
      advance_cash REAL DEFAULT 0,
      advance_date TEXT,
      balance_gpay REAL DEFAULT 0,
      balance_cash REAL DEFAULT 0,
      balance_date TEXT,
      status TEXT DEFAULT 'PENDING' CHECK(status IN ('CLOSED', 'PENDING')),
      remarks TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    INSERT INTO online_bookings_migrated (
      id, name, sport, match_date, total, time_slot,
      advance_gpay, advance_cash, advance_date,
      balance_gpay, balance_cash, balance_date,
      status, remarks, created_at
    )
    SELECT
      id, name, sport, match_date, total, time_slot,
      COALESCE(online_gpay, 0),
      COALESCE(online_cash, 0),
      online_date,
      0, 0, NULL,
      status, remarks, created_at
    FROM online_bookings;

    DROP TABLE online_bookings;
    ALTER TABLE online_bookings_migrated RENAME TO online_bookings;
  `);
  console.log('Online table migrated to advance/balance payment schema');
}

const ownerReportsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='owner_daily_reports'").get();
if (!ownerReportsTable) {
  db.exec(`
    CREATE TABLE owner_daily_reports (
      payment_date TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      pushed_at TEXT NOT NULL
    );
  `);
  console.log('Owner daily reports table created');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS pt_trainers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    specializations TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pt_clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trainer_id INTEGER NOT NULL REFERENCES pt_trainers(id),
    client_name TEXT NOT NULL,
    pt_goal TEXT NOT NULL,
    plan_type TEXT NOT NULL CHECK(plan_type IN ('22_sessions', '1_month', '3_month')),
    start_date TEXT NOT NULL,
    base_end_date TEXT NOT NULL,
    total_amount REAL DEFAULT 0,
    advance_gpay REAL DEFAULT 0,
    advance_cash REAL DEFAULT 0,
    advance_date TEXT,
    balance_gpay REAL DEFAULT 0,
    balance_cash REAL DEFAULT 0,
    balance_date TEXT,
    status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'COMPLETED')),
    notes TEXT DEFAULT '',
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pt_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES pt_clients(id) ON DELETE CASCADE,
    session_date TEXT NOT NULL,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(client_id, session_date)
  );

  CREATE TABLE IF NOT EXISTS pt_freezes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES pt_clients(id) ON DELETE CASCADE,
    freeze_from TEXT NOT NULL,
    freeze_to TEXT NOT NULL,
    days_count INTEGER NOT NULL DEFAULT 0,
    reason TEXT NOT NULL,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cafe_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month_key TEXT NOT NULL UNIQUE,
    period_from TEXT NOT NULL,
    period_to TEXT NOT NULL,
    business_name TEXT DEFAULT '',
    source_filename TEXT DEFAULT '',
    grand_qty REAL DEFAULT 0,
    grand_total REAL DEFAULT 0,
    data TEXT NOT NULL,
    uploaded_at TEXT DEFAULT (datetime('now'))
  );
`);

export default db;
