// Disposable LOCAL QA data only. Never imported by the application or run at startup.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from '../src/db';
import { runOnce } from '../src/ranking/worker';

const db = new URL(process.env.DATABASE_URL!);
if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1'].includes(db.hostname) ||
    process.env.APP_ORIGIN !== 'http://localhost:3001' || !process.argv.includes('--dev-only')) {
  throw new Error('Dev seed requires a loopback database, localhost APP_ORIGIN, and --dev-only');
}

async function seed() {
  const passwordHash = await bcrypt.hash('Local-only-QA-passphrase-2026', 12);
  const crafts = ['Art', 'Fashion', 'Music', 'Photography', 'Writing', 'Something else'];
  const users: string[] = [];
  for (let i = 0; i < 11; i++) {
    const email = `seed-${i}.qa@example.test`;
    const result = await pool.query(
      `INSERT INTO users(email,password_hash,email_verified,created_at) VALUES($1,$2,true,now()-interval '2 days')
       ON CONFLICT(email) DO UPDATE SET email_verified=true,created_at=now()-interval '2 days' RETURNING id`, [email, passwordHash]);
    const id = result.rows[0].id as string; users.push(id);
    await pool.query(`INSERT INTO profiles(user_id,display_name,craft) VALUES($1,$2,$3)
      ON CONFLICT(user_id) DO NOTHING`, [id, `Local QA seed ${i}`, crafts[i % crafts.length]]);
  }
  // Backdate only named local QA accounts, never every real member.
  await pool.query("UPDATE users SET created_at=now()-interval '2 days' WHERE email IN ('alice.qa@example.test','bob.qa@example.test')");
  for (let i = 0; i < 8; i++) {
    const body = `LOCAL QA ranking candidate ${i + 1}. Disposable test data.`;
    let id = (await pool.query('SELECT id FROM posts WHERE author_id=$1 AND body=$2', [users[i], body])).rows[0]?.id;
    if (!id) id = (await pool.query("INSERT INTO posts(author_id,body,pillar,craft) VALUES($1,$2,'Create',$3) RETURNING id", [users[i], body, crafts[i % crafts.length]])).rows[0].id;
    for (const voter of users.slice(8)) await pool.query(`INSERT INTO votes(post_id,user_id,value) VALUES($1,$2,1)
      ON CONFLICT(post_id,user_id) DO NOTHING`, [id, voter]);
    await pool.query(`UPDATE posts SET up=(SELECT count(*) FROM votes WHERE post_id=$1 AND value=1),
      down=(SELECT count(*) FROM votes WHERE post_id=$1 AND value=-1) WHERE id=$1`, [id]);
  }
  for (let i = 0; i < 18; i++) {
    const body = `LOCAL QA pagination post ${i + 1}. Disposable test data.`;
    await pool.query(`INSERT INTO posts(author_id,body,pillar,craft) SELECT $1,$2,'Connect',$3
      WHERE NOT EXISTS(SELECT 1 FROM posts WHERE author_id=$1 AND body=$2)`, [users[0], body, crafts[0]]);
  }
  await runOnce(true);
  console.log('Seeded labelled local QA posts, trusted votes and ranking snapshots. No production data created.');
}
seed().finally(() => pool.end());
