import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'vathiyayath-sports-hub-secret';
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'sebi';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'shyju';

export function verifyCredentials(username, password) {
  return username === AUTH_USERNAME && password === AUTH_PASSWORD;
}

export function signToken(username) {
  return jwt.sign({ username }, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required' });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Session expired, please login again' });

  req.user = payload;
  next();
}
