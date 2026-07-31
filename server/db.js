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
    sport TEXT NOT NULL CHECK(sport IN ('cricket', 'football', 'badminton', 'cricket_ball')),
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
    sport TEXT NOT NULL CHECK(sport IN ('cricket', 'football', 'badminton', 'cricket_ball')),
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
      sport TEXT CHECK(sport IS NULL OR sport IN ('cricket', 'football', 'badminton', 'cricket_ball')),
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
      sport TEXT NOT NULL CHECK(sport IN ('cricket', 'football', 'badminton', 'cricket_ball')),
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
    plan_type TEXT NOT NULL CHECK(plan_type IN ('11_sessions', '22_sessions', '1_month', '3_month')),
    start_date TEXT NOT NULL,
    base_end_date TEXT NOT NULL,
    total_amount REAL DEFAULT 0,
    advance_gpay REAL DEFAULT 0,
    advance_cash REAL DEFAULT 0,
    advance_date TEXT,
    balance_gpay REAL DEFAULT 0,
    balance_cash REAL DEFAULT 0,
    balance_date TEXT,
    status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'READY_FOR_PAYMENT')),
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

  CREATE TABLE IF NOT EXISTS customer_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT DEFAULT '',
    happiness INTEGER NOT NULL CHECK(happiness BETWEEN 1 AND 5),
    comment TEXT NOT NULL,
    read_by_owner INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS _app_migrations (
    key TEXT PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
  );
