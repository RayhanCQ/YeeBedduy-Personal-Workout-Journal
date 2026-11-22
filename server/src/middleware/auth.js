import { authClient } from '../config/supabase.js';

export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'A Bearer access token is required.' });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ message: 'Your session is invalid or has expired.' });
  req.user = data.user;
  next();
}
