import { Router } from 'express';
import { listBackups, runBackups } from '../utils/backup.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(listBackups());
});

router.post('/run', async (_req, res) => {
  try {
    const result = await runBackups();
    res.json({ success: true, ...result, backups: listBackups() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
