import { getMysqlPool } from '../server/cafe24/mysql-pool.js';
import { migratePushSubscriptionRecordKeys } from '../server/cafe24/push-subscription-key.js';

const pool = getMysqlPool();

try {
  const result = await migratePushSubscriptionRecordKeys(pool);
  console.log('[PushSubscriptionKeyMigration]', result);
} finally {
  await pool.end();
}
