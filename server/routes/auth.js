import { Router } from 'express';
import { verifyCredentials, signToken, authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (!verifyCredentials(username.trim(), password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  res.json({ token: signToken(username.trim()), username: username.trim() });
});

router.get('/me', authMiddleware, (req, res) => {
  res.json({ username: req.user.username });
});

export default router;
