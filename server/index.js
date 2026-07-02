import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth.js';
import bookingsRouter from './routes/bookings.js';
import onlineRouter from './routes/online.js';
import gymRouter from './routes/gym.js';
import reportRouter from './routes/report.js';
import summaryRouter from './routes/summary.js';
import footballCoachingRouter from './routes/footballCoaching.js';
import bulkRouter from './routes/bulk.js';
import backupRouter from './routes/backup.js';
import ownerRouter from './routes/owner.js';
import { authMiddleware } from './middleware/auth.js';
import { runBackups, backupMiddleware } from './utils/backup.js';
import { connectMongo, isMongoReady, getMongoError } from './db/mongo.js';

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mongo: isMongoReady(),
    mongo_error: isMongoReady() ? null : getMongoError(),
    env: isProd ? 'production' : 'development',
  });
});
app.use('/api', backupMiddleware);
app.use('/api/auth', authRouter);
app.use('/api/owner', ownerRouter);

app.use('/api/bookings', authMiddleware, bookingsRouter);
app.use('/api/online', authMiddleware, onlineRouter);
app.use('/api/gym', authMiddleware, gymRouter);
app.use('/api/bulk', authMiddleware, bulkRouter);
app.use('/api/football-coaching', authMiddleware, footballCoachingRouter);
app.use('/api/report', authMiddleware, reportRouter);
app.use('/api/summary', authMiddleware, summaryRouter);
app.use('/api/backup', authMiddleware, backupRouter);

if (isProd) {
  const clientDist = path.join(__dirname, '../client/dist');
  app.get('/owner', (_req, res) => {
    res.sendFile(path.join(clientDist, 'owner.html'));
  });
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

connectMongo().catch((err) => {
  console.error('MongoDB background connect failed:', err.message);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}${isProd ? ' (production)' : ''}`);
  if (isProd) {
    console.log('Owner mobile app:', `http://localhost:${PORT}/owner.html`);
  }
  if (!isProd) {
    try {
      const result = runBackups();
      if (result.daily || result.weekly) {
        console.log('Backup folder:', 'server/backups/');
      } else {
        console.log('Backups up to date for today');
      }
    } catch (err) {
      console.error('Startup backup failed:', err.message);
    }
  }
});