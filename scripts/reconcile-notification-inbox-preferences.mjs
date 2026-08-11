import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMysqlPool } from '../server/cafe24/mysql-pool.js';
import { normalizeNotificationPreferences } from '../server/cafe24/notification-preferences.js';

export const NOTIFICATION_ROUTE_RECONCILIATION_ID =
  '2026-08-11-notification-route-boundary-cleanup-v1';

function parseData(value) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

function matchesNewEventCategory(category, prefs) {
  const normalized = String(category || '').toLowerCase();
  if (normalized === 'class' || normalized === 'regular') return prefs.pref_new_event_class;
  if (normalized === 'club') return prefs.pref_new_event_clubs;
  return prefs.pref_new_event_social;
}

export function notificationMatchesNewEventPreference(notification, preference) {
  if (!preference) return false;
  const prefs = normalizeNotificationPreferences(preference);
  if (!prefs.enabled || !prefs.pref_new_event_alerts) return false;

  const activationTime = Date.parse(String(preference.new_event_enabled_at || ''));
  const notificationTime = Date.parse(String(notification.created_at || ''));
  if (!Number.isFinite(activationTime) || !Number.isFinite(notificationTime)) return false;
  if (notificationTime < activationTime) return false;

  const data = parseData(notification.data_json);
  return matchesNewEventCategory(data.category, prefs);
}

export async function reconcileNotificationInboxPreferences(pool = getMysqlPool()) {
  const connection = typeof pool.getConnection === 'function'
    ? await pool.getConnection()
    : pool;
  let transactionStarted = false;

  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS notification_data_migrations (
        migration_id VARCHAR(128) NOT NULL PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    if (typeof connection.beginTransaction === 'function') {
      await connection.beginTransaction();
      transactionStarted = true;
    }
    const [markerResult] = await connection.execute(
      'INSERT IGNORE INTO notification_data_migrations (migration_id) VALUES (?)',
      [NOTIFICATION_ROUTE_RECONCILIATION_ID],
    );
    if (Number(markerResult?.affectedRows || 0) === 0) {
      if (transactionStarted) await connection.commit();
      return { status: 'already-applied', scanned: 0, markedRead: 0 };
    }

    const [preferenceRows] = await connection.execute(
      'SELECT * FROM user_notification_preferences',
    );
    const preferencesByUser = new Map(
      preferenceRows.map((row) => [String(row.user_id), row]),
    );
    const [notificationRows] = await connection.execute(`
      SELECT id, user_id, data_json, created_at
        FROM user_notifications
       WHERE kind = 'new_event' AND is_read = 0
       ORDER BY id ASC
    `);
    const idsToMarkRead = notificationRows
      .filter((row) => !notificationMatchesNewEventPreference(
        row,
        preferencesByUser.get(String(row.user_id)),
      ))
      .map((row) => Number(row.id))
      .filter(Number.isFinite);

    let markedRead = 0;
    for (let offset = 0; offset < idsToMarkRead.length; offset += 200) {
      const ids = idsToMarkRead.slice(offset, offset + 200);
      const placeholders = ids.map(() => '?').join(',');
      const [result] = await connection.execute(
        `UPDATE user_notifications
            SET is_read = 1, read_at = CURRENT_TIMESTAMP
          WHERE is_read = 0 AND id IN (${placeholders})`,
        ids,
      );
      markedRead += Number(result?.affectedRows || 0);
    }

    if (transactionStarted) await connection.commit();
    return {
      status: 'applied',
      scanned: notificationRows.length,
      markedRead,
      preservedUnread: notificationRows.length - idsToMarkRead.length,
    };
  } catch (error) {
    if (transactionStarted && typeof connection.rollback === 'function') {
      await connection.rollback();
    }
    throw error;
  } finally {
    if (connection !== pool && typeof connection.release === 'function') connection.release();
  }
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    console.log(JSON.stringify(await reconcileNotificationInboxPreferences()));
  } finally {
    await getMysqlPool().end();
  }
}
