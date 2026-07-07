import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TRAINER_PASSWORD = process.env.TRAINER_PASSWORD || '123';

export function verifyTrainerPassword(password) {
  return String(password) === TRAINER_PASSWORD;
}

export function signTrainerToken(trainer) {
  return jwt.sign(
    { role: 'trainer', trainer_id: trainer.id, trainer_name: trainer.name },
    JWT_SECRET,
    { expiresIn: '90d' },
  );
}

export function trainerAuthMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Trainer login required' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'trainer' || !payload.trainer_id) {
      return res.status(401).json({ error: 'Invalid trainer token' });
    }
    req.trainer = {
      id: payload.trainer_id,
      name: payload.trainer_name,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Trainer session expired' });
  }
}
