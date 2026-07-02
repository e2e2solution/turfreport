import { Router } from 'express';
import { listBackups, runBackups } from '../utils/backup.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(listBackups());
});

router.post('/run', (_req, res) => {
  try {
    const result = runBackups();
    res.json({ success: true, ...result, backups: listBackups() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
