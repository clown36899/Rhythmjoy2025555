import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCafe24TableRows,
} from '../server/cafe24/generic-data-api.js';
import { getMysqlPool } from '../server/cafe24/mysql-pool.js';
import {
  getUserNotificationPreferences,
  saveUserNotificationPreferences,
} from '../server/cafe24/notification-preferences.js';

export async function backfillNotificationPreferences({ resetExistingSubscriptions = false } = {}) {
  const rows = (await loadCafe24TableRows('user_push_subscriptions'))
    .filter((row) => row.user_id)
    .sort((left, right) => String(left.updated_at || '').localeCompare(String(right.updated_at || '')));
  const latestByUser = new Map(rows.map((row) => [String(row.user_id), row]));
  let migratedUsers = 0;
  let preservedUsers = 0;

  for (const [userId] of latestByUser) {
    const existing = await getUserNotificationPreferences(userId);
    if (existing && !resetExistingSubscriptions) {
      preservedUsers += 1;
      continue;
    }
    await saveUserNotificationPreferences(userId, {
      ...(existing || {}),
      enabled: false,
      pref_today_digest: false,
      pref_new_event_alerts: false,
    });
    migratedUsers += 1;
  }

  let deletedSubscriptions = 0;
  if (resetExistingSubscriptions && rows.length > 0) {
    const [result] = await getMysqlPool().execute(
      'DELETE FROM generic_records WHERE table_name = ?',
      ['user_push_subscriptions'],
    );
    deletedSubscriptions = Number(result?.affectedRows || 0);
  }

  return {
    migratedUsers,
    preservedUsers,
    subscriptionUsers: latestByUser.size,
    deletedSubscriptions,
  };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    console.log(JSON.stringify(await backfillNotificationPreferences({
      resetExistingSubscriptions: process.env.RESET_EXISTING_NOTIFICATION_SUBSCRIPTIONS === '1',
    })));
  } finally {
    await getMysqlPool().end();
  }
}
