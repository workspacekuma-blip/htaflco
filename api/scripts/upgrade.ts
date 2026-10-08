import { readFile } from 'node:fs/promises';
import { pool } from '../src/db';

async function upgrade() {
  for (const file of ['db/community-upgrade.sql', 'db/media-review-upgrade.sql']) {
    await pool.query(await readFile(file, 'utf8'));
    console.log(`Applied ${file}`);
  }
}
upgrade().catch(() => { console.error('Database upgrade failed. Check database access and schema.'); process.exitCode = 1; }).finally(() => pool.end());
