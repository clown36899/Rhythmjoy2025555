import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCafe24TableRows, saveCafe24TableRow } from '../server/cafe24/generic-data-api.js';
import { getMysqlPool } from '../server/cafe24/mysql-pool.js';

export async function baselineNotificationQueue(processedAt = new Date().toISOString()) {
  const pendingRows = (await loadCafe24TableRows('notification_queue'))
    .filter((row) => String(row.status || 'pending') === 'pending');

  for (const row of pendingRows) {
    await saveCafe24TableRow('notification_queue', {
      ...row,
      status: 'expired',
      attempt_count: Number(row.attempt_count || 0),
      next_attempt_at: null,
      processed_at: processedAt,
      result: {
        status: 'expired',
        reason: 'pre_delivery_rollout_baseline',
        message: 'Existing queue item suppressed before notification delivery rollout.',
        push: { targets: 0, sent: 0 },
        inbox: { targets: 0, saved: 0 },
      },
    }, ['id']);
  }

  return {
    status: 'ok',
    suppressedPendingItems: pendingRows.length,
    processedAt,
  };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    console.log(JSON.stringify(await baselineNotificationQueue()));
  } finally {
    await getMysqlPool().end();
  }
}
