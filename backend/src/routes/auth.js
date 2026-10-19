import { Router } from 'express';
import { pool } from '../config/database.js';
import { allowRoles, clearFailedLogins, clearSessionCookie, createSession, hashPassword, hashToken, login, loginBlockedFor, registerFailedLogin, requireAuth } from '../auth.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!username || !password || password.length > 256) return res.status(400).json({ error: 'Enter username and password' });
    const blockedSeconds = loginBlockedFor(username);
    if (blockedSeconds) return res.status(429).json({ error: `Too many failed sign-in attempts. Try again in ${Math.ceil(blockedSeconds / 60)} minute(s).` });
    const user = await login(username, password);
    if (!user) {
      registerFailedLogin(username);
      console.warn(`Rejected sign-in attempt for username "${username}"`);
      return res.status(401).json({ error: 'Username or password is incorrect' });
    }
    clearFailedLogins(username);
    await createSession(user.id, res);
    res.json({ user });
  } catch (error) { next(error); }
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const token = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('hlb_session='))?.slice('hlb_session='.length);
    if (token) await pool.execute('DELETE FROM sessions WHERE token_hash=?', [hashToken(token)]);
    res.setHeader('Set-Cookie', clearSessionCookie());
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.get('/me', requireAuth, (req, res) => {
  const { id, username, name, role } = req.user;
  res.json({ user: { id, username, name, role } });
});

router.post('/password', requireAuth, async (req, res, next) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (newPassword.length < 12 || newPassword.length > 256) return res.status(400).json({ error: 'Choose a new password with at least 12 characters' });
    const user = await login(req.user.username, currentPassword);
    if (!user) return res.status(400).json({ error: 'Current password is incorrect' });
    await pool.execute('UPDATE users SET password_hash=? WHERE id=?', [await hashPassword(newPassword), req.user.id]);
    const token = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('hlb_session='))?.slice('hlb_session='.length);
    if (token) await pool.execute('DELETE FROM sessions WHERE user_id=? AND token_hash<>?', [req.user.id, hashToken(token)]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.get('/users', requireAuth, allowRoles('admin','reception'), async (_req, res, next) => {
  try {
    const [users] = await pool.query('SELECT id,username,display_name AS name,role,active,created_at AS createdAt FROM users ORDER BY id');
    res.json({ users });
  } catch (error) { next(error); }
});

router.post('/users', requireAuth, allowRoles('admin'), async (req, res, next) => {
  try {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim();
    const password = String(req.body?.password || '');
    const role = req.body?.role;
    if (!/^[a-z0-9._-]{3,64}$/.test(username) || !name || name.length > 120 || password.length < 12 || !['admin','reception','delivery'].includes(role)) {
      return res.status(400).json({ error: 'Use a valid username, name, role and a password of at least 12 characters' });
    }
    const [result] = await pool.execute('INSERT INTO users (username,display_name,password_hash,role) VALUES (?,?,?,?)', [username, name, await hashPassword(password), role]);
    res.status(201).json({ user: { id: result.insertId, username, name, role, active: 1 } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That username already exists' });
    next(error);
  }
});

router.patch('/users/:id', requireAuth, allowRoles('admin'), async (req, res, next) => {
  try {
    const active = req.body?.active === true;
    if (Number(req.params.id) === req.user.id && !active) return res.status(400).json({ error: 'You cannot disable your own account' });
    const [result] = await pool.execute('UPDATE users SET active=? WHERE id=?', [active, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'User not found' });
    if (!active) await pool.execute('DELETE FROM sessions WHERE user_id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

export default router;
