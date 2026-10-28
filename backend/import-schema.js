
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const { Client } = pg;

const schemaPath = path.resolve('../database/schema.sql');

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.');
  process.exit(1);
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  const schema = fs.readFileSync(schemaPath, 'utf8');

  await client.connect();
  console.log('Connected to the configured database.');

  await client.query(schema);
  console.log('Schema imported successfully.');
} catch (error) {
  console.error('Import failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
