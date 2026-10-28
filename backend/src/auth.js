import { promisify } from 'node:util';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { pool } from './config/database.js';

const scrypt = promisify(scryptCallback);
const COOKIE = 'hlb_session';
const SESSION_MS = 12 * 60 * 60 * 1000;
const hashToken = token => createHash('sha256').update(token).digest('hex');

// Secure cookies are required in production unless the deployment terminates
// TLS elsewhere. Set COOKIE_SECURE=false only for plain-HTTP local/docker use.
const secureFlag = () => {
  const raw = process.env.COOKIE_SECURE ?? (process.env.NODE_ENV === 'production' ? 'true' : 'false');
  return String(raw).toLowerCase() === 'true' ? '; Secure' : '';
};

const failedLogins = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

export function loginBlockedFor(username) {
  const entry = failedLogins.get(username);
  if (!entry) return 0;
  if (Date.now() >= entry.resetAt) { failedLogins.delete(username); return 0; }
  if (entry.count < LOGIN_MAX_ATTEMPTS) return 0;
  return Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000));
}

export function registerFailedLogin(username) {
  const now = Date.now();
  const entry = failedLogins.get(username);
  if (!entry || now >= entry.resetAt) failedLogins.set(username, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  else entry.count += 1;
  if (failedLogins.size > 5000) {
    for (const [key, value] of failedLogins) if (now >= value.resetAt) failedLogins.delete(key);
  }
}

export function clearFailedLogins(username) {
  failedLogins.delete(username);
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${Buffer.from(derived).toString('hex')}`;
}

async function verifyPassword(password, encoded) {
  const [, salt, expectedHex] = String(encoded).split(':');
  if (!salt || !expectedHex) return false;
  const actual = Buffer.from(await scrypt(password, salt, 64));
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function sessionCookie(token, maxAge = SESSION_MS) {
  return `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${Math.floor(maxAge / 1000)}${secureFlag()}`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secureFlag()}`;
}

export async function createSession(userId, res) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_MS);
  await pool.query('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)', [hashToken(token), userId, expires]);
  res.setHeader('Set-Cookie', sessionCookie(token));
}

export async function requireAuth(req, res, next) {
  try {
    const token = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    if (!token) return res.status(401).json({ error: 'Sign in required' });
    const { rows } = await pool.query(
      `SELECT u.id,u.username,u.display_name AS name,u.role FROM sessions s
       JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.active=TRUE`,
      [hashToken(token)],
    );
    if (!rows.length) return res.status(401).json({ error: 'Session expired' });
    req.user = rows[0];
    next();
  } catch (error) { next(error); }
}

export function allowRoles(...roles) {
  return (req, res, next) => roles.includes(req.user.role)
    ? next() : res.status(403).json({ error: 'Not authorized' });
}

export async function login(username, password) {
  const { rows } = await pool.query('SELECT * FROM users WHERE username=$1 AND active=TRUE', [username]);
  if (!rows.length || !(await verifyPassword(password, rows[0].password_hash))) return null;
  const { id, username: name, display_name, role } = rows[0];
  return { id, username: name, name: display_name, role };
}

export { COOKIE, hashToken };