`);

const ptEndDate45 = db.prepare("SELECT key FROM _app_migrations WHERE key = 'pt_clients_end_date_45'").get();
if (!ptEndDate45) {
  const result = db.prepare(`
    UPDATE pt_clients
    SET base_end_date = date(start_date, '+45 days')
  `).run();
  db.prepare("INSERT INTO _app_migrations (key) VALUES ('pt_clients_end_date_45')").run();
  if (result.changes > 0) {
    console.log(`PT clients: updated ${result.changes} end date(s) to start + 45 days`);
  }
}

const ptManualReopenCol = db.prepare('PRAGMA table_info(pt_clients)').all()
  .some((col) => col.name === 'manual_reopen');
if (!ptManualReopenCol) {
  db.exec('ALTER TABLE pt_clients ADD COLUMN manual_reopen INTEGER DEFAULT 0');
  console.log('PT clients: added manual_reopen column for undo complete');
}

const ptReadyPayment = db.prepare("SELECT key FROM _app_migrations WHERE key = 'pt_ready_for_payment'").get();
if (!ptReadyPayment) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`
    CREATE TABLE pt_clients_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trainer_id INTEGER NOT NULL REFERENCES pt_trainers(id),
      client_name TEXT NOT NULL,
      pt_goal TEXT NOT NULL,
      plan_type TEXT NOT NULL CHECK(plan_type IN ('11_sessions', '22_sessions', '1_month', '3_month')),
      start_date TEXT NOT NULL,
      base_end_date TEXT NOT NULL,
      total_amount REAL DEFAULT 0,
      advance_gpay REAL DEFAULT 0,
      advance_cash REAL DEFAULT 0,
      advance_date TEXT,
      balance_gpay REAL DEFAULT 0,
      balance_cash REAL DEFAULT 0,
      balance_date TEXT,
      status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'READY_FOR_PAYMENT')),
      notes TEXT DEFAULT '',
      completed_at TEXT,
      manual_reopen INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO pt_clients_new (
      id, trainer_id, client_name, pt_goal, plan_type, start_date, base_end_date,
      total_amount, advance_gpay, advance_cash, advance_date,
      balance_gpay, balance_cash, balance_date, status, notes, completed_at, manual_reopen, created_at
    )
    SELECT
      id, trainer_id, client_name, pt_goal, plan_type, start_date, base_end_date,
      total_amount, advance_gpay, advance_cash, advance_date,
      balance_gpay, balance_cash, balance_date,
      CASE WHEN status = 'COMPLETED' THEN 'READY_FOR_PAYMENT' ELSE status END,
      notes, completed_at, COALESCE(manual_reopen, 0), created_at
    FROM pt_clients;
    DROP TABLE pt_clients;
    ALTER TABLE pt_clients_new RENAME TO pt_clients;
  `);
  db.exec('PRAGMA foreign_keys = ON');
  db.prepare("INSERT INTO _app_migrations (key) VALUES ('pt_ready_for_payment')").run();
  console.log('PT clients: migrated to READY_FOR_PAYMENT status');
}

const ptCyclesTable = db.prepare("SELECT key FROM _app_migrations WHERE key = 'pt_cycles'").get();
if (!ptCyclesTable) {
  db.exec(`
    CREATE TABLE pt_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES pt_clients(id),
      trainer_id INTEGER NOT NULL REFERENCES pt_trainers(id),
      client_name TEXT NOT NULL,
      plan_type TEXT NOT NULL CHECK(plan_type IN ('11_sessions', '22_sessions', '1_month', '3_month')),
      pt_goal TEXT NOT NULL,
      start_date TEXT NOT NULL,
      base_end_date TEXT NOT NULL,
      total_amount REAL DEFAULT 0,
      advance_gpay REAL DEFAULT 0,
      advance_cash REAL DEFAULT 0,
      advance_date TEXT,
      balance_gpay REAL DEFAULT 0,
      balance_cash REAL DEFAULT 0,
      balance_date TEXT,
      completed_at TEXT,
      notes TEXT DEFAULT '',
      session_count INTEGER DEFAULT 0,
      sessions_json TEXT NOT NULL DEFAULT '[]',
      freezes_json TEXT NOT NULL DEFAULT '[]',
      status TEXT DEFAULT 'READY_FOR_PAYMENT' CHECK(status IN ('READY_FOR_PAYMENT', 'PAID')),
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_pt_cycles_trainer ON pt_cycles(trainer_id, status);
    CREATE INDEX idx_pt_cycles_client ON pt_cycles(client_id);
  `);
  db.prepare("INSERT INTO _app_migrations (key) VALUES ('pt_cycles')").run();
  console.log('PT cycles: created archive table for completed/restarted PT');
}

const pt11Sessions = db.prepare("SELECT key FROM _app_migrations WHERE key = 'pt_11_sessions'").get();
if (!pt11Sessions) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`
    CREATE TABLE pt_clients_11 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trainer_id INTEGER NOT NULL REFERENCES pt_trainers(id),
      client_name TEXT NOT NULL,
      pt_goal TEXT NOT NULL,
      plan_type TEXT NOT NULL CHECK(plan_type IN ('11_sessions', '22_sessions', '1_month', '3_month')),
      start_date TEXT NOT NULL,
      base_end_date TEXT NOT NULL,
      total_amount REAL DEFAULT 0,
      advance_gpay REAL DEFAULT 0,
      advance_cash REAL DEFAULT 0,
      advance_date TEXT,
      balance_gpay REAL DEFAULT 0,
      balance_cash REAL DEFAULT 0,
      balance_date TEXT,
      status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'READY_FOR_PAYMENT')),
      notes TEXT DEFAULT '',
      completed_at TEXT,
      manual_reopen INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO pt_clients_11 (
      id, trainer_id, client_name, pt_goal, plan_type, start_date, base_end_date,
      total_amount, advance_gpay, advance_cash, advance_date,
      balance_gpay, balance_cash, balance_date, status, notes, completed_at, manual_reopen, created_at
    )
    SELECT
      id, trainer_id, client_name, pt_goal, plan_type, start_date, base_end_date,
      total_amount, advance_gpay, advance_cash, advance_date,
      balance_gpay, balance_cash, balance_date, status, notes, completed_at,
      COALESCE(manual_reopen, 0), created_at
    FROM pt_clients;
    DROP TABLE pt_clients;
    ALTER TABLE pt_clients_11 RENAME TO pt_clients;
  `);

  const hasCycles = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pt_cycles'
  `).get();
  if (hasCycles) {
    db.exec(`
      CREATE TABLE pt_cycles_11 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL REFERENCES pt_clients(id),
        trainer_id INTEGER NOT NULL REFERENCES pt_trainers(id),
        client_name TEXT NOT NULL,
        plan_type TEXT NOT NULL CHECK(plan_type IN ('11_sessions', '22_sessions', '1_month', '3_month')),
        pt_goal TEXT NOT NULL,
        start_date TEXT NOT NULL,
        base_end_date TEXT NOT NULL,
        total_amount REAL DEFAULT 0,
        advance_gpay REAL DEFAULT 0,
        advance_cash REAL DEFAULT 0,
        advance_date TEXT,
        balance_gpay REAL DEFAULT 0,
        balance_cash REAL DEFAULT 0,
        balance_date TEXT,
        completed_at TEXT,
        notes TEXT DEFAULT '',
        session_count INTEGER DEFAULT 0,
        sessions_json TEXT NOT NULL DEFAULT '[]',
        freezes_json TEXT NOT NULL DEFAULT '[]',
        status TEXT DEFAULT 'READY_FOR_PAYMENT' CHECK(status IN ('READY_FOR_PAYMENT', 'PAID')),
        created_at TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO pt_cycles_11 (
        id, client_id, trainer_id, client_name, plan_type, pt_goal,
        start_date, base_end_date, total_amount,
        advance_gpay, advance_cash, advance_date,
        balance_gpay, balance_cash, balance_date,
        completed_at, notes, session_count, sessions_json, freezes_json, status, created_at
      )
      SELECT
        id, client_id, trainer_id, client_name, plan_type, pt_goal,
        start_date, base_end_date, total_amount,
        advance_gpay, advance_cash, advance_date,
        balance_gpay, balance_cash, balance_date,
        completed_at, notes, session_count, sessions_json, freezes_json, status, created_at
      FROM pt_cycles;
      DROP TABLE pt_cycles;
      ALTER TABLE pt_cycles_11 RENAME TO pt_cycles;
      CREATE INDEX IF NOT EXISTS idx_pt_cycles_trainer ON pt_cycles(trainer_id, status);
      CREATE INDEX IF NOT EXISTS idx_pt_cycles_client ON pt_cycles(client_id);
    `);
  }

  db.exec('PRAGMA foreign_keys = ON');
  db.prepare("INSERT INTO _app_migrations (key) VALUES ('pt_11_sessions')").run();
  console.log('PT plans: added 11_sessions plan type');
}

