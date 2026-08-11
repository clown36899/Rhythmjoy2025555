import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCafe24TableRows } from '../server/cafe24/generic-data-api.js';
import { getMysqlPool } from '../server/cafe24/mysql-pool.js';
import { normalizeNotificationPreferences } from '../server/cafe24/notification-preferences.js';
import {
  buildDailyDigestItems,
  buildDailyDigestPayload,
  eventMatchesDigestPrefs,
  eventStartsOnNotificationDate,
} from '../server/cafe24/push-api.js';

export const DAILY_OCCURRENCE_RECONCILIATION_ID =
  '2026-08-11-daily-notification-start-date-reconciliation-v2';

function parseData(value) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

function normalizeDateKey(value) {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export function buildDailyNotificationReconciliation(notification, preference, allEvents = []) {
  const data = parseData(notification?.data_json);
  const dateKey = normalizeDateKey(data.date || notification?.source_id);
  if (!dateKey || !preference) return { action: 'mark-read', reason: 'missing-context' };

  const prefs = normalizeNotificationPreferences(preference);
  if (!prefs.enabled || !prefs.pref_today_digest) {
    return { action: 'mark-read', reason: 'route-disabled' };
  }

  const events = allEvents
    .filter((event) => eventStartsOnNotificationDate(event, dateKey))
    .filter((event) => eventMatchesDigestPrefs(event, prefs));
  if (events.length === 0 && prefs.pref_only_with_events) {
    return { action: 'mark-read', reason: 'no-events' };
  }

  const payload = JSON.parse(buildDailyDigestPayload(events, dateKey));
  return {
    action: 'update',
    dateKey,
    eventCount: events.length,
    title: payload.title,
    body: payload.body,
    url: payload.data?.url || `/calendar?date=${dateKey}&scrollToToday=true&category=all`,
    data: {
      ...data,
      ...payload.data,
      notificationKind: 'daily_schedule',
      items: buildDailyDigestItems(events, dateKey),
    },
  };
}

export async function reconcileDailyNotificationOccurrences({
  pool = getMysqlPool(),
  allEvents,
} = {}) {
  const events = allEvents || await loadCafe24TableRows('events');
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
      [DAILY_OCCURRENCE_RECONCILIATION_ID],
    );
    if (Number(markerResult?.affectedRows || 0) === 0) {
      if (transactionStarted) await connection.commit();
      return { status: 'already-applied', scanned: 0, updated: 0, markedRead: 0 };
    }

    const [preferenceRows] = await connection.execute(
      'SELECT * FROM user_notification_preferences',
    );
    const preferencesByUser = new Map(
      preferenceRows.map((row) => [String(row.user_id), row]),
    );
    const [notificationRows] = await connection.execute(`
      SELECT id, user_id, source_id, data_json
        FROM user_notifications
       WHERE kind = 'daily_schedule' AND is_read = 0
       ORDER BY id ASC
    `);

    let updated = 0;
    let markedRead = 0;
    const changes = [];
    for (const notification of notificationRows) {
      const result = buildDailyNotificationReconciliation(
        notification,
        preferencesByUser.get(String(notification.user_id)),
        events,
      );
      if (result.action === 'mark-read') {
        const [writeResult] = await connection.execute(
          `UPDATE user_notifications
              SET is_read = 1, read_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ? AND is_read = 0`,
          [notification.id, String(notification.user_id)],
        );
        markedRead += Number(writeResult?.affectedRows || 0);
        changes.push({ id: Number(notification.id), action: result.action, reason: result.reason });
        continue;
      }

      const [writeResult] = await connection.execute(
        `UPDATE user_notifications
            SET title = ?, body = ?, url = ?, data_json = ?
          WHERE id = ? AND user_id = ? AND is_read = 0`,
        [
          result.title,
          result.body,
          result.url,
          JSON.stringify(result.data),
          notification.id,
          String(notification.user_id),
        ],
      );
      updated += Number(writeResult?.affectedRows || 0);
      changes.push({ id: Number(notification.id), action: result.action, eventCount: result.eventCount });
    }

    if (transactionStarted) await connection.commit();
    return {
      status: 'applied',
      scanned: notificationRows.length,
      updated,
      markedRead,
      changes,
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
    console.log(JSON.stringify(await reconcileDailyNotificationOccurrences()));
  } finally {
    await getMysqlPool().end();
  }
}
