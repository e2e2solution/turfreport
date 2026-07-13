import db from './db.js';

const rows = db.prepare(`
  SELECT c.id, c.client_name, c.status, c.start_date, c.completed_at, t.name AS trainer
  FROM pt_clients c
  JOIN pt_trainers t ON t.id = c.trainer_id
  WHERE c.client_name LIKE ?
`).all('%Jyothish%');

console.log('client:', JSON.stringify(rows, null, 2));
if (rows[0]) {
  console.log('sessions:', db.prepare('SELECT COUNT(*) as n FROM pt_sessions WHERE client_id=?').get(rows[0].id));
}
console.log('ready:', db.prepare("SELECT id, client_name, status FROM pt_clients WHERE status='READY_FOR_PAYMENT'").all());
console.log('all statuses:', db.prepare('SELECT status, COUNT(*) as n FROM pt_clients GROUP BY status').all());