const onlinePaymentChannels = db.prepare(
  "SELECT key FROM _app_migrations WHERE key = 'online_payment_channels_v1'",
).get();
if (!onlinePaymentChannels) {
  const onlineCols = db.prepare('PRAGMA table_info(online_bookings)').all().map((col) => col.name);
  if (!onlineCols.includes('advance_method')) {
    db.exec("ALTER TABLE online_bookings ADD COLUMN advance_method TEXT DEFAULT 'DIRECT_GPAY'");
  }
  if (!onlineCols.includes('advance_expected_credit_date')) {
    db.exec('ALTER TABLE online_bookings ADD COLUMN advance_expected_credit_date TEXT');
  }
  if (!onlineCols.includes('balance_method')) {
    db.exec("ALTER TABLE online_bookings ADD COLUMN balance_method TEXT DEFAULT 'DIRECT_GPAY'");
  }
  if (!onlineCols.includes('balance_expected_credit_date')) {
    db.exec('ALTER TABLE online_bookings ADD COLUMN balance_expected_credit_date TEXT');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS online_settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      credit_date TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'MIXED'
        CHECK(source IN ('MPAY', 'ONLINE_PAY', 'MIXED')),
      from_date TEXT NOT NULL,
      to_date TEXT NOT NULL,
      gross_amount REAL NOT NULL DEFAULT 0,
      received_amount REAL NOT NULL DEFAULT 0,
      commission_amount REAL NOT NULL DEFAULT 0,
      reference TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS online_settlement_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      settlement_id INTEGER NOT NULL
        REFERENCES online_settlements(id) ON DELETE CASCADE,
      online_booking_id INTEGER NOT NULL
        REFERENCES online_bookings(id) ON DELETE RESTRICT,
      payment_stage TEXT NOT NULL
        CHECK(payment_stage IN ('advance', 'balance')),
      expected_amount REAL NOT NULL DEFAULT 0,
      received_amount REAL NOT NULL DEFAULT 0,
      commission_amount REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_online_settlements_credit_date
      ON online_settlements(credit_date);
    CREATE INDEX IF NOT EXISTS idx_online_allocations_booking
      ON online_settlement_allocations(online_booking_id, payment_stage);
  `);

  db.prepare(`
    UPDATE online_bookings
    SET advance_method = 'DIRECT_GPAY'
    WHERE advance_method IS NULL OR advance_method = ''
  `).run();
  db.prepare(`
    UPDATE online_bookings
    SET balance_method = 'DIRECT_GPAY'
    WHERE balance_method IS NULL OR balance_method = ''
  `).run();

  db.prepare(
    "INSERT INTO _app_migrations (key) VALUES ('online_payment_channels_v1')",
  ).run();
  console.log('Online payments: added channels, expected credit dates, and settlements');
}

const bookingLinkGroup = db.prepare(
  "SELECT key FROM _app_migrations WHERE key = 'booking_link_group_v1'",
).get();
if (!bookingLinkGroup) {
  const bookingCols = db.prepare('PRAGMA table_info(bookings)').all().map((col) => col.name);
  if (!bookingCols.includes('link_group_id')) {
    db.exec('ALTER TABLE bookings ADD COLUMN link_group_id TEXT');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_bookings_link_group ON bookings(link_group_id)');
  db.prepare("INSERT INTO _app_migrations (key) VALUES ('booking_link_group_v1')").run();
  console.log('Bookings: added link_group_id for same-day linked sports');
}

const sportCricketBall = db.prepare(
  "SELECT key FROM _app_migrations WHERE key = 'sport_cricket_ball_v1'",
).get();
if (!sportCricketBall) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`
    CREATE TABLE bookings_sport_v1 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sport TEXT NOT NULL CHECK(sport IN ('cricket', 'football', 'badminton', 'cricket_ball')),
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
      created_at TEXT DEFAULT (datetime('now')),
      link_group_id TEXT
    );
    INSERT INTO bookings_sport_v1 (
      id, name, sport, match_date, total, time_slot,
      advance_gpay, advance_cash, advance_date,
      balance_gpay, balance_cash, balance_date,
      status, remarks, created_at, link_group_id
    )
    SELECT
      id, name, sport, match_date, total, time_slot,
      advance_gpay, advance_cash, advance_date,
      balance_gpay, balance_cash, balance_date,
      status, remarks, created_at, link_group_id
    FROM bookings;
    DROP TABLE bookings;
    ALTER TABLE bookings_sport_v1 RENAME TO bookings;
    CREATE INDEX IF NOT EXISTS idx_bookings_link_group ON bookings(link_group_id);
  `);

  const onlineCols = db.prepare('PRAGMA table_info(online_bookings)').all().map((c) => c.name);
  const hasAdvanceMethod = onlineCols.includes('advance_method');
  db.exec(`
    CREATE TABLE online_bookings_sport_v1 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sport TEXT NOT NULL CHECK(sport IN ('cricket', 'football', 'badminton', 'cricket_ball')),
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
      created_at TEXT DEFAULT (datetime('now')),
      advance_method TEXT DEFAULT 'DIRECT_GPAY',
      advance_expected_credit_date TEXT,
      balance_method TEXT DEFAULT 'DIRECT_GPAY',
      balance_expected_credit_date TEXT
    );
  `);
  if (hasAdvanceMethod) {
    db.exec(`
      INSERT INTO online_bookings_sport_v1 (
        id, name, sport, match_date, total, time_slot,
        advance_gpay, advance_cash, advance_date,
        balance_gpay, balance_cash, balance_date,
        status, remarks, created_at,
        advance_method, advance_expected_credit_date,
        balance_method, balance_expected_credit_date
      )
      SELECT
        id, name, sport, match_date, total, time_slot,
        advance_gpay, advance_cash, advance_date,
        balance_gpay, balance_cash, balance_date,
        status, remarks, created_at,
        COALESCE(advance_method, 'DIRECT_GPAY'), advance_expected_credit_date,
        COALESCE(balance_method, 'DIRECT_GPAY'), balance_expected_credit_date
      FROM online_bookings;
    `);
  } else {
    db.exec(`
      INSERT INTO online_bookings_sport_v1 (
        id, name, sport, match_date, total, time_slot,
        advance_gpay, advance_cash, advance_date,
        balance_gpay, balance_cash, balance_date,
        status, remarks, created_at
      )
      SELECT
        id, name, sport, match_date, total, time_slot,
        advance_gpay, advance_cash, advance_date,
        balance_gpay, balance_cash, balance_date,
        status, remarks, created_at
      FROM online_bookings;
    `);
  }
  db.exec(`
    DROP TABLE online_bookings;
    ALTER TABLE online_bookings_sport_v1 RENAME TO online_bookings;
  `);

  const bulkExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='bulk_packages'",
  ).get();
  if (bulkExists) {
    db.exec(`
      CREATE TABLE bulk_packages_sport_v1 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL CHECK(category IN ('turf', 'online', 'gym')),
        name TEXT NOT NULL,
        sport TEXT CHECK(sport IS NULL OR sport IN ('cricket', 'football', 'badminton', 'cricket_ball')),
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
      INSERT INTO bulk_packages_sport_v1 (
        id, category, name, sport, total_hours, total_amount, plan_months,
        advance_gpay, advance_cash, advance_date,
        balance_gpay, balance_cash, balance_date,
        status, remarks, created_at
      )
      SELECT
        id, category, name, sport, total_hours, total_amount, plan_months,
        advance_gpay, advance_cash, advance_date,
        balance_gpay, balance_cash, balance_date,
        status, remarks, created_at
      FROM bulk_packages;
      DROP TABLE bulk_packages;
      ALTER TABLE bulk_packages_sport_v1 RENAME TO bulk_packages;
    `);
  }

  db.exec('PRAGMA foreign_keys = ON');
  db.prepare("INSERT INTO _app_migrations (key) VALUES ('sport_cricket_ball_v1')").run();
  console.log('Sports: added cricket_ball');
}

export default db;
