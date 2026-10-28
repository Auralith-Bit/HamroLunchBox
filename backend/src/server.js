import 'dotenv/config';
import express from 'express';
import { pool } from './config/database.js';
import { hashPassword } from './auth.js';
import authRouter from './routes/auth.js';
import businessRouter from './routes/business.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '6mb' }));
app.use('/api/auth', authRouter);
app.use('/api/business', businessRouter);
app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'connected' }); }
  catch { res.status(503).json({ status: 'error', database: 'unavailable' }); }
});
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'The server could not complete this request' });
});

const bootstrapAdmin = async () => {
  const username = String(process.env.ADMIN_USERNAME || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  const name = String(process.env.ADMIN_NAME || 'Administrator').trim();
  if (!username || password.length < 12) throw new Error('Set ADMIN_USERNAME and an ADMIN_PASSWORD of at least 12 characters');
  const { rows } = await pool.query("SELECT id FROM users WHERE role='admin' LIMIT 1");
  if (rows.length) return;
  await pool.query('INSERT INTO users (username,display_name,password_hash,role) VALUES ($1,$2,$3,$4)', [username, name, await hashPassword(password), 'admin']);
  console.log(`Initial administrator created: ${username}`);
};

const port = Number(process.env.PORT || 3000);
await pool.query('SELECT 1');
await bootstrapAdmin();

const pruneSessions = async () => {
  try { await pool.query('DELETE FROM sessions WHERE expires_at < NOW()'); }
  catch (error) { console.error('Session cleanup failed:', error.message); }
};
await pruneSessions();
setInterval(pruneSessions, 60 * 60 * 1000).unref();

app.listen(port, '0.0.0.0', () => console.log(`Hamro Lunch Box API listening on port ${port}`));

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  await pool.end();
  process.exit(0);
});
