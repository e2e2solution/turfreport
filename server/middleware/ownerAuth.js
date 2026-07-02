import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'vathiyayath-sports-hub-secret';
const OWNER_PIN = process.env.OWNER_PIN || '123';

export function verifyOwnerPin(pin) {
  const entered = String(pin ?? '').trim();
  return entered.length > 0 && entered === String(OWNER_PIN).trim();
}

export function signOwnerToken() {
  return jwt.sign({ role: 'owner' }, JWT_SECRET, { expiresIn: '365d' });
}

export function ownerAuthMiddleware(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Owner login required' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'owner') return res.status(403).json({ error: 'Owner access only' });
    req.owner = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired' });
  }
}
