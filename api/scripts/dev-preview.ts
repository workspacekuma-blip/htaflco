// Explicitly local-only fixtures. Never invoke against a hosted database.
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { config } from '../src/config';
import { pool, tx } from '../src/db';

async function preview() {
  const database = new URL(config.databaseUrl);
  if (config.isProd || !['localhost','127.0.0.1'].includes(database.hostname)) throw new Error('Local development only');
  const password = randomBytes(18).toString('base64url');
  const accounts: { id: string; email: string; password: string }[] = [];
  for (const [email,name,role] of [['preview-author@example.test','Local preview creator','member'],['preview-moderator@example.test','Local preview moderator','moderator']]) {
    const r = await pool.query(`INSERT INTO users(email,password_hash,email_verified,role) VALUES($1,$2,true,$3)
      ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash RETURNING id`, [email,await bcrypt.hash(password,12),role]);
    await pool.query(`INSERT INTO profiles(user_id,display_name,craft) VALUES($1,$2,'Art') ON CONFLICT(user_id) DO NOTHING`,[r.rows[0].id,name]);
    accounts.push({ id:r.rows[0].id,email,password });
  }
  await tx(async (c) => {
    const prompt = await c.query(`INSERT INTO weekly_prompts(week_start,title,body,scheduled_by)
      VALUES(date_trunc('week',now() AT TIME ZONE 'UTC')::date,'Local preview: keep making','DEV ONLY — What small thing are you making this week?',$1)
      ON CONFLICT(week_start) DO NOTHING RETURNING id`,[accounts[1].id]);
    const promptId = prompt.rows[0]?.id ?? (await c.query("SELECT id FROM weekly_prompts WHERE week_start=date_trunc('week',now() AT TIME ZONE 'UTC')::date")).rows[0].id;
    const existing = await c.query('SELECT 1 FROM posts WHERE author_id=$1',[accounts[0].id]);
    if (!existing.rowCount) await c.query(`INSERT INTO posts(author_id,title,body,response_label,challenge_id,craft)
      VALUES($1,'LOCAL PREVIEW — A small beginning',$2,'Encouragement',$3,'Art')`,[accounts[0].id,'I made something small today.\n\nThis longer paragraph appears only when you open the full post. This is local test content, never production content.',promptId]);
  });
  await writeFile('../../.local-tools/community-preview.local.json',JSON.stringify(accounts,null,2));
  console.log('Local-only preview accounts and prompt prepared. Credentials saved outside Git.');
}
preview().catch(()=>{ console.error('Local preview preparation failed.'); process.exitCode=1; }).finally(()=>pool.end());
