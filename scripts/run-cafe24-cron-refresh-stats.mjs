import dotenv from 'dotenv';
import path from 'node:path';
import { getMysqlPool } from '../server/cafe24/mysql-pool.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), quiet: true });
try {
  const { refreshClosedAnalyticsReports } = await import('../dist-cafe24/analytics-reports.mjs');
  const result = await refreshClosedAnalyticsReports();
  console.log('[cafe24:cron] closed analytics reports', JSON.stringify(result ?? { skipped: 'already_running' }));
} catch (error) {
  console.error('[cafe24:cron] analytics close failed:', error.message);
  process.exitCode = 1;
} finally {
  await getMysqlPool().end();
}
