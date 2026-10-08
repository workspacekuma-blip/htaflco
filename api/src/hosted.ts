// One free web instance runs the existing API and ranking loop. No idle keep-alive traffic.
import { app } from './server';
import { config } from './config';
import { pool } from './db';
import { runOnce, startRankingLoop } from './ranking/worker';
import { startReplyEmailLoop } from './reply-emails';
import { startMediaCleanupLoop } from './private-media';

export async function startHostedServer(port = config.port, host = '0.0.0.0') {
  // Do not accept traffic before the database schema and first ranking run succeed.
  await runOnce(true);
  const server = app.listen(port, host);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve); server.once('error', reject);
  });
  const stopRanking = startRankingLoop();
  const stopEmails = startReplyEmailLoop();
  const stopMedia = startMediaCleanupLoop();
  let closing: Promise<void> | undefined;
  const close = () => closing ??= (async () => {
    await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
    await stopRanking();
    await stopEmails();
    await stopMedia();
    await pool.end();
  })();
  return { server, close };
}

if (require.main === module) {
  startHostedServer().then((host) => {
    console.log(`HTAFL API and rankings listening on port ${config.port}`);
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      process.once(signal, () => { void host.close().catch(() => { process.exitCode = 1; }); });
    }
  }).catch(() => {
    console.error('Hosted startup failed. Check database connection and schema.');
    void pool.end().finally(() => { process.exitCode = 1; });
  });
}
