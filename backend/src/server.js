
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
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({
      status: 'error',
      database: 'unavailable'
    });
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    error: 'The server could not complete this request'
  });
});

const bootstrapAdmin = async () => {
  const username = String(
    process.env.ADMIN_USERNAME || ''
  ).trim().toLowerCase();

  const password = String(
    process.env.ADMIN_PASSWORD || ''
  );

  const name = String(
    process.env.ADMIN_NAME || 'Administrator'
  ).trim();

  const resetPassword =
    String(process.env.RESET_ADMIN_PASSWORD || '')
      .trim()
      .toLowerCase() === 'true';

  if (!username || password.length < 12) {
    throw new Error(
      'Set ADMIN_USERNAME and an ADMIN_PASSWORD of at least 12 characters'
    );
  }

  const { rows } = await pool.query(
    "SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1"
  );

  const passwordHash = await hashPassword(password);

  if (rows.length > 0) {
    if (!resetPassword) {
      console.log(
        'Administrator already exists; password was not changed.'
      );
      return;
    }

    await pool.query(
      `UPDATE users
       SET username = $1,
           display_name = $2,
           password_hash = $3
       WHERE id = $4`,
      [username, name, passwordHash, rows[0].id]
    );

    console.log(
      'Administrator credentials reset successfully.'
    );
    return;
  }

  await pool.query(
    `INSERT INTO users
      (username, display_name, password_hash, role)
     VALUES ($1, $2, $3, $4)`,
    [username, name, passwordHash, 'admin']
  );

  console.log(`Initial administrator created: ${username}`);
};

const pruneSessions = async () => {
  try {
    await pool.query(
      'DELETE FROM sessions WHERE expires_at < NOW()'
    );
  } catch (error) {
    console.error('Session cleanup failed:', error.message);
  }
};

const port = Number(process.env.PORT || 3000);

await pool.query('SELECT 1');
await bootstrapAdmin();
await pruneSessions();

setInterval(pruneSessions, 60 * 60 * 1000).unref();

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Hamro Lunch Box API listening on port ${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    server.close();
    await pool.end();
    process.exit(0);
  });
}
